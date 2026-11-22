# 08 — Design Patterns

> Proven, reusable solutions to commonly occurring OOP design problems.

---

## 📖 What are Design Patterns?

Design patterns are **named, repeatable solutions** to recurring design problems. They are not code you copy — they are templates you adapt.

```
3 Categories:
┌──────────────────┬────────────────────┬────────────────────┐
│   CREATIONAL     │   STRUCTURAL       │   BEHAVIORAL       │
│                  │                    │                    │
│ How objects      │ How objects are    │ How objects        │
│ are created      │ composed           │ communicate        │
│                  │                    │                    │
│ • Singleton      │ • Adapter          │ • Observer         │
│ • Factory        │ • Decorator        │ • Strategy         │
│ • Builder        │ • Facade           │ • Command          │
│ • Prototype      │ • Composite        │ • Iterator         │
└──────────────────┴────────────────────┴────────────────────┘
```

---

## 🔵 CREATIONAL PATTERNS

### 1. Singleton — One Instance Only

```java
// Thread-safe Singleton (Bill Pugh / Initialization-on-demand holder)
public final class ConfigManager {
    private final java.util.Properties props;

    // Private constructor — no one can call new ConfigManager()
    private ConfigManager() {
        props = new java.util.Properties();
        props.setProperty("db.host", "localhost");
        props.setProperty("db.port", "5432");
        System.out.println("ConfigManager initialized");
    }

    // Holder class loaded only when getInstance() is called
    private static class Holder {
        static final ConfigManager INSTANCE = new ConfigManager();
    }

    public static ConfigManager getInstance() {
        return Holder.INSTANCE;
    }

    public String get(String key)               { return props.getProperty(key); }
    public void set(String key, String value)   { props.setProperty(key, value); }
}

// Usage
ConfigManager cfg = ConfigManager.getInstance();
cfg.set("app.name", "OOP Demo");
System.out.println(cfg.get("db.host"));  // localhost

// All references point to same object
assert ConfigManager.getInstance() == ConfigManager.getInstance(); // true
```

---

### 2. Factory Method — Delegate Object Creation

```java
// Product interface
public interface Notification {
    void send(String recipient, String message);
    String getType();
}

// Concrete products
public class EmailNotification implements Notification {
    @Override public void send(String to, String msg) {
        System.out.printf("[EMAIL] To: %s | %s%n", to, msg);
    }
    @Override public String getType() { return "EMAIL"; }
}

public class SMSNotification implements Notification {
    @Override public void send(String to, String msg) {
        System.out.printf("[SMS] To: %s | %s%n", to, msg);
    }
    @Override public String getType() { return "SMS"; }
}

public class PushNotification implements Notification {
    @Override public void send(String to, String msg) {
        System.out.printf("[PUSH] Device: %s | %s%n", to, msg);
    }
    @Override public String getType() { return "PUSH"; }
}

// Factory
public class NotificationFactory {
    public static Notification create(String type) {
        return switch (type.toUpperCase()) {
            case "EMAIL" -> new EmailNotification();
            case "SMS"   -> new SMSNotification();
            case "PUSH"  -> new PushNotification();
            default -> throw new IllegalArgumentException("Unknown type: " + type);
        };
    }
}

// Client — doesn't know concrete classes
Notification n = NotificationFactory.create("EMAIL");
n.send("alice@example.com", "Your order shipped!");
```

---

### 3. Builder — Step-by-Step Object Construction

```java
public class HttpRequest {
    // All fields final — immutable after build
    private final String  method;
    private final String  url;
    private final java.util.Map<String, String> headers;
    private final String  body;
    private final int     timeoutMs;

    // Private — use Builder
    private HttpRequest(Builder b) {
        this.method    = b.method;
        this.url       = b.url;
        this.headers   = java.util.Collections.unmodifiableMap(b.headers);
        this.body      = b.body;
        this.timeoutMs = b.timeoutMs;
    }

    @Override
    public String toString() {
        return String.format("HttpRequest{%s %s, headers=%s, timeout=%dms}",
                method, url, headers, timeoutMs);
    }

    // ── Static inner Builder ──────────────────────────────
    public static class Builder {
        // Required
        private final String method;
        private final String url;
        // Optional with defaults
        private java.util.Map<String, String> headers = new java.util.HashMap<>();
        private String body      = null;
        private int    timeoutMs = 5000;

        public Builder(String method, String url) {
            this.method = method;
            this.url    = url;
        }

        public Builder header(String name, String value) {
            headers.put(name, value);
            return this;
        }

        public Builder body(String body) {
            this.body = body;
            return this;
        }

        public Builder timeout(int ms) {
            this.timeoutMs = ms;
            return this;
        }

        public HttpRequest build() {
            // Validation before building
            if (url == null || url.isBlank())
                throw new IllegalStateException("URL is required");
            return new HttpRequest(this);
        }
    }
}

// Fluent usage
HttpRequest req = new HttpRequest.Builder("POST", "https://api.example.com/users")
        .header("Content-Type", "application/json")
        .header("Authorization", "Bearer token123")
        .body("{\"name\":\"Alice\"}")
        .timeout(3000)
        .build();

System.out.println(req);
```

---

### 4. Prototype — Clone Existing Objects

```java
public abstract class Shape implements Cloneable {
    protected String color;
    protected int x, y;

    public abstract double area();

    @Override
    public Shape clone() {
        try {
            return (Shape) super.clone();
        } catch (CloneNotSupportedException e) {
            throw new RuntimeException(e);
        }
    }
}

public class Circle extends Shape {
    private double radius;

    public Circle(double radius, String color) {
        this.radius = radius;
        this.color  = color;
    }

    @Override public double area() { return Math.PI * radius * radius; }
}

// Clone instead of new
Circle original = new Circle(5, "Red");
Circle copy     = (Circle) original.clone();
// copy is a separate object with same values
```

---

## 🟢 STRUCTURAL PATTERNS

### 5. Decorator — Add Behavior Dynamically

```java
// Component interface
public interface Coffee {
    String getDescription();
    double getCost();
}

// Concrete component
public class SimpleCoffee implements Coffee {
    @Override public String getDescription() { return "Coffee"; }
    @Override public double getCost()         { return 30.0; }
}

// Abstract decorator
public abstract class CoffeeDecorator implements Coffee {
    protected Coffee coffee;
    public CoffeeDecorator(Coffee coffee) { this.coffee = coffee; }
}

// Concrete decorators
public class MilkDecorator extends CoffeeDecorator {
    public MilkDecorator(Coffee c) { super(c); }
    @Override public String getDescription() { return coffee.getDescription() + ", Milk"; }
    @Override public double getCost()         { return coffee.getCost() + 10; }
}

public class SugarDecorator extends CoffeeDecorator {
    public SugarDecorator(Coffee c) { super(c); }
    @Override public String getDescription() { return coffee.getDescription() + ", Sugar"; }
    @Override public double getCost()         { return coffee.getCost() + 5; }
}

public class WhipDecorator extends CoffeeDecorator {
    public WhipDecorator(Coffee c) { super(c); }
    @Override public String getDescription() { return coffee.getDescription() + ", Whip"; }
    @Override public double getCost()         { return coffee.getCost() + 15; }
}

// Usage — wrap at runtime
Coffee order = new WhipDecorator(new SugarDecorator(new MilkDecorator(new SimpleCoffee())));
System.out.println(order.getDescription()); // Coffee, Milk, Sugar, Whip
System.out.println("₹" + order.getCost()); // ₹60.0
```

---

### 6. Facade — Simplified Subsystem Interface

```java
// Complex subsystems
class VideoDecoder    { void decode(String file)  { System.out.println("Decoding " + file); } }
class AudioMixer      { void mix()                { System.out.println("Mixing audio"); } }
class BitrateReader   { int readBitrate(String f) { return 1080; } }
class CodecFactory    { String getCodec(String f) { return f.endsWith(".mp4") ? "H264" : "MKV"; } }

// Facade — one simple method hides all complexity
public class VideoPlayerFacade {
    private VideoDecoder   decoder = new VideoDecoder();
    private AudioMixer     mixer   = new AudioMixer();
    private BitrateReader  bitrate = new BitrateReader();
    private CodecFactory   codec   = new CodecFactory();

    public void play(String filename) {
        System.out.println("=== Playing: " + filename + " ===");
        String codecType = codec.getCodec(filename);
        int    rate      = bitrate.readBitrate(filename);
        decoder.decode(filename);
        mixer.mix();
        System.out.printf("Playing with %s codec at %dp%n", codecType, rate);
    }
}

// Client — just one call
VideoPlayerFacade player = new VideoPlayerFacade();
player.play("movie.mp4");
```

---

## 🔴 BEHAVIORAL PATTERNS

### 7. Observer — Event Notification System

```java
import java.util.ArrayList;
import java.util.List;

// Observer interface
public interface StockObserver {
    void update(String symbol, double price, double change);
}

// Subject (Observable)
public class StockMarket {
    private final List<StockObserver> observers = new ArrayList<>();
    private final java.util.Map<String, Double> prices = new java.util.HashMap<>();

    public void addObserver(StockObserver o)    { observers.add(o); }
    public void removeObserver(StockObserver o) { observers.remove(o); }

    public void updatePrice(String symbol, double newPrice) {
        double oldPrice = prices.getOrDefault(symbol, newPrice);
        double change   = newPrice - oldPrice;
        prices.put(symbol, newPrice);
        notifyAll(symbol, newPrice, change);
    }

    private void notifyAll(String symbol, double price, double change) {
        for (StockObserver o : observers) o.update(symbol, price, change);
    }
}

// Concrete observers
public class MobileApp implements StockObserver {
    private String userId;
    public MobileApp(String userId) { this.userId = userId; }

    @Override public void update(String symbol, double price, double change) {
        String arrow = change >= 0 ? "▲" : "▼";
        System.out.printf("[Mobile:%s] %s ₹%.2f %s %.2f%n",
                userId, symbol, price, arrow, Math.abs(change));
    }
}

public class AlertSystem implements StockObserver {
    private double threshold;
    public AlertSystem(double threshold) { this.threshold = threshold; }

    @Override public void update(String symbol, double price, double change) {
        if (Math.abs(change) > threshold)
            System.out.printf("[ALERT] %s moved ₹%.2f! Threshold breach!%n", symbol, change);
    }
}

// Usage
StockMarket market = new StockMarket();
market.addObserver(new MobileApp("user_001"));
market.addObserver(new MobileApp("user_002"));
market.addObserver(new AlertSystem(50.0));

market.updatePrice("RELIANCE", 2500.00);
market.updatePrice("RELIANCE", 2560.50);
market.updatePrice("TCS", 3800.00);
```

---

### 8. Strategy — Swappable Algorithms

```java
// Context: ShoppingCart with pluggable discount strategy
@FunctionalInterface
public interface DiscountStrategy {
    double apply(double originalPrice);
}

public class ShoppingCart {
    private final List<Double> items = new ArrayList<>();
    private DiscountStrategy discountStrategy;

    public ShoppingCart(DiscountStrategy strategy) {
        this.discountStrategy = strategy;
    }

    public void addItem(double price) { items.add(price); }

    public void setStrategy(DiscountStrategy strategy) {
        this.discountStrategy = strategy;
    }

    public double checkout() {
        double subtotal = items.stream().mapToDouble(Double::doubleValue).sum();
        double final_   = discountStrategy.apply(subtotal);
        System.out.printf("Subtotal: ₹%.2f → Final: ₹%.2f%n", subtotal, final_);
        return final_;
    }
}

// Strategies as lambdas (since @FunctionalInterface)
DiscountStrategy noDiscount    = price -> price;
DiscountStrategy tenPercent    = price -> price * 0.90;
DiscountStrategy flatFifty     = price -> Math.max(0, price - 50);
DiscountStrategy bulkDiscount  = price -> price > 500 ? price * 0.80 : price;

ShoppingCart cart = new ShoppingCart(noDiscount);
cart.addItem(200); cart.addItem(300); cart.addItem(150);

cart.setStrategy(tenPercent);  cart.checkout();  // ₹650 → ₹585
cart.setStrategy(bulkDiscount); cart.checkout(); // ₹650 → ₹520
```

---

### 9. Command — Encapsulate Actions as Objects

```java
// Command interface
public interface Command {
    void execute();
    void undo();
}

// Receiver
public class TextEditor {
    private StringBuilder text = new StringBuilder();

    public void insertText(String t, int pos)  { text.insert(pos, t); }
    public void deleteText(int start, int end) { text.delete(start, end); }
    public String getText()                     { return text.toString(); }
}

// Concrete commands
public class InsertCommand implements Command {
    private TextEditor editor;
    private String text;
    private int position;

    public InsertCommand(TextEditor e, String text, int pos) {
        this.editor = e; this.text = text; this.position = pos;
    }

    @Override public void execute() { editor.insertText(text, position); }
    @Override public void undo()    { editor.deleteText(position, position + text.length()); }
}

// Invoker with undo history
public class CommandHistory {
    private final java.util.Deque<Command> history = new java.util.ArrayDeque<>();

    public void execute(Command cmd) {
        cmd.execute();
        history.push(cmd);
    }

    public void undo() {
        if (!history.isEmpty()) history.pop().undo();
    }
}

// Usage
TextEditor     editor  = new TextEditor();
CommandHistory history = new CommandHistory();

history.execute(new InsertCommand(editor, "Hello", 0));
history.execute(new InsertCommand(editor, " World", 5));
System.out.println(editor.getText()); // Hello World
history.undo();
System.out.println(editor.getText()); // Hello
```

---

## 📝 Key Takeaways

| Pattern | Problem Solved | Key Classes |
|---------|---------------|-------------|
| Singleton | Ensure one instance | `private constructor` + `static getInstance()` |
| Factory | Decouple creation | Interface + `create(type)` method |
| Builder | Complex construction | Inner `Builder` class + fluent methods |
| Decorator | Add behavior without subclassing | Wraps component, same interface |
| Facade | Simplify complex subsystem | Single unified API class |
| Observer | Event-driven notifications | Subject + Observer interface |
| Strategy | Swappable algorithms | Interface + context field |
| Command | Undo/redo, queuing | `execute()` + `undo()` interface |

---

*← [07 — Advanced OOP](07-advanced-oop.md) | [09 — SOLID Principles →](09-solid-principles.md)*
