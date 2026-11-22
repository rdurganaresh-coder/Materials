import { useState, useRef } from "react";

const TOPICS = [
  {
    id: 1,
    title: "Partitioning Strategy",
    icon: "⚡",
    color: "#f59e0b",
    bg: "#fffbeb",
    questions: [
      {
        q: "How does Kafka decide which partition a message goes to?",
        level: "SENIOR",
        answer: `Kafka uses three strategies:
1. Null key (round-robin/sticky): When key=null, distributes evenly across partitions using the Sticky Partitioner (Kafka 2.4+) for batching efficiency.
2. Key-based hash: murmur2(key) % numPartitions. Same key → ALWAYS same partition → guaranteed ordering per key.
3. Custom Partitioner: Business logic routing (priority lanes, geo-routing, VIP customers).`,
        code: `// 1. Key-based — same customerId always same partition
kafkaTemplate.send("orders", order.getCustomerId(), orderEvent);

// 2. Custom Partitioner — VIP customers to dedicated partitions
public class PriorityPartitioner implements Partitioner {
    private static final int VIP_PARTITIONS = 2; // partitions 0,1 = VIP

    @Override
    public int partition(String topic, Object key, byte[] keyBytes,
                         Object value, byte[] valueBytes, Cluster cluster) {
        int total = cluster.partitionCountForTopic(topic);
        if (value instanceof OrderEvent order
                && "VIP".equals(order.getTier())) {
            // Route VIP to partitions 0-1 only
            return Utils.toPositive(Utils.murmur2(keyBytes))
                   % VIP_PARTITIONS;
        }
        // Standard: partitions 2..N
        return VIP_PARTITIONS +
               (Utils.toPositive(Utils.murmur2(keyBytes))
                % (total - VIP_PARTITIONS));
    }
    @Override public void close() {}
    @Override public void configure(Map<String, ?> configs) {}
}

// Register in application.yml:
// spring.kafka.producer.properties:
//   partitioner.class: com.example.PriorityPartitioner

// 3. VIP consumer — only partitions 0 and 1
@KafkaListener(
    topicPartitions = @TopicPartition(
        topic = "orders",
        partitions = {"0", "1"}
    ),
    groupId = "vip-order-processor"
)
public void processVipOrder(OrderEvent event) {
    vipOrderService.processWithPriority(event);
}`,
        tip: "Choose partition key based on entity needing ordering. E-commerce: orderId for lifecycle events, customerId for account activity.",
        warn: "Low-cardinality keys (e.g., country='US') create hot partitions. Monitor partition-level lag individually.",
      },
      {
        q: "What happens when you increase partition count for an existing topic?",
        level: "EXPERT",
        answer: `Increasing partitions BREAKS key-based ordering for existing keys. The hash function murmur2(key) % numPartitions changes — same key may now route to a DIFFERENT partition. Existing messages stay in original partitions and are NOT moved.

Impacts:
• Existing messages: remain in original partitions, not reshuffled
• New messages: same key may route to different partition — ordering gap!
• Consumer groups: ALL consumers trigger rebalancing — brief consumption pause
• Data consistency: consumers reading by key may see out-of-order events`,
        code: `// BEFORE adding partitions — document the current partition count
AdminClient adminClient = AdminClient.create(props);
DescribeTopicsResult result = adminClient.describeTopics(List.of("orders"));
TopicDescription desc = result.allTopicNames().get().get("orders");
System.out.println("Current partitions: " + desc.partitions().size());

// Add partitions (triggers rebalance for all consumer groups!)
adminClient.createPartitions(Map.of(
    "orders", NewPartitions.increaseTo(24) // was 12, now 24
));

// After increasing partitions:
// Same key "customer-123" that went to partition 5
// may now go to partition 17 — ordering is broken for this key!

// Safe approach: use a migration strategy
// 1. Keep old topic for existing consumers
// 2. Create new topic with higher partition count
// 3. Dual-publish during migration period
// 4. Cut over consumers when all caught up`,
        tip: "Over-provision upfront: 6→12→24 is a safe growth path. Never reduce partitions (not supported by Kafka).",
        warn: "Never add partitions to a topic requiring strict per-key ordering without a migration plan. Coordinate with ALL teams first.",
      },
    ],
  },
  {
    id: 2,
    title: "Rebalancing",
    icon: "🔄",
    color: "#3b82f6",
    bg: "#eff6ff",
    questions: [
      {
        q: "Explain Eager vs Cooperative rebalancing. How do you configure Cooperative in Spring Boot?",
        level: "SENIOR",
        answer: `EAGER (Stop-the-World):
• ALL consumers revoke ALL partitions
• All stop consuming, wait for new assignment
• Full lag spike during rebalance (seconds to minutes)
• Default before Kafka 2.4 (RangeAssignor, RoundRobinAssignor)

COOPERATIVE (Incremental):
• Only partitions that NEED to move are revoked
• Other partitions continue consuming uninterrupted
• Near-zero throughput impact
• Use CooperativeStickyAssignor (Kafka 2.4+)`,
        code: `# application.yml — Enable Cooperative Sticky Rebalancing
spring:
  kafka:
    consumer:
      group-id: my-consumer-group
      properties:
        # Replace RangeAssignor with CooperativeStickyAssignor
        partition.assignment.strategy: >
          org.apache.kafka.clients.consumer
            .CooperativeStickyAssignor

        session.timeout.ms: 30000      # dead after 30s of silence
        heartbeat.interval.ms: 10000   # heartbeat every 10s
        max.poll.interval.ms: 300000   # 5 min max between polls

        # Static membership — prevents rebalance on pod restart
        group.instance.id: \${POD_NAME:consumer-instance-1}

// Implementing ConsumerRebalanceListener
@Component
@Slf4j
public class StatefulRebalanceListener
        implements ConsumerAwareRebalanceListener {

    private final OrderStateBuffer stateBuffer;
    private final OffsetTracker    offsetTracker;

    @Override
    public void onPartitionsRevokedBeforeCommit(
            Consumer<?, ?> consumer,
            Collection<TopicPartition> partitions) {
        log.info("Partitions being revoked: {}", partitions);
        stateBuffer.flushAll(partitions);       // flush in-memory state
        Map<TopicPartition, OffsetAndMetadata> offsets =
            offsetTracker.getOffsets(partitions);
        consumer.commitSync(offsets);            // commit latest offsets
    }

    @Override
    public void onPartitionsAssigned(
            Consumer<?, ?> consumer,
            Collection<TopicPartition> partitions) {
        log.info("Partitions assigned: {}", partitions);
        stateBuffer.restoreState(partitions);    // restore state
    }
}

// Register in container factory
@Bean
public ConcurrentKafkaListenerContainerFactory<?, ?> factory(
        ConsumerFactory<?, ?> cf) {
    var factory = new ConcurrentKafkaListenerContainerFactory<>();
    factory.setConsumerFactory(cf);
    factory.getContainerProperties()
           .setConsumerRebalanceListener(
               new StatefulRebalanceListener(stateBuffer, tracker));
    return factory;
}`,
        tip: "Switch to CooperativeStickyAssignor in production. It reduces rebalance impact from full stop to near-zero.",
        warn: "Don't do expensive I/O in onPartitionsRevokedBeforeCommit without a timeout guard — slow revocation triggers ANOTHER rebalance.",
      },
      {
        q: "What causes excessive rebalancing in production and how do you fix it?",
        level: "EXPERT",
        answer: `Root causes and fixes:
1. max.poll.interval.ms exceeded: Consumer processes too slowly between polls. Fix: reduce max.poll.records or increase max.poll.interval.ms.
2. session.timeout.ms exceeded: Heartbeat not sent (GC pause, CPU throttle). Fix: increase session.timeout.ms or reduce GC pauses.
3. Consumer crash/restart: Rolling deployments trigger rebalance. Fix: use static membership (group.instance.id).
4. Network partitions: Consumer unreachable. Fix: set heartbeat.interval.ms = session.timeout.ms / 3.`,
        code: `# application.yml — Fixes for excessive rebalancing
spring:
  kafka:
    consumer:
      properties:
        # Fix 1: Static group membership (K8s pod restart safe)
        group.instance.id: \${POD_NAME:consumer-pod-1}

        # Fix 2: Tune timeouts
        heartbeat.interval.ms: 3000    # heartbeat every 3s
        session.timeout.ms: 30000      # dead after 30s
        max.poll.interval.ms: 600000   # 10 min max per poll

        # Fix 3: Reduce records per poll if processing is slow
        max.poll.records: 50           # fewer records = faster processing

        # Fix 4: Cooperative rebalancing
        partition.assignment.strategy: >
          org.apache.kafka.clients.consumer
            .CooperativeStickyAssignor

// Monitor rebalance events
@EventListener
public void onRebalance(ListenerContainerIdleEvent event) {
    log.warn("Consumer idle — possible rebalance: {}",
        event.getListenerId());
}

// Detect rebalance storms in logs:
// Look for: "Attempt to heartbeat failed since group is rebalancing"
// appearing more than 3x in 5 minutes = rebalance storm`,
        tip: "Set group.instance.id to the pod name in Kubernetes. When a pod restarts, it rejoins with the same identity — no rebalance triggered.",
        warn: "A rebalance storm (continuous rebalancing) halts all consumption. Check max.poll.interval.ms first — it's the #1 cause.",
      },
    ],
  },
  {
    id: 3,
    title: "Exactly-Once Semantics",
    icon: "🎯",
    color: "#8b5cf6",
    bg: "#f5f3ff",
    questions: [
      {
        q: "What are the three delivery guarantees in Kafka and what configuration gives each?",
        level: "INTERMEDIATE",
        answer: `AT-MOST-ONCE: enable-auto-commit=true, acks=0
• Offset committed BEFORE processing
• Messages LOST on crash
• Use only for non-critical logs/metrics

AT-LEAST-ONCE: enable-auto-commit=false, acks=all, manual ack AFTER processing
• Duplicates possible on retry/rebalance
• Requires idempotent consumer
• Most common pattern for microservices

EXACTLY-ONCE (EOS): enable-idempotence=true + transactional.id + isolation-level=read_committed
• No loss, no duplicates
• ~5-10% latency overhead
• Use for financial transactions, payments, inventory`,
        code: `# application.yml — Exactly-Once Semantics (EOS)
spring:
  kafka:
    producer:
      acks: all                           # wait for ALL ISR replicas
      enable-idempotence: true            # prevents producer-side dupes
      retries: 2147483647                 # effectively infinite
      transaction-id-prefix: payment-tx-  # enables Kafka transactions
      properties:
        max.in.flight.requests.per.connection: 5

    consumer:
      enable-auto-commit: false           # ALWAYS false with EOS
      isolation-level: read_committed     # only see committed messages
      properties:
        auto.offset.reset: earliest

// EOS: Consume-Transform-Produce atomically
@Service
@Slf4j
@RequiredArgsConstructor
public class PaymentEosService {

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final PaymentRepository             paymentRepo;

    @KafkaListener(topics = "payments", groupId = "payment-eos")
    @Transactional("kafkaTransactionManager") // Kafka TX manager
    public void processPayment(PaymentEvent event, Acknowledgment ack) {
        // 1. Update DB (part of Kafka transaction)
        paymentRepo.deductBalance(
            event.getAccountId(), event.getAmount());

        // 2. Publish notification — SAME Kafka transaction
        kafkaTemplate.send("notifications",
            event.getCustomerId(),
            NotificationEvent.builder()
                .paymentId(event.getPaymentId())
                .amount(event.getAmount())
                .type("PAYMENT_PROCESSED")
                .build());

        // 3. Commit offset atomically with the produce
        ack.acknowledge();
    }
}

// Beans
@Bean
public KafkaTransactionManager<String, Object> kafkaTxManager(
        ProducerFactory<String, Object> pf) {
    return new KafkaTransactionManager<>(pf);
}`,
        tip: "Enable EOS only for financial transactions, inventory deduction, and payments where duplicates cause real harm. Accept the ~5-10% latency cost.",
        warn: "Combining Kafka + DB transactions requires ChainedKafkaTransactionManager. Without it, one may commit while the other rolls back.",
      },
    ],
  },
  {
    id: 4,
    title: "ISR and Replication",
    icon: "🔒",
    color: "#10b981",
    bg: "#f0fdf4",
    questions: [
      {
        q: "What is the ISR set and what is the production golden rule for durability?",
        level: "SENIOR",
        answer: `ISR (In-Sync Replica set) = replicas fully caught up with the partition leader (within replica.lag.time.max.ms = 30s default).

Only ISR members can be elected as leader.

THE GOLDEN RULE:
  replication.factor=3 + acks=all + min.insync.replicas=2

This means:
• 3 copies of every message (survive 2 broker failures)
• Producer waits for ALL ISR members to acknowledge
• Write fails if fewer than 2 replicas are in ISR
• Net: tolerate 1 broker failure with ZERO data loss`,
        code: `// Topic creation with production durability settings
@Bean
public NewTopic ordersTopic() {
    return TopicBuilder.name("orders")
        .partitions(12)
        .replicas(3)  // 3 copies of every message
        .config(TopicConfig.MIN_IN_SYNC_REPLICAS_CONFIG, "2")
        .config(TopicConfig.UNCLEAN_LEADER_ELECTION_ENABLE_CONFIG,
                "false") // NEVER allow stale replica as leader
        .config(TopicConfig.RETENTION_MS_CONFIG, "604800000") // 7d
        .config(TopicConfig.COMPRESSION_TYPE_CONFIG, "snappy")
        .build();
}

# application.yml — Producer durability
spring:
  kafka:
    producer:
      acks: all              # THE most important durability setting
      retries: 3
      enable-idempotence: true
      properties:
        min.insync.replicas: 2

// ISR Monitor — alert on shrinkage
@Component
@Slf4j
@RequiredArgsConstructor
public class IsrHealthMonitor {

    private final AdminClient   adminClient;
    private final MeterRegistry registry;

    @Scheduled(fixedDelay = 30_000)
    public void checkIsrHealth() throws Exception {
        DescribeTopicsResult result = adminClient
            .describeTopics(List.of("orders","payments","inventory"));

        result.allTopicNames().get()
            .forEach((topic, desc) ->
                desc.partitions().forEach(pi -> {
                    int replicas = pi.replicas().size();
                    int isr      = pi.isr().size();

                    Gauge.builder("kafka.isr.size",
                        Tags.of("topic", topic,
                                "partition",
                                String.valueOf(pi.partition())),
                        () -> isr).register(registry);

                    if (isr < replicas) {
                        log.warn("ISR SHRINKAGE: " +
                            "topic={} partition={} isr={}/{}",
                            topic, pi.partition(), isr, replicas);
                    }
                })
            );
    }
}`,
        tip: "ISR shrinkage is a leading indicator of data loss risk. Alert immediately when isr < replication.factor.",
        warn: "unclean.leader.election.enable=true (default in older Kafka) allows out-of-sync replica as leader → MESSAGE LOSS. Always set to false.",
      },
    ],
  },
  {
    id: 5,
    title: "Consumer Lag",
    icon: "📊",
    color: "#f97316",
    bg: "#fff7ed",
    questions: [
      {
        q: "What is consumer lag and how do you monitor and alert on it in production?",
        level: "SENIOR",
        answer: `Consumer lag = Log End Offset − Consumer Current Offset

Growing lag → consumer slower than producer (crisis)
Stable lag   → keeping up (acceptable)
Zero lag     → fully caught up (ideal)

Alert thresholds:
• Warn:     lag > 1,000
• Critical: lag > 10,000
• Also alert on LAG RATE (growing > 100/sec) not just absolute value

Root causes:
• Slow processing logic      → optimise or go async
• Insufficient consumers     → add instances (up to partition count)
• GC pauses / OOM            → tune JVM, reduce max.poll.records
• Database bottleneck        → use saveAll() batch, add indexes
• Rebalancing storm          → CooperativeStickyAssignor + static ID
• Deserialization errors     → ErrorHandlingDeserializer + DLT`,
        code: `// Consumer Lag Monitor with Prometheus
@Component
@Slf4j
@RequiredArgsConstructor
public class ConsumerLagMonitor {

    private final AdminClient   adminClient;
    private final MeterRegistry registry;
    private final AlertService  alertService;

    @Scheduled(fixedDelay = 15_000)
    public void reportLag() throws Exception {
        String groupId = "order-processor-group";

        // Get committed offsets (consumer position)
        Map<TopicPartition, OffsetAndMetadata> committed =
            adminClient.listConsumerGroupOffsets(groupId)
                       .partitionsToOffsetAndMetadata().get();

        // Get end offsets (latest produced position)
        Map<TopicPartition, Long> endOffsets = adminClient
            .listOffsets(committed.keySet().stream()
                .collect(Collectors.toMap(
                    tp -> tp, tp -> OffsetSpec.latest())))
            .all().get().entrySet().stream()
            .collect(Collectors.toMap(
                Map.Entry::getKey,
                e -> e.getValue().offset()));

        committed.forEach((tp, om) -> {
            long lag = Math.max(0,
                endOffsets.getOrDefault(tp, 0L) - om.offset());

            // Prometheus gauge per partition
            Gauge.builder("kafka.consumer.lag",
                Tags.of("group",     groupId,
                        "topic",     tp.topic(),
                        "partition",
                        String.valueOf(tp.partition())),
                () -> lag).register(registry);

            if (lag > 10_000) {
                log.error("CRITICAL lag: topic={} p={} lag={}",
                    tp.topic(), tp.partition(), lag);
                alertService.sendCritical(
                    "Kafka consumer lag CRITICAL: " + lag);
            } else if (lag > 1_000) {
                log.warn("HIGH lag: topic={} p={} lag={}",
                    tp.topic(), tp.partition(), lag);
            }
        });
    }
}

# Grafana PromQL queries:
# Lag per partition:
#   kafka_consumer_lag{group="order-processor-group"}
#
# Total lag:
#   sum(kafka_consumer_lag{group="order-processor-group"})
#
# Lag rate (growing?):
#   rate(kafka_consumer_lag{group="order-processor-group"}[5m])`,
        tip: "Deploy Kafka UI (Provectus) or Confluent Control Center for visual lag monitoring. Set up PagerDuty alerts on the Prometheus metrics.",
        warn: "A stable lag of 50,000 is safer than a growing lag of 100. Always monitor the RATE of change, not just the absolute value.",
      },
    ],
  },
  {
    id: 6,
    title: "Transactions",
    icon: "💳",
    color: "#ec4899",
    bg: "#fdf2f8",
    questions: [
      {
        q: "How do Kafka transactions work? Explain zombie fencing.",
        level: "SENIOR",
        answer: `Kafka transactions provide atomicity across multiple partitions/topics using a Transaction Coordinator broker.

Phases:
1. initTransactions() → Producer registers, gets PID + epoch
2. beginTransaction() → Marks start (no broker communication)
3. send() calls       → Records buffered, coordinator notes partitions
4. commitTransaction() → Two-phase commit: COMMIT marker on all partitions
5. abortTransaction()  → ABORT marker written; consumers skip these

ZOMBIE FENCING:
If a producer crashes and restarts with same transactional.id, the broker assigns a higher EPOCH. If the old "zombie" producer tries to commit with the old epoch, the broker REJECTS it with ProducerFencedException. This prevents duplicate commits from crashed-and-recovered producers.`,
        code: `// Atomic multi-topic publish
@Service
@RequiredArgsConstructor
public class OrderTransactionService {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    public void placeOrderAtomically(Order order) {
        // All sends are atomic — all commit or all rollback
        kafkaTemplate.executeInTransaction(ops -> {
            ops.send("orders",
                order.getId(),
                new OrderCreatedEvent(order));
            ops.send("inventory",
                order.getId(),
                new ReserveInventoryEvent(order));
            ops.send("audit",
                order.getId(),
                new AuditEvent("ORDER_PLACED", order));
            return true;
        });
    }
}

# application.yml — Enable Kafka transactions
spring:
  kafka:
    producer:
      transaction-id-prefix: order-service-tx-  # unique per service
      acks: all
      enable-idempotence: true

// Outbox Pattern — DB + Kafka atomicity without 2PC
@Service
@Transactional   // single DB transaction
public class OrderService {

    public Order createOrder(CreateOrderRequest req) {
        // 1. Business logic
        inventoryRepo.reserve(req.getProductId(), req.getQty());
        Order order = orderRepo.save(Order.from(req));

        // 2. Write outbox event — SAME DB TRANSACTION
        outboxRepo.save(OutboxEvent.builder()
            .aggregateId(order.getId())
            .eventType("OrderCreated")
            .topic("orders")
            .payload(toJson(new OrderCreatedEvent(order)))
            .build());

        return order; // both writes commit together
    }
}

// Outbox Publisher — polls and publishes
@Component
@Scheduled(fixedDelay = 500)
@Transactional
public void publishPending() {
    List<OutboxEvent> pending = outboxRepo
        .findByPublishedFalseAndRetryCountLessThan(
            3, PageRequest.of(0, 100));
    for (OutboxEvent ev : pending) {
        try {
            kafka.send(ev.getTopic(), ev.getAggregateId(),
                       mapper.readTree(ev.getPayload()))
                 .get(5, TimeUnit.SECONDS);
            ev.setPublished(true);
        } catch (Exception e) {
            ev.setRetryCount(ev.getRetryCount() + 1);
        }
        outboxRepo.save(ev);
    }
}`,
        tip: "Use Debezium CDC instead of polling for the Outbox Pattern in production — it reads PostgreSQL WAL logs directly, sub-second latency, zero polling overhead.",
        warn: "transactional.id must be unique per service but consistent across pod restarts. Use service-name prefix: 'order-service-tx-'. Different pods of same service fence each other properly.",
      },
    ],
  },
  {
    id: 7,
    title: "Idempotency",
    icon: "🔁",
    color: "#06b6d4",
    bg: "#ecfeff",
    questions: [
      {
        q: "How does Kafka's idempotent producer work? How do you implement an idempotent consumer?",
        level: "SENIOR",
        answer: `PRODUCER-SIDE (enable.idempotence=true):
• Broker assigns each producer a unique Producer ID (PID)
• Each record gets a monotonically increasing Sequence Number per partition
• On retry, broker sees same PID + sequence → acknowledges but DISCARDS duplicate
• Session-scoped only: new producer restart = new PID

CONSUMER-SIDE (application must implement):
• Idempotent producer prevents SEND-side duplicates only
• Consumer duplicates happen from: rebalancing, at-least-once semantics
• Solution: track processed event IDs in Redis (fast) + DB (durable)`,
        code: `# application.yml — Idempotent producer
spring:
  kafka:
    producer:
      enable-idempotence: true          # PID + sequence tracking
      acks: all                         # required for idempotence
      retries: 2147483647               # effectively infinite
      properties:
        max.in.flight.requests.per.connection: 5

// Idempotent Consumer — Redis SETNX + DB unique constraint
@Service
@Slf4j
@RequiredArgsConstructor
public class IdempotentPaymentConsumer {

    private final StringRedisTemplate      redis;
    private final ProcessedEventRepository processedRepo;
    private final PaymentService           paymentService;

    @KafkaListener(topics = "payments", groupId = "payment-idempotent")
    public void processPayment(PaymentEvent event, Acknowledgment ack) {
        String eventId  = event.getEventId();  // globally unique UUID
        String redisKey = "processed:payment:" + eventId;

        // Fast check: Redis SETNX (atomic, ~1ms)
        Boolean isNew = redis.opsForValue()
            .setIfAbsent(redisKey, "1", Duration.ofHours(24));

        if (Boolean.FALSE.equals(isNew)) {
            log.warn("Duplicate event skipped: {}", eventId);
            ack.acknowledge();   // advance offset, skip
            return;
        }

        try {
            paymentService.processPayment(event);

            // Persist for audit + long-term deduplication
            processedRepo.save(
                new ProcessedEvent(eventId, "payment", Instant.now()));

            ack.acknowledge();
        } catch (Exception e) {
            redis.delete(redisKey);  // allow retry
            log.error("Payment failed, will retry: {}", e.getMessage());
            // Do NOT ack — Kafka will redeliver
        }
    }
}

// DB entity with unique constraint
@Entity
@Table(name = "processed_events",
    uniqueConstraints = @UniqueConstraint(
        columnNames = {"event_id", "event_type"}))
public class ProcessedEvent {
    @Id @GeneratedValue         private Long id;
    @Column(unique = true)      private String eventId;
    private String eventType;
    private Instant processedAt;
    // Periodic cleanup: delete entries older than 30 days
}`,
        tip: "Redis SETNX handles 99.9% of deduplication in microseconds. DB unique constraint is the safety net for edge cases when Redis TTL expires.",
        warn: "enable.idempotence prevents PRODUCER retry duplicates only. It does NOT prevent consumer-side duplicates from rebalancing. Always implement consumer deduplication separately.",
      },
    ],
  },
  {
    id: 8,
    title: "Kafka Internals",
    icon: "⚙️",
    color: "#64748b",
    bg: "#f8fafc",
    questions: [
      {
        q: "Explain Kafka's storage architecture: log segments, page cache, and zero-copy.",
        level: "EXPERT",
        answer: `LOG SEGMENTS:
Each partition = ordered sequence of segment files on disk:
• .log file     → actual message bytes (sequential append only)
• .index file   → sparse map: offset → byte position
• .timeindex    → timestamp → offset (for time-based seeks)
• Active segment → current file being written to (1 per partition)

PAGE CACHE:
Kafka relies entirely on the OS page cache. Recent data is served from RAM, not disk. This is why Kafka brokers need large RAM (32-64GB) — more page cache = more data served without disk I/O.

ZERO-COPY (sendfile syscall):
Traditional: disk → kernel buffer → user space → kernel socket → network
Zero-copy:   disk page cache → network socket (skipping user space!)
Result: near wire-speed throughput, minimal CPU usage

LOG COMPACTION:
Keeps only the latest value per key. Old segments compacted in background.
Perfect for: user profiles, account balances, product catalog (current state).`,
        code: `# Broker log configuration (server.properties)
log.dirs=/var/kafka/data
log.segment.bytes=1073741824      # roll new segment every 1GB
log.segment.ms=604800000          # or every 7 days
log.retention.hours=168           # delete after 7 days
log.retention.bytes=107374182400  # or 100GB per partition
log.cleanup.policy=delete         # 'delete', 'compact', or 'compact,delete'

# Log compaction topic (for current state / changelog)
@Bean
public NewTopic customerProfilesTopic() {
    return TopicBuilder.name("customer-profiles")
        .partitions(12)
        .replicas(3)
        .config(TopicConfig.CLEANUP_POLICY_CONFIG, "compact")
        .config(TopicConfig.MIN_COMPACTION_LAG_MS_CONFIG,
                "3600000")    // 1 hour
        .config(TopicConfig.MAX_COMPACTION_LAG_MS_CONFIG,
                "86400000")   // 24 hours
        .config(TopicConfig.SEGMENT_MS_CONFIG,
                "3600000")    // 1 hour segment roll
        .build();
}
// Compact topic: replaying from offset 0 → get CURRENT state
// of every customer, not the full history

# KRaft mode (Kafka 3.3+ — no ZooKeeper!)
# kraft/server.properties:
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@kafka1:9093,2@kafka2:9093,3@kafka3:9093
listeners=PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093

# Spring Boot client — NO change needed.
# KRaft is broker-side; clients just use bootstrap-servers.`,
        tip: "Give Kafka brokers as much RAM as possible. The OS page cache IS Kafka's read cache. More RAM = more data served without disk I/O.",
        warn: "Compacted topics are NOT suitable for event sourcing where you need the full history. Use 'compact,delete' if you need both compaction AND time-based retention.",
      },
    ],
  },
  {
    id: 9,
    title: "Performance Tuning",
    icon: "🚀",
    color: "#f59e0b",
    bg: "#fffbeb",
    questions: [
      {
        q: "What are the key producer and consumer configuration knobs for throughput vs latency?",
        level: "SENIOR",
        answer: `THROUGHPUT vs LATENCY is the core trade-off:

Producer side:
• linger.ms: wait to fill batch vs send immediately
• batch.size: larger batch = fewer network trips
• compression.type: snappy/lz4 = less data over wire
• acks=1 vs acks=all: durability vs speed

Consumer side:
• max.poll.records: how many records per poll
• fetch.min.bytes: wait for data before returning
• fetch.max.wait.ms: max time to wait for min bytes
• concurrency: parallel consumer threads

JVM:
• Use G1GC or ZGC (low-pause)
• -Xms == -Xmx (avoid heap resize pauses)
• 4-8GB heap for most consumers`,
        code: `# HIGH THROUGHPUT config (logs, metrics, analytics)
spring:
  kafka:
    producer:
      acks: 1                      # async replication ok
      compression-type: snappy     # ~60% size reduction
      batch-size: 131072           # 128KB batches
      buffer-memory: 67108864      # 64MB send buffer
      properties:
        linger.ms: 20              # wait 20ms to fill batch
        max.in.flight.requests.per.connection: 5

# LOW LATENCY config (real-time alerts, trading)
spring:
  kafka:
    producer:
      acks: 1
      compression-type: none       # skip compression = less CPU
      batch-size: 1                # send immediately
      properties:
        linger.ms: 0               # no waiting
        max.block.ms: 1000         # fail fast if buffer full

# CONSUMER throughput tuning
spring:
  kafka:
    consumer:
      max-poll-records: 500        # records per poll
      fetch-min-size: 1048576      # 1MB min fetch
      fetch-max-wait: 500          # wait 500ms to fill
      properties:
        max.poll.interval.ms: 300000  # 5 min max between polls

// Batch listener — 10-50x faster DB inserts
@KafkaListener(topics = "orders", containerFactory = "batchFactory")
public void processOrderBatch(
        List<ConsumerRecord<String, OrderEvent>> records,
        Acknowledgment ack) {
    List<Order> orders = records.stream()
        .map(r -> mapToOrder(r.value()))
        .collect(Collectors.toList());

    orderRepository.saveAll(orders); // BULK INSERT vs N individual
    ack.acknowledge();
    log.info("Batch: {} orders in 1 DB round-trip", orders.size());
}

@Bean
public ConcurrentKafkaListenerContainerFactory<?, ?> batchFactory(
        ConsumerFactory<?, ?> cf) {
    var f = new ConcurrentKafkaListenerContainerFactory<>();
    f.setConsumerFactory(cf);
    f.setBatchListener(true);
    f.setConcurrency(6);
    return f;
}

# JVM tuning for consumer pods:
# -XX:+UseG1GC -XX:MaxGCPauseMillis=20
# -Xms2g -Xmx4g -XX:+UseStringDeduplication`,
        tip: "Best default for most services: linger.ms=10, batch.size=65536, compression=snappy. Gives 3-5x throughput improvement with only ~10ms extra latency.",
        warn: "Batch listeners require max.poll.interval.ms > (batch_size × avg_processing_time). A batch of 500 records × 10ms each = 5 seconds minimum interval.",
      },
    ],
  },
  {
    id: 10,
    title: "Retry + DLQ Architecture",
    icon: "♻️",
    color: "#ef4444",
    bg: "#fef2f2",
    questions: [
      {
        q: "Design a non-blocking retry architecture with exponential backoff and DLT.",
        level: "EXPERT",
        answer: `NON-BLOCKING RETRY PATTERN:
Messages that fail don't block the partition. They flow through retry topics with increasing delays:

orders → orders-retry-1 (1min wait)
       → orders-retry-5 (5min wait)
       → orders-retry-30 (30min wait)
       → orders.DLT (dead letter)

Benefits:
• Main consumer never blocks on failures
• Other messages continue processing
• Natural exponential backoff
• DLT for manual review and replay
• @RetryableTopic handles everything automatically (Spring Kafka 2.7+)`,
        code: `// Non-blocking retry with @RetryableTopic
@Component
@Slf4j
public class PaymentConsumer {

    @RetryableTopic(
        attempts = "4",              // 1 original + 3 retries
        backoff = @Backoff(
            delay     = 60_000,      // 1 min → 5 min → 25 min
            multiplier = 5,
            maxDelay  = 1_800_000    // cap at 30 min
        ),
        dltTopicSuffix   = ".DLT",
        retryTopicSuffix = "-retry",
        include  = {ExternalServiceException.class,
                    TimeoutException.class},
        exclude  = {ValidationException.class,
                    JsonParseException.class},
        autoCreateTopics = "true"
    )
    @KafkaListener(topics = "payments", groupId = "payment-processor")
    public void processPayment(PaymentEvent event) {
        log.info("Processing payment: {}", event.getPaymentId());
        paymentGateway.charge(event); // throws if service down
    }

    @DltHandler
    public void handleDlt(
            PaymentEvent event,
            @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,
            @Header(value = "DLT-Exception-Message",
                    required = false) String error) {
        log.error("Payment {} exhausted all retries. error={}",
            event.getPaymentId(), error);
        alertService.sendCritical(
            "Payment DLT: " + event.getPaymentId());
        deadLetterRepository.save(
            DeadLetterRecord.from(event, error));
    }
}

// Manual DefaultErrorHandler setup (lower-level control)
@Bean
public ConcurrentKafkaListenerContainerFactory<String, Object>
        retryableFactory(ConsumerFactory<String, Object> cf,
                         KafkaTemplate<String, Object> tpl) {

    DeadLetterPublishingRecoverer recoverer =
        new DeadLetterPublishingRecoverer(tpl,
            (record, ex) -> new TopicPartition(
                record.topic() + ".DLT", record.partition()));

    // Enrich DLT headers
    recoverer.setHeadersFunction((record, ex) -> {
        var hdrs = new LinkedHashMap<String, String>();
        hdrs.put("DLT-Exception-Message", ex.getMessage());
        hdrs.put("DLT-Exception-Class",
                 ex.getClass().getName());
        hdrs.put("DLT-Original-Offset",
                 String.valueOf(record.offset()));
        hdrs.put("DLT-Failed-At", Instant.now().toString());
        return new RecordHeaders(hdrs.entrySet().stream()
            .map(e -> new RecordHeader(
                e.getKey(), e.getValue().getBytes()))
            .toList());
    });

    ExponentialBackOffWithMaxRetries backoff =
        new ExponentialBackOffWithMaxRetries(3);
    backoff.setInitialInterval(1_000L);   // 1s
    backoff.setMultiplier(2.0);           // 1s, 2s, 4s
    backoff.setMaxInterval(30_000L);      // cap at 30s

    DefaultErrorHandler handler =
        new DefaultErrorHandler(recoverer, backoff);
    handler.addNotRetryableExceptions(
        JsonParseException.class,
        ValidationException.class);

    var factory = new ConcurrentKafkaListenerContainerFactory<>();
    factory.setConsumerFactory(cf);
    factory.setCommonErrorHandler(handler);
    return factory;
}`,
        tip: "@RetryableTopic (Spring Kafka 2.7+) automatically creates retry topics, registers consumers for each, and handles delay timing. Use it — don't reinvent the wheel.",
        warn: "Never retry forever on the main consumer thread. A poison pill blocks ALL messages on that partition indefinitely. Always cap retries and route to DLT.",
      },
    ],
  },
  {
    id: 11,
    title: "Kafka Streams",
    icon: "🌊",
    color: "#0ea5e9",
    bg: "#f0f9ff",
    questions: [
      {
        q: "What is the difference between KStream and KTable? Implement real-time fraud detection.",
        level: "EXPERT",
        answer: `KStream — infinite stream of events:
• Each record is independent (INSERT semantics)
• All records matter: clicks, transactions, orders
• Stateless by default

KTable — materialised view of latest state per key:
• Only latest value per key matters (UPSERT semantics)
• Use for: user profiles, account balances, inventory
• Backed by embedded RocksDB state store

Stream-Table Join = enrich events with current state:
• Order stream + Customer profile table → enriched orders
• Transaction stream + Fraud rules table → risk-scored transactions

Windowing types:
• Tumbling:  fixed, non-overlapping (count per 10-min period)
• Hopping:   fixed size, overlapping (moving average)
• Sliding:   event-time based, overlapping
• Session:   activity-based gaps`,
        code: `// Fraud Detection — 5+ transactions >$500 in 10-min window
@Configuration
@EnableKafkaStreams
public class FraudDetectionStreams {

    @Bean
    public KStream<String, Transaction> fraudDetection(
            StreamsBuilder builder) {

        // Source stream — all transactions
        KStream<String, Transaction> txStream = builder.stream(
            "transactions",
            Consumed.with(Serdes.String(), transactionSerde()));

        // Count high-value transactions per customer per 10 min
        KTable<Windowed<String>, Long> counts = txStream
            // Filter: only transactions > $500
            .filter((customerId, tx) ->
                tx.getAmount().compareTo(
                    new BigDecimal("500")) > 0)
            // Group by customer ID
            .groupByKey(Grouped.with(
                Serdes.String(), transactionSerde()))
            // 10-minute tumbling window
            .windowedBy(TimeWindows.ofSizeWithNoGrace(
                Duration.ofMinutes(10)))
            // Count per window
            .count(Materialized.as("fraud-count-store"));

        // Emit alert when count >= 5
        counts.toStream()
            .filter((windowedKey, count) -> count >= 5)
            .map((windowedKey, count) -> KeyValue.pair(
                windowedKey.key(),
                FraudAlert.builder()
                    .customerId(windowedKey.key())
                    .txCount(count)
                    .windowStart(
                        windowedKey.window().startTime())
                    .windowEnd(
                        windowedKey.window().endTime())
                    .severity(count >= 10
                        ? "CRITICAL" : "HIGH")
                    .build()))
            .to("fraud-alerts", Produced.with(
                Serdes.String(), fraudAlertSerde()));

        return txStream;
    }
}

// Stream-Table join — enrich orders with customer profile
@Bean
public KStream<String, EnrichedOrder> enrichOrders(
        StreamsBuilder builder) {

    KStream<String, Order> orders = builder.stream("orders");

    KTable<String, CustomerProfile> profiles = builder.table(
        "customer-profiles",
        Materialized.as("customer-profile-store"));

    return orders.join(profiles,
        (order, profile) -> EnrichedOrder.builder()
            .orderId(order.getId())
            .customerTier(profile != null
                ? profile.getTier() : "STANDARD")
            .riskScore(profile != null
                ? profile.getRiskScore() : 0.0)
            .build(),
        Joined.with(Serdes.String(),
            orderSerde(), profileSerde()));
}

# application.yml
spring:
  kafka:
    streams:
      application-id: fraud-detection-streams
      properties:
        commit.interval.ms: 1000
        cache.max.bytes.buffering: 10485760  # 10MB
        num.stream.threads: 4`,
        tip: "Kafka Streams maintains local RocksDB state stores. Interactive Queries let you query them via REST API — no separate database needed for real-time aggregations.",
        warn: "Tumbling windows miss events at boundaries. Use grace periods: TimeWindows.ofSizeWithNoGrace(10min) vs TimeWindows.ofSizeAndGrace(10min, 5min) to handle late arrivals.",
      },
    ],
  },
  {
    id: 12,
    title: "Schema Evolution",
    icon: "📋",
    color: "#8b5cf6",
    bg: "#f5f3ff",
    questions: [
      {
        q: "What are Schema Registry compatibility modes and how do you safely migrate Avro schemas?",
        level: "SENIOR",
        answer: `COMPATIBILITY MODES:
• BACKWARD (default): new schema reads data from PREVIOUS schema → add optional fields with defaults
• FORWARD: previous schema reads data from NEW schema → consumers can lag behind producers  
• FULL: both BACKWARD and FORWARD → add/remove only optional fields with defaults
• FULL_TRANSITIVE: RECOMMENDED → all versions always interoperable

SAFE EVOLUTION RULES:
✅ Add field with default value
✅ Remove field that had a default value  
✅ Rename field using 'aliases'
❌ Change field type (e.g., string → int)
❌ Rename field without aliases
❌ Remove field without a default`,
        code: `<!-- pom.xml -->
<dependency>
    <groupId>io.confluent</groupId>
    <artifactId>kafka-avro-serializer</artifactId>
    <version>7.6.0</version>
</dependency>

# application.yml
spring:
  kafka:
    properties:
      schema.registry.url: http://schema-registry:8081
      auto.register.schemas: false  # register via CI/CD in prod
      use.latest.version: true
    producer:
      value-serializer: >
        io.confluent.kafka.serializers.KafkaAvroSerializer
    consumer:
      value-deserializer: >
        io.confluent.kafka.serializers.KafkaAvroDeserializer
      properties:
        specific.avro.reader: true

// order-event-v1.avsc
{
  "type": "record", "name": "OrderEvent",
  "namespace": "com.example.avro",
  "fields": [
    {"name": "orderId",    "type": "string"},
    {"name": "customerId", "type": "string"},
    {"name": "amount",     "type": "double"},
    {"name": "currency",   "type": "string", "default": "USD"}
  ]
}

// order-event-v2.avsc — BACKWARD COMPATIBLE
{
  "type": "record", "name": "OrderEvent",
  "namespace": "com.example.avro",
  "fields": [
    {"name": "orderId",    "type": "string"},
    {"name": "customerId", "type": "string"},
    // 'currency' removed — OK, had a default
    // NEW optional field — MUST have default
    {"name": "region",   "type": ["null","string"],
     "default": null},
    {"name": "priority", "type": "string",
     "default": "STANDARD"},
    // Renamed field — use aliases for backward compat
    {"name": "totalAmount", "type": "double",
     "default": 0.0,  "aliases": ["amount"]}
  ]
}

// Set compatibility via REST API (do in CI/CD):
// PUT http://schema-registry:8081/config/orders-value
// {"compatibility": "FULL_TRANSITIVE"}

@Service
public class OrderProducer {
    public void send(Order order) {
        OrderEvent event = OrderEvent.newBuilder()
            .setOrderId(order.getId())
            .setCustomerId(order.getCustomerId())
            .setTotalAmount(order.getAmount())  // was: setAmount()
            .setRegion(order.getRegion())
            .setPriority("STANDARD")
            .build();
        kafkaTemplate.send("orders",
            event.getOrderId().toString(), event);
    }
}`,
        tip: "Register schemas in CI/CD pipeline before deploying the service. Use 'auto.register.schemas=false' in production to prevent accidental schema registration.",
        warn: "Changing a field type is ALWAYS a breaking change — even int → long. Version the topic with a new name (e.g., 'orders-v2') for breaking schema changes.",
      },
    ],
  },
  {
    id: 13,
    title: "Ordering Guarantees",
    icon: "📋",
    color: "#10b981",
    bg: "#f0fdf4",
    questions: [
      {
        q: "Kafka guarantees order within a partition. How do you design for this? Can retries break ordering?",
        level: "SENIOR",
        answer: `ORDERING RULES:
• Within a partition: GUARANTEED order (sequential, immutable log)
• Across partitions: NO ordering guarantee
• The partition key IS your ordering boundary

DESIGN PRINCIPLE: Choose a key that groups all causally related events into the same partition.
• orderId key → all order lifecycle events ordered (Created→Paid→Shipped→Delivered)
• customerId key → all customer events ordered (account statements)
• null key → no ordering (logs, metrics, independent events)

RETRY REORDERING TRAP:
With retries=3 and max.in.flight=5 (WITHOUT idempotence):
• Batch 1 fails, Batch 2 succeeds → Batch 2 stored before Batch 1 on retry!

FIX: enable.idempotence=true + max.in.flight=5
• Broker uses sequence numbers to detect and reject out-of-order delivery`,
        code: `// ALL order lifecycle events use orderId as key
// → same partition → guaranteed delivery order
@Service
public class OrderEventProducer {

    public void orderCreated(Order order) {
        kafkaTemplate.send("order-events",
            order.getId(),  // KEY = orderId
            new OrderCreatedEvent(order));
    }

    public void orderPaid(String orderId, Payment payment) {
        kafkaTemplate.send("order-events",
            orderId,        // SAME partition!
            new OrderPaidEvent(orderId, payment));
    }

    public void orderShipped(String orderId) {
        kafkaTemplate.send("order-events",
            orderId,
            new OrderShippedEvent(orderId));
    }
}

// Consumer processes events in guaranteed order per orderId
@KafkaListener(topics = "order-events",
               groupId = "order-state-machine")
public void processOrderEvent(
        ConsumerRecord<String, OrderEvent> record) {
    String orderId   = record.key();    // same partition = ordered
    OrderEvent event = record.value();

    // Safe: events arrive in order per orderId
    orderStateMachine.transition(orderId, event);
}

# Fix ordering with retries — enable idempotence
spring:
  kafka:
    producer:
      enable-idempotence: true         # sequence numbers = ordering
      acks: all                        # required with idempotence
      retries: 2147483647
      properties:
        # 5 in-flight + idempotence = ordered AND good throughput
        max.in.flight.requests.per.connection: 5

# WRONG — reordering possible:
# enable-idempotence: false
# retries: 3
# max.in.flight.requests.per.connection: 5
# → Batch 2 can arrive before Batch 1 retry!`,
        tip: "Ask: 'What is the smallest entity requiring strict event ordering?' That entity's ID becomes your partition key.",
        warn: "max.in.flight=5 with retries but WITHOUT idempotence is a data ordering bug waiting to happen in production. Always enable idempotence.",
      },
    ],
  },
  {
    id: 14,
    title: "Scaling Consumers",
    icon: "📈",
    color: "#f97316",
    bg: "#fff7ed",
    questions: [
      {
        q: "What limits consumer parallelism? How do you implement KEDA-based autoscaling?",
        level: "EXPERT",
        answer: `PARALLELISM LIMIT = number of partitions
• Consumers < Partitions: each handles multiple partitions (fine)
• Consumers = Partitions: OPTIMAL — maximum parallelism
• Consumers > Partitions: extra consumers are IDLE — wasted resources

SCALING OPTIONS:
1. concurrency setting: threads per pod (e.g., concurrency=6)
2. Horizontal pod scaling: more pods × 1 thread each (better isolation)
3. KEDA ScaledObject: auto-scale based on consumer lag metric

KEDA flow:
lag > threshold → KEDA increases replica count
lag drops      → KEDA scales down after cooldown period`,
        code: `# application.yml — concurrency = threads per pod
spring:
  kafka:
    listener:
      concurrency: 6   # 6 consumer threads per pod

# With 24 partitions:
# Option A: 4 pods × 6 threads = 24 (balanced)
# Option B: 24 pods × 1 thread = 24 (best K8s isolation)

# keda-scaledobject.yaml — lag-based autoscaling
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: order-consumer-scaler
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-consumer
  pollingInterval: 15        # check lag every 15 seconds
  cooldownPeriod:  60        # wait 60s before scale-down
  minReplicaCount: 3         # always keep 3 pods running
  maxReplicaCount: 24        # MUST match partition count!
  triggers:
  - type: kafka
    metadata:
      bootstrapServers: kafka-brokers:9092
      consumerGroup:    order-processor
      topic:            orders
      lagThreshold:     "500"    # scale up if lag > 500/partition
      activationLagThreshold: "100"

# order-consumer-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-consumer
spec:
  replicas: 3   # KEDA overrides this
  template:
    spec:
      containers:
      - name: order-consumer
        env:
        - name: SPRING_KAFKA_LISTENER_CONCURRENCY
          value: "1"          # 1 thread per pod
        - name: SPRING_KAFKA_CONSUMER_PROPERTIES_GROUP_INSTANCE_ID
          valueFrom:
            fieldRef:
              fieldPath: metadata.name  # static membership

// Graceful shutdown — finish current batch
// application.yml:
// server.shutdown: graceful
// spring.lifecycle.timeout-per-shutdown-phase: 30s

@Bean
public KafkaListenerEndpointRegistry kafkaRegistry(
        KafkaListenerEndpointRegistry registry) {
    Runtime.getRuntime().addShutdownHook(new Thread(() -> {
        log.info("SIGTERM — stopping consumers gracefully");
        registry.stop();  // finish current batch, commit offsets
    }));
    return registry;
}`,
        tip: "In Kubernetes: set concurrency=1 per pod and scale pods via KEDA. One stuck consumer never blocks others. Clean separation of concerns.",
        warn: "maxReplicaCount MUST equal partition count. Extra consumers are idle. KEDA will create idle pods that consume memory and CPU for no benefit.",
      },
    ],
  },
];

const LEVEL_COLORS = {
  INTERMEDIATE: { bg: "#d1fae5", text: "#065f46", border: "#6ee7b7" },
  SENIOR:       { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd" },
  EXPERT:       { bg: "#fce7f3", text: "#9d174d", border: "#f9a8d4" },
};

export default function KafkaInterviewGuide() {
  const [activeTopic, setActiveTopic] = useState(1);
  const [openQ, setOpenQ] = useState({});
  const [showCode, setShowCode] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [copied, setCopied] = useState(null);

  const topic = TOPICS.find((t) => t.id === activeTopic);

  const filteredTopics = searchTerm
    ? TOPICS.filter(
        (t) =>
          t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.questions.some(
            (q) =>
              q.q.toLowerCase().includes(searchTerm.toLowerCase()) ||
              q.answer.toLowerCase().includes(searchTerm.toLowerCase())
          )
      )
    : TOPICS;

  const toggleQ = (key) =>
    setOpenQ((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleCode = (key) =>
    setShowCode((prev) => ({ ...prev, [key]: !prev[key] }));

  const copyCode = (code, key) => {
    navigator.clipboard.writeText(code);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const totalQuestions = TOPICS.reduce((s, t) => s + t.questions.length, 0);

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Inter', system-ui, sans-serif", background: "#f8fafc", overflow: "hidden" }}>
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <div style={{ width: 260, background: "#0f172a", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "18px 16px 14px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
              ⚡
            </div>
            <div>
              <div style={{ color: "white", fontWeight: 700, fontSize: 14, lineHeight: 1 }}>Kafka Interview</div>
              <div style={{ color: "#94a3b8", fontSize: 10, marginTop: 2, fontFamily: "monospace" }}>Senior Level Guide</div>
            </div>
          </div>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search topics..."
            style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.05)", color: "white", fontSize: 12, outline: "none", boxSizing: "border-box" }}
          />
        </div>
        {/* Stats */}
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
          {[["14", "Topics"], [String(totalQuestions), "Questions"]].map(([n, l]) => (
            <div key={l} style={{ flex: 1, padding: "8px 0", textAlign: "center" }}>
              <div style={{ color: "#f59e0b", fontWeight: 700, fontSize: 16 }}>{n}</div>
              <div style={{ color: "#64748b", fontSize: 10 }}>{l}</div>
            </div>
          ))}
        </div>
        {/* Nav */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
          {filteredTopics.map((t) => (
            <button
              key={t.id}
              onClick={() => { setActiveTopic(t.id); setSearchTerm(""); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "9px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                background: activeTopic === t.id ? "rgba(245,158,11,.15)" : "transparent",
                color: activeTopic === t.id ? "#f59e0b" : "#94a3b8",
                borderLeft: activeTopic === t.id ? "3px solid #f59e0b" : "3px solid transparent",
                textAlign: "left", marginBottom: 2, transition: "all .15s",
              }}
            >
              <span style={{ fontSize: 16, width: 22 }}>{t.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: activeTopic === t.id ? 600 : 400 }}>{t.title}</div>
                <div style={{ fontSize: 10, color: "#475569" }}>{t.questions.length} question{t.questions.length !== 1 ? "s" : ""}</div>
              </div>
            </button>
          ))}
        </nav>
        <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,.06)", color: "#334155", fontSize: 10, textAlign: "center" }}>
          Apache Kafka 3.x · Spring Boot 3.x
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {/* Topic Header */}
        <div style={{ background: "white", borderBottom: "1px solid #e2e8f0", padding: "20px 28px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: topic.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, border: `2px solid ${topic.color}20` }}>
              {topic.icon}
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>{topic.title}</h1>
              <p style={{ margin: "3px 0 0", color: "#64748b", fontSize: 13 }}>
                {topic.questions.length} question{topic.questions.length !== 1 ? "s" : ""} · Click to expand answers and code examples
              </p>
            </div>
          </div>
        </div>

        {/* Questions */}
        <div style={{ padding: "24px 28px", flex: 1 }}>
          {topic.questions.map((qObj, qi) => {
            const qKey = `${topic.id}-${qi}`;
            const isOpen = openQ[qKey];
            const isCodeOpen = showCode[qKey];
            const lc = LEVEL_COLORS[qObj.level] || LEVEL_COLORS.INTERMEDIATE;

            return (
              <div key={qKey} style={{ marginBottom: 16, borderRadius: 12, border: `1px solid ${isOpen ? topic.color + "40" : "#e2e8f0"}`, background: "white", overflow: "hidden", boxShadow: isOpen ? `0 4px 20px ${topic.color}15` : "0 1px 3px rgba(0,0,0,.04)", transition: "all .2s" }}>
                {/* Question header */}
                <button
                  onClick={() => toggleQ(qKey)}
                  style={{ width: "100%", padding: "18px 20px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 14, textAlign: "left" }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: topic.bg, display: "flex", alignItems: "center", justifyContent: "center", color: topic.color, fontWeight: 700, fontSize: 13, flexShrink: 0, border: `1px solid ${topic.color}30` }}>
                    Q{qi + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: lc.bg, color: lc.text, border: `1px solid ${lc.border}` }}>
                        {qObj.level}
                      </span>
                      <span style={{ color: "#94a3b8", fontSize: 11 }}>Topic {topic.id}</span>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", lineHeight: 1.5 }}>{qObj.q}</div>
                  </div>
                  <span style={{ color: topic.color, fontSize: 18, flexShrink: 0, marginTop: 4, transition: "transform .2s", transform: isOpen ? "rotate(180deg)" : "rotate(0)" }}>▾</span>
                </button>

                {/* Answer + Code */}
                {isOpen && (
                  <div style={{ borderTop: `1px solid ${topic.color}20` }}>
                    {/* Answer */}
                    <div style={{ padding: "16px 20px", background: "#f8fafc" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <span style={{ color: "#16a34a", fontSize: 13 }}>✓</span>
                        <span style={{ fontWeight: 600, fontSize: 12, color: "#15803d", textTransform: "uppercase", letterSpacing: .5 }}>Answer</span>
                      </div>
                      <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 13.5, color: "#1e293b", lineHeight: 1.75, fontFamily: "'Inter', system-ui, sans-serif" }}>
                        {qObj.answer}
                      </pre>
                    </div>

                    {/* Code toggle */}
                    {qObj.code && (
                      <div style={{ borderTop: "1px solid #e2e8f0" }}>
                        <button
                          onClick={() => toggleCode(qKey)}
                          style={{ width: "100%", padding: "12px 20px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: "#475569", fontSize: 13, fontWeight: 500 }}
                        >
                          <span style={{ fontFamily: "monospace", background: "#1e293b", color: "#93c5fd", padding: "2px 7px", borderRadius: 4, fontSize: 11 }}>{"</>"}</span>
                          {isCodeOpen ? "Hide" : "Show"} Spring Boot Code
                          <span style={{ marginLeft: "auto", fontSize: 12, color: topic.color, transition: "transform .2s", transform: isCodeOpen ? "rotate(180deg)" : "none" }}>▾</span>
                        </button>

                        {isCodeOpen && (
                          <div style={{ position: "relative", borderTop: "1px solid #e2e8f0" }}>
                            <button
                              onClick={() => copyCode(qObj.code, qKey)}
                              style={{ position: "absolute", top: 10, right: 10, zIndex: 1, padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", background: copied === qKey ? "#16a34a" : "rgba(255,255,255,.15)", color: "white", fontSize: 11, fontWeight: 500 }}
                            >
                              {copied === qKey ? "✓ Copied!" : "Copy"}
                            </button>
                            <pre style={{ margin: 0, padding: "18px 20px", background: "#0a1628", color: "#a5d8ff", fontSize: 12.5, lineHeight: 1.75, overflowX: "auto", fontFamily: "'JetBrains Mono', 'Courier New', monospace" }}>
                              {qObj.code}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tip / Warn */}
                    {(qObj.tip || qObj.warn) && (
                      <div style={{ padding: "12px 20px 16px", display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid #e2e8f0" }}>
                        {qObj.tip && (
                          <div style={{ padding: "10px 14px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", fontSize: 13, lineHeight: 1.6 }}>
                            <strong>▶ Expert Tip: </strong>{qObj.tip}
                          </div>
                        )}
                        {qObj.warn && (
                          <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 13, lineHeight: 1.6 }}>
                            <strong>⚠ Pitfall: </strong>{qObj.warn}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Next topic button */}
          {activeTopic < TOPICS.length && (
            <div style={{ marginTop: 8, textAlign: "right" }}>
              <button
                onClick={() => { setActiveTopic(activeTopic + 1); setOpenQ({}); setShowCode({}); }}
                style={{ padding: "10px 20px", borderRadius: 8, border: `2px solid ${topic.color}`, background: "transparent", color: topic.color, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
              >
                Next: {TOPICS[activeTopic]?.title} →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
