# ⚡ Kafka Senior Interview Guide

> **14 Topics · 28 Questions · Full Spring Boot Code Examples**
>
> Apache Kafka 3.x · Spring Boot 3.x · Senior / Expert Level

---

## 📋 Table of Contents

1. [⚡ Partitioning Strategy](#partitioning-strategy)
2. [🔄 Rebalancing](#rebalancing)
3. [🎯 Exactly-Once Semantics](#exactly-once-semantics)
4. [🔒 ISR and Replication](#isr-and-replication)
5. [📊 Consumer Lag](#consumer-lag)
6. [💳 Transactions](#transactions)
7. [🔁 Idempotency](#idempotency)
8. [⚙️ Kafka Internals](#kafka-internals)
9. [🚀 Performance Tuning](#performance-tuning)
10. [♻️ Retry + DLQ Architecture](#retry--dlq-architecture)
11. [🌊 Kafka Streams](#kafka-streams)
12. [📋 Schema Evolution](#schema-evolution)
13. [📋 Ordering Guarantees](#ordering-guarantees)
14. [📈 Scaling Consumers](#scaling-consumers)

---

## ⚡ Partitioning Strategy

> Key design · Custom partitioners · Hot partitions · Rebalancing impact

### Q1 — How does Kafka decide which partition a message goes to?

![SENIOR](https://img.shields.io/badge/Level-SENIOR-blue)

**Answer:**

Kafka uses three strategies:

| Strategy | Guarantee & Use Case |
|---|---|
| **Null key** (round-robin/sticky) | No ordering, max throughput. Use for independent events (logs, metrics). |
| **Key-based hash** | `murmur2(key) % numPartitions`. Same key → ALWAYS same partition. Use for entity events. |
| **Custom partitioner** | Business logic routing — priority lanes, geo-routing, VIP customers. |
| **Explicit partition** | Full control. Use for manual rebalancing or data migration. |

```java
// 1. Key-based — same customerId always same partition
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
            return Utils.toPositive(Utils.murmur2(keyBytes)) % VIP_PARTITIONS;
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
}
```

> 💡 **Expert Tip:** Choose partition key based on entity needing ordering. E-commerce: `orderId` for lifecycle events, `customerId` for account activity.

> ⚠️ **Pitfall:** Low-cardinality keys (e.g., `country='US'`) create hot partitions — 80% traffic hits one partition. Monitor partition-level lag individually.

---

### Q2 — What happens when you increase partition count for an existing topic?

![EXPERT](https://img.shields.io/badge/Level-EXPERT-red)

**Answer:**

Increasing partitions **BREAKS key-based ordering** for existing keys. The hash function `murmur2(key) % numPartitions` changes — same key may now route to a DIFFERENT partition.

| Impact | Detail |
|---|---|
| Existing messages | Remain in original partitions. Not reshuffled. |
| New messages | Same key may route to different partition — ordering gap! |
| Consumer groups | ALL consumers trigger rebalancing — brief pause. |
| Data consistency | Consumers reading by key may see out-of-order events. |

```java
// Safe migration approach:
// 1. Create new topic with higher partition count
AdminClient.create(props).createTopics(List.of(
    new NewTopic("orders-v2", 24, (short) 3)));

// 2. Dual-publish during migration period
public void sendOrder(OrderEvent event) {
    kafkaTemplate.send("orders",    event.getId(), event); // old
    kafkaTemplate.send("orders-v2", event.getId(), event); // new
}

// 3. Cut over consumers to new topic when all caught up
// 4. Decommission old topic after validation
```

> 💡 **Expert Tip:** Over-provision upfront: 6→12→24 is a safe growth path. Never reduce partitions (not supported by Kafka).

> ⚠️ **Pitfall:** Never add partitions to a topic requiring strict per-key ordering without a migration plan. Coordinate with ALL teams first.

---

## 🔄 Rebalancing

> Eager (stop-the-world) · Cooperative · Rebalance listeners · Static membership

### Q3 — Explain Eager vs Cooperative rebalancing. How do you configure Cooperative in Spring Boot?

![SENIOR](https://img.shields.io/badge/Level-SENIOR-blue)

**Answer:**

| Aspect | Eager (old default) | Cooperative (Kafka 2.4+) |
|---|---|---|
| Mechanism | ALL consumers revoke ALL partitions, stop, wait | Only partitions that NEED to move are revoked |
| Downtime | Full stop-the-world (seconds to minutes) | Near-zero impact |
| Lag impact | Full lag spike | Minimal |
| Config | `RangeAssignor` (default) | `CooperativeStickyAssignor` |

```yaml
# application.yml — Enable Cooperative Sticky Rebalancing
spring:
  kafka:
    consumer:
      group-id: my-consumer-group
      properties:
        partition.assignment.strategy: >
          org.apache.kafka.clients.consumer.CooperativeStickyAssignor
        session.timeout.ms: 30000
        heartbeat.interval.ms: 10000
        max.poll.interval.ms: 300000
        # Static membership — prevents rebalance on pod restart
        group.instance.id: ${POD_NAME:consumer-instance-1}
```

```java
// ConsumerRebalanceListener — flush state before revocation
@Component
@Slf4j
public class StatefulRebalanceListener
        implements ConsumerAwareRebalanceListener {

    @Override
    public void onPartitionsRevokedBeforeCommit(
            Consumer<?, ?> consumer,
            Collection<TopicPartition> partitions) {
        log.info("Partitions being revoked: {}", partitions);
        stateBuffer.flushAll(partitions);     // flush in-memory state
        consumer.commitSync(
            offsetTracker.getOffsets(partitions)); // commit offsets
    }

    @Override
    public void onPartitionsAssigned(
            Consumer<?, ?> consumer,
            Collection<TopicPartition> partitions) {
        stateBuffer.restoreState(partitions); // restore state
    }
}

// Register in container factory
@Bean
public ConcurrentKafkaListenerContainerFactory<?, ?> factory(
        ConsumerFactory<?, ?> cf) {
    var factory = new ConcurrentKafkaListenerContainerFactory<>();
    factory.setConsumerFactory(cf);
    factory.getContainerProperties()
           .setConsumerRebalanceListener(rebalanceListener);
    return factory;
}
```

> 💡 **Expert Tip:** Switch to `CooperativeStickyAssignor` in production. It reduces rebalance impact from full stop to near-zero.

> ⚠️ **Pitfall:** Don't do expensive I/O in `onPartitionsRevokedBeforeCommit` without a timeout guard — slow revocation triggers ANOTHER rebalance.

---

### Q4 — What causes excessive rebalancing and how do you fix it?

![EXPERT](https://img.shields.io/badge/Level-EXPERT-red)

**Answer:**

| Root Cause | Diagnosis & Fix |
|---|---|
| `max.poll.interval.ms` exceeded | Consumer processes too slowly. Reduce `max.poll.records` or increase `max.poll.interval.ms`. |
| `session.timeout.ms` exceeded | Heartbeat not sent (GC pause). Increase `session.timeout.ms` or reduce GC pauses. |
| Consumer crash/restart | Rolling deployments trigger rebalance. Use `group.instance.id` static membership. |
| Network partitions | Set `heartbeat.interval.ms` = `session.timeout.ms / 3`. |

```yaml
spring:
  kafka:
    consumer:
      properties:
        # Fix 1: Static group membership
        group.instance.id: ${POD_NAME:consumer-pod-1}
        # Fix 2: Tune timeouts
        heartbeat.interval.ms: 3000
        session.timeout.ms: 30000
        max.poll.interval.ms: 600000
        # Fix 3: Reduce records per poll
        max.poll.records: 50
        # Fix 4: Cooperative rebalancing
        partition.assignment.strategy: >
          org.apache.kafka.clients.consumer.CooperativeStickyAssignor
```

> 💡 **Expert Tip:** Set `group.instance.id` to the pod name in Kubernetes. Pod restarts rejoin with same identity — no rebalance triggered.

> ⚠️ **Pitfall:** A rebalance storm (continuous rebalancing) halts all consumption. Check `max.poll.interval.ms` first — it's the #1 cause.

---

## 🎯 Exactly-Once Semantics

> Idempotent producer · Transactions · read_committed isolation

### Q5 — What are the three delivery guarantees in Kafka?

![INTERMEDIATE](https://img.shields.io/badge/Level-INTERMEDIATE-green)

**Answer:**

| Guarantee | Config | Behaviour |
|---|---|---|
| **At-most-once** | `enable-auto-commit=true`, `acks=0` | Offset committed BEFORE processing. Messages **lost** on crash. Only for non-critical logs. |
| **At-least-once** | `enable-auto-commit=false`, `acks=all`, manual ack AFTER | **Duplicates** possible on retry/rebalance. Most common pattern. |
| **Exactly-once** | `enable-idempotence=true` + `transactional.id` + `isolation-level=read_committed` | No loss, no duplicates. ~5-10% latency overhead. |

```yaml
# application.yml — Exactly-Once Semantics (EOS)
spring:
  kafka:
    producer:
      acks: all
      enable-idempotence: true
      retries: 2147483647
      transaction-id-prefix: payment-tx-
      properties:
        max.in.flight.requests.per.connection: 5
    consumer:
      enable-auto-commit: false
      isolation-level: read_committed
      properties:
        auto.offset.reset: earliest
```

```java
// EOS: Consume-Transform-Produce atomically
@Service
@RequiredArgsConstructor
public class PaymentEosService {

    @KafkaListener(topics = "payments", groupId = "payment-eos")
    @Transactional("kafkaTransactionManager")
    public void processPayment(PaymentEvent event, Acknowledgment ack) {
        // 1. DB update — part of Kafka transaction
        paymentRepo.deductBalance(event.getAccountId(), event.getAmount());

        // 2. Publish — SAME Kafka transaction
        kafkaTemplate.send("notifications",
            event.getCustomerId(),
            NotificationEvent.builder()
                .paymentId(event.getPaymentId())
                .type("PAYMENT_PROCESSED")
                .build());

        // 3. Commit offset atomically with the produce
        ack.acknowledge();
    }
}

@Bean
public KafkaTransactionManager<String, Object> kafkaTxManager(
        ProducerFactory<String, Object> pf) {
    return new KafkaTransactionManager<>(pf);
}
```

> 💡 **Expert Tip:** Enable EOS only for financial transactions, inventory, and payments where duplicates cause real harm.

> ⚠️ **Pitfall:** Combining Kafka + DB transactions requires `ChainedKafkaTransactionManager`. Without it one may commit while the other rolls back.

---

## 🔒 ISR and Replication

> In-Sync Replicas · acks · min.insync.replicas · Leader election

### Q6 — What is the ISR set and what is the production golden rule?

![SENIOR](https://img.shields.io/badge/Level-SENIOR-blue)

**Answer:**

**ISR (In-Sync Replica set)** = replicas fully caught up with the partition leader (within `replica.lag.time.max.ms = 30s`). Only ISR members can be elected as leader.

### 🏆 The Golden Rule

```
replication.factor=3  +  acks=all  +  min.insync.replicas=2
```

This tolerates **1 broker failure with ZERO data loss**.

| Config | Effect |
|---|---|
| `replication.factor=3` | 3 copies of every message. Survive 2 broker failures. |
| `acks=all` | Leader waits for ALL ISR members to write before acking. |
| `acks=1` | Leader acks immediately. Risk of data loss on follower lag. |
| `min.insync.replicas=2` | Write fails if fewer than 2 ISR replicas available. |
| `unclean.leader.election=false` | Never allow out-of-sync replica as leader. |

```java
// Topic creation with production durability settings
@Bean
public NewTopic ordersTopic() {
    return TopicBuilder.name("orders")
        .partitions(12)
        .replicas(3)
        .config(TopicConfig.MIN_IN_SYNC_REPLICAS_CONFIG, "2")
        .config(TopicConfig.UNCLEAN_LEADER_ELECTION_ENABLE_CONFIG, "false")
        .config(TopicConfig.RETENTION_MS_CONFIG, "604800000")
        .build();
}

// ISR Monitor — alert on shrinkage
@Scheduled(fixedDelay = 30_000)
public void checkIsrHealth() throws Exception {
    DescribeTopicsResult result = adminClient.describeTopics(List.of("orders"));
    result.allTopicNames().get().forEach((topic, desc) ->
        desc.partitions().forEach(pi -> {
            int replicas = pi.replicas().size();
            int isr      = pi.isr().size();
            if (isr < replicas) {
                log.warn("ISR SHRINKAGE: topic={} partition={} isr={}/{}",
                    topic, pi.partition(), isr, replicas);
                alertService.warn("Kafka ISR shrinkage on " + topic);
            }
        })
    );
}
```

> 💡 **Expert Tip:** ISR shrinkage is a leading indicator of data loss risk. Alert immediately when `isr < replication.factor`.

> ⚠️ **Pitfall:** `unclean.leader.election.enable=true` (old Kafka default) allows an out-of-sync replica as leader → **MESSAGE LOSS**.

---

## 📊 Consumer Lag

> Monitoring · Root causes · Prometheus metrics · Alerting thresholds

### Q7 — What is consumer lag and how do you monitor it in production?

![SENIOR](https://img.shields.io/badge/Level-SENIOR-blue)

**Answer:**

**Consumer lag** = `Log End Offset − Consumer Current Offset`

| State | Meaning |
|---|---|
| Growing lag | Consumer **slower** than producer → crisis |
| Stable lag | Keeping up → acceptable |
| Zero lag | Fully caught up → ideal |

**Alert thresholds:**
- ⚠️ Warn: lag > **1,000**
- 🚨 Critical: lag > **10,000**
- Also alert on **lag rate** (growing > 100/sec)

| Root Cause | Fix |
|---|---|
| Slow processing | Optimise logic, go async, use batch processing |
| Insufficient consumers | Add instances up to partition count |
| GC pauses / OOM | Tune JVM, reduce `max.poll.records`, use G1GC |
| Database bottleneck | Use `saveAll()` bulk insert, add indexes |
| Rebalancing storm | `CooperativeStickyAssignor` + static membership |
| Deserialization errors | `ErrorHandlingDeserializer` + route to DLT |

```java
// Consumer Lag Monitor with Prometheus
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

        Map<TopicPartition, OffsetAndMetadata> committed =
            adminClient.listConsumerGroupOffsets(groupId)
                       .partitionsToOffsetAndMetadata().get();

        Map<TopicPartition, Long> endOffsets = adminClient
            .listOffsets(committed.keySet().stream()
                .collect(Collectors.toMap(
                    tp -> tp, tp -> OffsetSpec.latest())))
            .all().get().entrySet().stream()
            .collect(Collectors.toMap(
                Map.Entry::getKey, e -> e.getValue().offset()));

        committed.forEach((tp, om) -> {
            long lag = Math.max(0,
                endOffsets.getOrDefault(tp, 0L) - om.offset());

            Gauge.builder("kafka.consumer.lag",
                Tags.of("group", groupId,
                        "topic", tp.topic(),
                        "partition", String.valueOf(tp.partition())),
                () -> lag).register(registry);

            if (lag > 10_000) {
                log.error("CRITICAL lag: topic={} p={} lag={}",
                    tp.topic(), tp.partition(), lag);
                alertService.sendCritical("Kafka lag CRITICAL: " + lag);
            } else if (lag > 1_000) {
                log.warn("HIGH lag: topic={} p={} lag={}",
                    tp.topic(), tp.partition(), lag);
            }
        });
    }
}
```

```
# Grafana PromQL queries:
# Lag per partition:   kafka_consumer_lag{group="order-processor-group"}
# Total lag:           sum(kafka_consumer_lag{group="order-processor-group"})
# Lag rate (growing?): rate(kafka_consumer_lag[5m])
```

> 💡 **Expert Tip:** A stable lag of 50,000 is safer than a growing lag of 100. Always monitor the **rate of change**, not just absolute value.

---

## 💳 Transactions

> transactional.id · Zombie fencing · Outbox pattern · Atomic multi-topic

### Q8 — How do Kafka transactions work? What is zombie fencing?

![SENIOR](https://img.shields.io/badge/Level-SENIOR-blue)

**Answer:**

| Phase | What Happens |
|---|---|
| `initTransactions()` | Producer registers with Transaction Coordinator. Gets PID + epoch. |
| `beginTransaction()` | Marks start. No broker communication yet. |
| `send()` calls | Records buffered. Coordinator notes involved partitions. |
| `commitTransaction()` | Two-phase commit: COMMIT marker written to all partitions. |
| `abortTransaction()` | ABORT marker written. `read_committed` consumers skip these records. |

**Zombie Fencing:** If a producer crashes and restarts with the same `transactional.id`, the broker assigns a **higher epoch**. The old zombie producer's commit attempt is rejected with `ProducerFencedException`.

```java
// Atomic multi-topic publish
@Service
public class OrderTransactionService {
    public void placeOrderAtomically(Order order) {
        kafkaTemplate.executeInTransaction(ops -> {
            ops.send("orders",    order.getId(), new OrderCreatedEvent(order));
            ops.send("inventory", order.getId(), new ReserveInventoryEvent(order));
            ops.send("audit",     order.getId(), new AuditEvent("ORDER_PLACED", order));
            return true; // all commit or all rollback
        });
    }
}
```

```yaml
spring:
  kafka:
    producer:
      transaction-id-prefix: order-service-tx-
      acks: all
      enable-idempotence: true
```

> 💡 **Expert Tip:** Use Debezium CDC instead of polling for the Outbox Pattern — reads PostgreSQL WAL logs directly, sub-second latency, zero polling overhead.

---

### Q9 — Implement the Transactional Outbox Pattern (DB + Kafka atomically, no 2PC).

![EXPERT](https://img.shields.io/badge/Level-EXPERT-red)

**Answer:**

Write the Kafka event to an **outbox table** in the SAME DB transaction as business data. A separate poller publishes to Kafka. Zero 2PC, zero data loss.

```java
// Outbox entity (same database as business data)
@Entity
@Table(name = "outbox_events")
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class OutboxEvent {
    @Id @GeneratedValue private Long id;
    private String aggregateId;
    private String eventType;
    private String topic;
    @Column(columnDefinition = "TEXT")
    private String payload;           // JSON-serialized event
    private boolean published  = false;
    private LocalDateTime createdAt   = LocalDateTime.now();
    private LocalDateTime publishedAt;
    private int retryCount = 0;
}

// Service — one DB transaction for BOTH business + outbox
@Service
@Transactional   // single DB transaction
public class OrderService {
    public Order createOrder(CreateOrderRequest req) {
        inventoryRepo.reserve(req.getProductId(), req.getQuantity());
        Order order = orderRepo.save(Order.from(req));

        // Write outbox event — SAME DB TRANSACTION (atomic!)
        outboxRepo.save(OutboxEvent.builder()
            .aggregateId(order.getId())
            .eventType("OrderCreated")
            .topic("orders")
            .payload(toJson(new OrderCreatedEvent(order)))
            .build());
        return order;
    }
}

// Outbox Publisher — polls and publishes to Kafka
@Component
@Slf4j
public class OutboxPublisher {

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
                ev.setPublishedAt(LocalDateTime.now());
            } catch (Exception e) {
                ev.setRetryCount(ev.getRetryCount() + 1);
            }
            outboxRepo.save(ev);
        }
    }
}
```

> ⚠️ **Pitfall:** The polling publisher adds ~500ms latency. Replace with Debezium CDC for sub-second, zero-polling Outbox in production.

---

## 🔁 Idempotency

> PID + sequence numbers · Producer-side · Consumer-side deduplication

### Q10 — How does Kafka's idempotent producer work? How do you implement an idempotent consumer?

![SENIOR](https://img.shields.io/badge/Level-SENIOR-blue)

**Answer:**

**Producer-side** (`enable.idempotence=true`):

| Concept | Detail |
|---|---|
| Producer ID (PID) | Assigned by broker on first connection. Unique per producer instance. |
| Sequence Number | Monotonically increasing per PID + partition. |
| Duplicate detection | Broker rejects records with sequence ≤ last committed for that PID+partition. |
| Session scope | New producer restart = new PID. Cannot detect cross-session dupes. |

**Consumer-side** (application must implement):
- Idempotent producer prevents **send-side** duplicates only
- Consumer duplicates happen from: rebalancing, at-least-once semantics
- Solution: track processed event IDs in **Redis** (fast) + **DB** (durable)

```yaml
spring:
  kafka:
    producer:
      enable-idempotence: true
      acks: all
      retries: 2147483647
      properties:
        max.in.flight.requests.per.connection: 5
```

```java
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
            processedRepo.save(
                new ProcessedEvent(eventId, "payment", Instant.now()));
            ack.acknowledge();
        } catch (Exception e) {
            redis.delete(redisKey);  // allow retry
            // Do NOT ack — Kafka will redeliver
        }
    }
}

@Entity
@Table(name = "processed_events",
    uniqueConstraints = @UniqueConstraint(
        columnNames = {"event_id", "event_type"}))
public class ProcessedEvent {
    @Id @GeneratedValue        private Long id;
    @Column(unique = true)     private String eventId;
    private String eventType;
    private Instant processedAt;
}
```

> 💡 **Expert Tip:** Redis SETNX handles 99.9% of deduplication in microseconds. DB unique constraint is the safety net when Redis TTL expires.

> ⚠️ **Pitfall:** `enable.idempotence` prevents PRODUCER retry duplicates only. Always implement consumer-side deduplication separately.

---

## ⚙️ Kafka Internals

> Log segments · Page cache · Zero-copy · Compaction · KRaft

### Q11 — Explain Kafka's storage architecture: log segments, page cache, and zero-copy.

![EXPERT](https://img.shields.io/badge/Level-EXPERT-red)

**Answer:**

| File | Purpose |
|---|---|
| `.log` | Actual message bytes — sequential appends only. Never modified. |
| `.index` | Sparse map: offset → byte position in `.log` (fast binary search). |
| `.timeindex` | Maps timestamp → offset (for time-based consumer seeks). |
| Active segment | Current file being written. One per partition. |

**Page Cache:** Kafka relies entirely on the OS page cache. Recent data served from RAM, not disk.

**Zero-Copy** (`sendfile()` syscall):
- Traditional: `disk → kernel buffer → user space → socket → network`
- Zero-copy:   `disk page cache → network socket` (bypassing user space)
- Result: near wire-speed throughput, minimal CPU usage

```properties
# Broker storage settings
log.segment.bytes=1073741824       # roll new segment every 1GB
log.segment.ms=604800000           # or every 7 days
log.retention.hours=168            # delete after 7 days
log.retention.bytes=107374182400   # or 100GB per partition
log.cleanup.policy=delete          # 'delete', 'compact', 'compact,delete'
```

```java
// Log compaction topic — keeps only latest value per key
@Bean
public NewTopic customerProfilesTopic() {
    return TopicBuilder.name("customer-profiles")
        .partitions(12).replicas(3)
        .config(TopicConfig.CLEANUP_POLICY_CONFIG, "compact")
        .config(TopicConfig.MIN_COMPACTION_LAG_MS_CONFIG, "3600000")
        .build();
}
// Replaying compacted topic from offset 0 gives CURRENT state
// of every customer — not the full history.

// KRaft mode (Kafka 3.3+ — no ZooKeeper!)
// kraft/server.properties:
// process.roles=broker,controller
// node.id=1
// controller.quorum.voters=1@kafka1:9093,2@kafka2:9093,3@kafka3:9093
//
// Spring Boot client — NO change needed. KRaft is broker-side.
```

> 💡 **Expert Tip:** Give Kafka brokers as much RAM as possible. OS page cache IS Kafka's read cache. More RAM = more data served without disk I/O.

> ⚠️ **Pitfall:** Compacted topics are NOT suitable for event sourcing where you need the full history. Use `compact,delete` for both compaction AND time-based retention.

---

## 🚀 Performance Tuning

> Throughput vs latency · Batch size · Compression · JVM · Consumer tuning

### Q12 — What are the key configuration knobs for throughput vs latency?

![SENIOR](https://img.shields.io/badge/Level-SENIOR-blue)

**Answer:**

| Config | Throughput Mode | Low-Latency Mode |
|---|---|---|
| `linger.ms` | 20ms (wait to fill batch) | 0ms (send immediately) |
| `batch.size` | 131072 bytes (128KB) | 16384 bytes (16KB default) |
| `compression.type` | `snappy` or `lz4` | `none` |
| `acks` | `1` (faster) | `all` (durable) |
| `max.poll.records` | 500-1000 | 50-100 |
| `fetch.min.bytes` | 1MB | 1 byte |

```yaml
# HIGH THROUGHPUT
spring.kafka.producer:
  acks: 1
  compression-type: snappy
  batch-size: 131072
  buffer-memory: 67108864
  properties:
    linger.ms: 20

# LOW LATENCY
spring.kafka.producer:
  acks: 1
  compression-type: none
  batch-size: 1
  properties:
    linger.ms: 0
    max.block.ms: 1000
```

```java
// Batch listener — 10-50x faster DB inserts
@KafkaListener(topics = "orders", containerFactory = "batchFactory")
public void processOrderBatch(
        List<ConsumerRecord<String, OrderEvent>> records,
        Acknowledgment ack) {
    List<Order> orders = records.stream()
        .map(r -> mapToOrder(r.value()))
        .collect(Collectors.toList());
    orderRepository.saveAll(orders); // single BULK INSERT
    ack.acknowledge();
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

# JVM tuning:
# -XX:+UseG1GC -XX:MaxGCPauseMillis=20
# -Xms2g -Xmx4g -XX:+UseStringDeduplication
```

> 💡 **Expert Tip:** Best default for most services: `linger.ms=10`, `batch.size=65536`, `compression=snappy`. Gives 3-5x throughput improvement with ~10ms extra latency.

---

## ♻️ Retry + DLQ Architecture

> Non-blocking retry · @RetryableTopic · Dead Letter Topics · Poison pills

### Q13 — Design a non-blocking retry architecture with exponential backoff and DLT.

![EXPERT](https://img.shields.io/badge/Level-EXPERT-red)

**Answer:**

Messages flow through **retry topics** with increasing delays:

```
orders
  → orders-retry-1  (wait 1 min)
  → orders-retry-5  (wait 5 min)
  → orders-retry-30 (wait 30 min)
  → orders.DLT      (dead letter — manual review)
```

The main consumer **never blocks**. Other messages continue processing.

```java
// @RetryableTopic — Spring Kafka 2.7+
@Component
@Slf4j
public class PaymentConsumer {

    @RetryableTopic(
        attempts = "4",   // 1 original + 3 retries
        backoff = @Backoff(
            delay     = 60_000,    // 1 min → 5 min → 25 min
            multiplier = 5,
            maxDelay  = 1_800_000  // cap at 30 min
        ),
        dltTopicSuffix   = ".DLT",
        retryTopicSuffix = "-retry",
        include  = {ExternalServiceException.class,
                    TimeoutException.class},
        exclude  = {ValidationException.class},
        autoCreateTopics = "true"
    )
    @KafkaListener(topics = "payments", groupId = "payment-processor")
    public void processPayment(PaymentEvent event) {
        paymentGateway.charge(event);
    }

    @DltHandler
    public void handleDlt(
            PaymentEvent event,
            @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,
            @Header(value = "DLT-Exception-Message",
                    required = false) String error) {
        log.error("Payment {} exhausted retries. error={}",
            event.getPaymentId(), error);
        alertService.sendCritical(
            "Payment DLT: " + event.getPaymentId());
        deadLetterRepository.save(
            DeadLetterRecord.from(event, error));
    }
}
```

```java
// DefaultErrorHandler — lower-level control
@Bean
public ConcurrentKafkaListenerContainerFactory<String, Object>
        retryableFactory(ConsumerFactory<String, Object> cf,
                         KafkaTemplate<String, Object> tpl) {

    DeadLetterPublishingRecoverer recoverer =
        new DeadLetterPublishingRecoverer(tpl,
            (record, ex) -> new TopicPartition(
                record.topic() + ".DLT", record.partition()));

    ExponentialBackOffWithMaxRetries backoff =
        new ExponentialBackOffWithMaxRetries(3);
    backoff.setInitialInterval(1_000L);
    backoff.setMultiplier(2.0);
    backoff.setMaxInterval(30_000L);

    DefaultErrorHandler handler =
        new DefaultErrorHandler(recoverer, backoff);
    handler.addNotRetryableExceptions(
        JsonParseException.class, ValidationException.class);

    var factory = new ConcurrentKafkaListenerContainerFactory<String, Object>();
    factory.setConsumerFactory(cf);
    factory.setCommonErrorHandler(handler);
    return factory;
}
```

> 💡 **Expert Tip:** `@RetryableTopic` (Spring Kafka 2.7+) automatically creates retry topics, registers consumers, and handles delay timing. Use it — don't reinvent the wheel.

> ⚠️ **Pitfall:** Never retry forever on the main consumer thread. A poison pill blocks ALL messages on that partition indefinitely. Always cap retries and route to DLT.

---

## 🌊 Kafka Streams

> KStream vs KTable · Windowing · Aggregation · Joins · Interactive Queries

### Q14 — Difference between KStream and KTable? Implement real-time fraud detection.

![EXPERT](https://img.shields.io/badge/Level-EXPERT-red)

**Answer:**

| Aspect | KStream | KTable |
|---|---|---|
| Represents | Infinite stream of **events** | **Latest state** per key (materialised view) |
| New record | INSERT — every record matters | UPSERT — only latest per key |
| Use for | Clicks, transactions, orders | User profiles, balances, inventory |
| Storage | Stateless | Embedded RocksDB state store |
| Join with | Stream-Table join: enrich events with current state | — |

**Windowing types:**
- **Tumbling**: fixed, non-overlapping (count per 10-min period)
- **Hopping**: fixed size, overlapping (moving average)
- **Sliding**: event-time based, overlapping
- **Session**: activity-based gaps

```java
// Fraud Detection — 5+ transactions >$500 in 10-min window
@Configuration
@EnableKafkaStreams
public class FraudDetectionStreams {

    @Bean
    public KStream<String, Transaction> fraudDetection(
            StreamsBuilder builder) {

        KStream<String, Transaction> txStream = builder.stream(
            "transactions",
            Consumed.with(Serdes.String(), transactionSerde()));

        KTable<Windowed<String>, Long> counts = txStream
            .filter((customerId, tx) ->
                tx.getAmount().compareTo(new BigDecimal("500")) > 0)
            .groupByKey(Grouped.with(Serdes.String(), transactionSerde()))
            .windowedBy(TimeWindows.ofSizeWithNoGrace(
                Duration.ofMinutes(10)))
            .count(Materialized.as("fraud-count-store"));

        counts.toStream()
            .filter((windowedKey, count) -> count >= 5)
            .map((windowedKey, count) -> KeyValue.pair(
                windowedKey.key(),
                FraudAlert.builder()
                    .customerId(windowedKey.key())
                    .txCount(count)
                    .windowStart(windowedKey.window().startTime())
                    .windowEnd(windowedKey.window().endTime())
                    .severity(count >= 10 ? "CRITICAL" : "HIGH")
                    .build()))
            .to("fraud-alerts", Produced.with(
                Serdes.String(), fraudAlertSerde()));

        return txStream;
    }
}
```

```yaml
spring:
  kafka:
    streams:
      application-id: fraud-detection-streams
      properties:
        commit.interval.ms: 1000
        cache.max.bytes.buffering: 10485760  # 10MB
        num.stream.threads: 4
```

> 💡 **Expert Tip:** Kafka Streams maintains local RocksDB state stores. Interactive Queries let you query them via REST API — no separate DB needed for real-time aggregations.

> ⚠️ **Pitfall:** Tumbling windows miss late-arriving events. Use `TimeWindows.ofSizeAndGrace(10min, 5min)` to handle late arrivals in production.

---

## 📋 Schema Evolution

> Schema Registry · Avro · Compatibility modes · Safe migration

### Q15 — What are Schema Registry compatibility modes and how do you safely migrate schemas?

![SENIOR](https://img.shields.io/badge/Level-SENIOR-blue)

**Answer:**

| Mode | Rule |
|---|---|
| `BACKWARD` (default) | New schema reads data from **previous** schema. Add optional fields with defaults. |
| `FORWARD` | Previous schema reads data from **new** schema. Consumers can lag behind. |
| `FULL` | Both BACKWARD and FORWARD. Add/remove only optional fields with defaults. |
| `FULL_TRANSITIVE` | ⭐ **Recommended for production** — all versions always interoperable. |
| `NONE` | No check. Never use in production. |

**Safe evolution rules:**
- ✅ Add field **with** default value
- ✅ Remove field that **had** a default value
- ✅ Rename field using `aliases`
- ❌ Change field type (e.g., `string → int`)
- ❌ Rename without `aliases`
- ❌ Remove field without a default

```json
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
    {"name": "region",   "type": ["null","string"], "default": null},
    {"name": "priority", "type": "string", "default": "STANDARD"},
    // Renamed field — use aliases
    {"name": "totalAmount", "type": "double", "default": 0.0,
     "aliases": ["amount"]}
  ]
}
```

```yaml
spring:
  kafka:
    properties:
      schema.registry.url: http://schema-registry:8081
      auto.register.schemas: false  # register via CI/CD in prod!
    producer:
      value-serializer: io.confluent.kafka.serializers.KafkaAvroSerializer
    consumer:
      value-deserializer: io.confluent.kafka.serializers.KafkaAvroDeserializer
      properties:
        specific.avro.reader: true
```

> 💡 **Expert Tip:** Register schemas in CI/CD before deploying. Use `auto.register.schemas=false` in production.

> ⚠️ **Pitfall:** Changing a field type is ALWAYS a breaking change — even `int → long`. Version the topic (e.g., `orders-v2`) for breaking changes.

---

## 📋 Ordering Guarantees

> Partition-level order · Key design · max.in.flight reordering trap

### Q16 — How do you design for ordering? Can retries break message order?

![SENIOR](https://img.shields.io/badge/Level-SENIOR-blue)

**Answer:**

**Ordering rules:**
- Within a partition: ✅ **GUARANTEED** order
- Across partitions: ❌ **NO** ordering guarantee
- The partition key IS your ordering boundary

| Key Choice | Ordering Scope |
|---|---|
| `orderId` | All order lifecycle events ordered: Created→Paid→Shipped→Delivered |
| `customerId` | All customer events ordered (account statements) |
| `null` key | No ordering anywhere (independent events only) |
| 1 partition | Global ordering — max 1 consumer — not production-scalable |

**Retry reordering trap:**

| Config | Ordering Safe? |
|---|---|
| `retries>0`, `max.in.flight=5`, no idempotence | ❌ REORDERING POSSIBLE |
| `max.in.flight=1` | ✅ Safe but low throughput |
| `enable.idempotence=true` + `max.in.flight=5` | ✅ Safe AND good throughput |

```java
// All order lifecycle events use orderId as key
// → same partition → guaranteed delivery order
@Service
public class OrderEventProducer {
    public void orderCreated(Order order) {
        kafkaTemplate.send("order-events", order.getId(),  // KEY = orderId
            new OrderCreatedEvent(order));
    }
    public void orderPaid(String orderId, Payment payment) {
        kafkaTemplate.send("order-events", orderId,        // SAME partition!
            new OrderPaidEvent(orderId, payment));
    }
    public void orderDelivered(String orderId) {
        kafkaTemplate.send("order-events", orderId,
            new OrderDeliveredEvent(orderId));
    }
}
```

```yaml
# Correct config: ordering + throughput
spring.kafka.producer:
  enable-idempotence: true
  acks: all
  retries: 2147483647
  properties:
    max.in.flight.requests.per.connection: 5  # pipelining + ordering safe
```

> 💡 **Expert Tip:** Ask: 'What is the smallest entity requiring strict event ordering?' That entity's ID becomes your partition key.

> ⚠️ **Pitfall:** `max.in.flight=5` + `retries>0` WITHOUT `enable.idempotence` is a data ordering bug waiting to happen. Always enable idempotence.

---

## 📈 Scaling Consumers

> Parallelism limits · Concurrency config · KEDA lag-based autoscaling

### Q17 — What limits consumer parallelism? How do you implement KEDA-based autoscaling?

![EXPERT](https://img.shields.io/badge/Level-EXPERT-red)

**Answer:**

**Maximum parallelism = number of partitions**

| Consumers vs Partitions | Result |
|---|---|
| Consumers < Partitions | Each handles multiple partitions. Works but more work per consumer. |
| Consumers = Partitions | ⭐ **Optimal** — maximum parallelism. |
| Consumers > Partitions | Extra consumers are **IDLE** — wasted resources. |
| To scale beyond limit | Increase partition count FIRST → then add consumers. |

```yaml
# application.yml — concurrency = threads per pod
spring.kafka.listener.concurrency: 6  # 6 threads per pod

# With 24 partitions:
# 4 pods × 6 threads = 24 consumers (optimal)
# 24 pods × 1 thread = 24 consumers (best K8s isolation)
```

```yaml
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
  pollingInterval: 15         # check lag every 15 seconds
  cooldownPeriod:  60         # wait 60s before scale-down
  minReplicaCount: 3          # always keep 3 pods running
  maxReplicaCount: 24         # MUST match partition count!
  triggers:
  - type: kafka
    metadata:
      bootstrapServers: kafka-brokers:9092
      consumerGroup:    order-processor
      topic:            orders
      lagThreshold:     "500"
      activationLagThreshold: "100"
```

```yaml
# K8s Deployment — 1 thread per pod, KEDA controls replica count
env:
- name: SPRING_KAFKA_LISTENER_CONCURRENCY
  value: "1"
- name: SPRING_KAFKA_CONSUMER_PROPERTIES_GROUP_INSTANCE_ID
  valueFrom:
    fieldRef:
      fieldPath: metadata.name  # static membership

# Graceful shutdown
# server.shutdown: graceful
# spring.lifecycle.timeout-per-shutdown-phase: 30s
```

> 💡 **Expert Tip:** In Kubernetes: set `concurrency=1` per pod and scale pods via KEDA. One stuck consumer never blocks others.

> ⚠️ **Pitfall:** `maxReplicaCount` MUST equal partition count. Extra consumers are idle and waste memory + CPU.

---

## 📊 Production Quick Reference Cheat Sheet

| Config / Concept | Production Value / Answer |
|---|---|
| `acks` + `min.insync.replicas` | `acks=all` + `min.insync.replicas=2` (tolerates 1 broker failure) |
| `enable.idempotence` | `true` — prevents producer-side duplicates within a session |
| `transaction-id-prefix` | Enables Kafka transactions + zombie fencing (unique per service) |
| `isolation.level` | `read_committed` — consumers only see committed transaction data |
| Rebalancing strategy | `CooperativeStickyAssignor` — replace default `RangeAssignor` |
| `group.instance.id` | Static membership — prevents rebalance on pod restart (`${POD_NAME}`) |
| `max.poll.interval.ms` | Must be > longest single-batch processing time |
| Non-blocking retry | `@RetryableTopic(attempts=4)` — Spring Kafka 2.7+ |
| Producer throughput | `linger.ms=10`, `batch.size=65536`, `compression=snappy` |
| Consumer lag warn | > 1,000 messages |
| Consumer lag critical | > 10,000 messages |
| ISR shrinkage | Alert when `isr < replication.factor` |
| Max consumers | Always equals partition count (`maxReplicaCount = partitions`) |
| Ordering key | Entity ID that needs ordering (orderId, customerId) |
| Kafka Streams | `KStream`=events (INSERT), `KTable`=latest state (UPSERT) |
| Schema compatibility | `FULL_TRANSITIVE` — all versions always interoperable |
| DB + Kafka atomicity | Transactional Outbox Pattern (no 2PC) |
| `unclean.leader.election` | Always `false` — never allow stale replica as leader |
| KEDA scaling trigger | `lagThreshold: 500` per partition |
| Exactly-once | `enable-idempotence=true` + `transactional.id` + `isolation-level=read_committed` |

---

*Apache Kafka 3.x · Spring Boot 3.x · KRaft mode · Spring Kafka 3.x*