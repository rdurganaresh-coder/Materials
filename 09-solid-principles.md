# 09 — SOLID Principles

> Five design principles that make OOP code maintainable, extensible, and testable.

---

## 📖 What is SOLID?

SOLID is an acronym for five principles introduced by Robert C. Martin (Uncle Bob):

```
S — Single Responsibility Principle
O — Open/Closed Principle
L — Liskov Substitution Principle
I — Interface Segregation Principle
D — Dependency Inversion Principle
```

---

## S — Single Responsibility Principle

> **A class should have only one reason to change.**

Each class should do **one thing** and do it well.

### ❌ Violation
```java
// This class does TOO much — 3 responsibilities
public class Employee {
    private String name;
    private double salary;

    // Responsibility 1: Business logic
    public double calculateBonus() { return salary * 0.1; }

    // Responsibility 2: Persistence
    public void saveToDatabase() {
        System.out.println("INSERT INTO employees VALUES ('" + name + "', " + salary + ")");
    }

    // Responsibility 3: Reporting
    public String generatePayslip() {
        return "=== PAYSLIP ===\nName: " + name + "\nSalary: " + salary;
    }
}
// If DB schema changes, this class changes.
// If payslip format changes, this class changes.
// If bonus logic changes, this class changes.
```

### ✅ Correct
```java
// Responsibility 1: Data + Business Logic ONLY
public class Employee {
    private final String empId;
    private String name;
    private double salary;

    public Employee(String empId, String name, double salary) {
        this.empId  = empId;
        this.name   = name;
        this.salary = salary;
    }

    public double calculateBonus() { return salary * 0.1; }

    // Getters only
    public String getEmpId()  { return empId; }
    public String getName()   { return name; }
    public double getSalary() { return salary; }
}

// Responsibility 2: Persistence
public class EmployeeRepository {
    public void save(Employee e) {
        System.out.println("INSERT INTO employees VALUES ('" + e.getEmpId() + "')");
    }
    public Employee findById(String id) { /* DB query */ return null; }
}

// Responsibility 3: Reporting
public class PayslipGenerator {
    public String generate(Employee e) {
        return String.format("=== PAYSLIP ===%nEmployee: %s%nSalary: ₹%.2f%nBonus: ₹%.2f",
                e.getName(), e.getSalary(), e.calculateBonus());
    }
}
```

---

## O — Open/Closed Principle

> **Software entities should be open for extension but closed for modification.**

Add new behavior by **adding new code**, not changing existing code.

### ❌ Violation
```java
public class AreaCalculator {
    // Every new shape requires modifying this class!
    public double calculateArea(Object shape) {
        if (shape instanceof Circle c)    return Math.PI * c.radius * c.radius;
        if (shape instanceof Rectangle r) return r.width * r.height;
        if (shape instanceof Triangle t)  return 0.5 * t.base * t.height;
        // Add trapezoid? Modify this method. Breaks OCP!
        throw new IllegalArgumentException("Unknown shape");
    }
}
```

### ✅ Correct
```java
// Closed for modification — this interface never changes
public interface AreaComputable {
    double area();
}

// Open for extension — add new shapes without touching existing code
public class Circle implements AreaComputable {
    private double radius;
    public Circle(double r) { this.radius = r; }
    @Override public double area() { return Math.PI * radius * radius; }
}

public class Rectangle implements AreaComputable {
    private double width, height;
    public Rectangle(double w, double h) { this.width = w; this.height = h; }
    @Override public double area() { return width * height; }
}

// NEW SHAPE: no existing code touched
public class Hexagon implements AreaComputable {
    private double side;
    public Hexagon(double s) { this.side = s; }
    @Override public double area() { return (3 * Math.sqrt(3) / 2) * side * side; }
}

// Calculator never needs to change
public class AreaCalculator {
    public double total(java.util.List<AreaComputable> shapes) {
        return shapes.stream().mapToDouble(AreaComputable::area).sum();
    }
}
```

---

## L — Liskov Substitution Principle

> **Subtypes must be substitutable for their base types without breaking correctness.**

If `S extends T`, then anywhere you use a `T`, you should be able to use an `S` without breaking the program.

### ❌ Violation — the classic Square/Rectangle problem
```java
public class Rectangle {
    protected int width;
    protected int height;

    public void setWidth(int w)  { this.width = w; }
    public void setHeight(int h) { this.height = h; }
    public int  area()           { return width * height; }
}

public class Square extends Rectangle {
    @Override
    public void setWidth(int w)  { this.width = this.height = w; }  // forces equal sides
    @Override
    public void setHeight(int h) { this.width = this.height = h; }  // forces equal sides
}

// Breaks LSP!
void testRectangle(Rectangle r) {
    r.setWidth(5);
    r.setHeight(4);
    // Expectation: area = 20
    assert r.area() == 20; // FAILS for Square (area = 16, since height overrode width)
}
```

### ✅ Correct — use abstraction instead
```java
public interface Shape {
    double area();
}

public class Rectangle implements Shape {
    private double width, height;
    public Rectangle(double w, double h) { this.width = w; this.height = h; }
    @Override public double area() { return width * height; }
}

public class Square implements Shape {
    private double side;
    public Square(double s) { this.side = s; }
    @Override public double area() { return side * side; }
}
// Now both are substitutable for Shape with no surprises
```

### Another LSP Example — Preconditions & Postconditions
```java
// ✅ Good LSP compliance
public class Bird {
    public void move(int meters) {
        System.out.println("Moving " + meters + "m");
    }
}

public class FlyingBird extends Bird {
    public void fly(int altitude) {
        System.out.println("Flying at " + altitude + "m");
    }
    // move() still works — doesn't violate expectations
}

// ❌ Bad — Ostrich CAN'T fly but forced into flying hierarchy
// public class Ostrich extends FlyingBird {
//     @Override public void fly(int a) { throw new UnsupportedOperationException(); }
// }
// Breaks LSP — ostrich breaks the "birds can fly" contract

// ✅ Better — separate capability
public class Ostrich extends Bird { }  // inherits only move()
public interface Flyable { void fly(int altitude); }
public class Eagle extends Bird implements Flyable {
    @Override public void fly(int a) { System.out.println("Soaring at " + a + "m"); }
}
```

---

## I — Interface Segregation Principle

> **Clients should not be forced to depend on interfaces they don't use.**

Prefer many small, specific interfaces over one large general-purpose one.

### ❌ Violation
```java
// Fat interface — forces classes to implement methods they don't need
public interface Worker {
    void work();
    void eat();
    void sleep();
    void attendMeeting();
    void writeReport();
}

// Robot doesn't eat or sleep — forced to implement anyway!
public class Robot implements Worker {
    @Override public void work()          { System.out.println("Working"); }
    @Override public void eat()           { throw new UnsupportedOperationException(); }
    @Override public void sleep()         { throw new UnsupportedOperationException(); }
    @Override public void attendMeeting() { System.out.println("Attending meeting"); }
    @Override public void writeReport()   { System.out.println("Writing report"); }
}
```

### ✅ Correct
```java
// Small, cohesive interfaces
public interface Workable   { void work(); }
public interface Eatable    { void eat(); }
public interface Sleepable  { void sleep(); }
public interface Reportable { void writeReport(); }
public interface Meetable   { void attendMeeting(); }

// Human implements all
public class HumanWorker implements Workable, Eatable, Sleepable, Reportable, Meetable {
    @Override public void work()          { System.out.println("Human working"); }
    @Override public void eat()           { System.out.println("Eating lunch"); }
    @Override public void sleep()         { System.out.println("Sleeping"); }
    @Override public void writeReport()   { System.out.println("Writing report"); }
    @Override public void attendMeeting() { System.out.println("In meeting"); }
}

// Robot only implements what it needs
public class RobotWorker implements Workable, Reportable, Meetable {
    @Override public void work()          { System.out.println("Robot working"); }
    @Override public void writeReport()   { System.out.println("Robot generating report"); }
    @Override public void attendMeeting() { System.out.println("Robot attending meeting"); }
    // No forced eat() or sleep() — clean!
}
```

---

## D — Dependency Inversion Principle

> **High-level modules should not depend on low-level modules. Both should depend on abstractions.**

### ❌ Violation
```java
// High-level module directly depends on low-level MySQL class
public class OrderService {
    private MySQLOrderRepository repo = new MySQLOrderRepository(); // hard dependency!

    public void placeOrder(Order order) {
        // process order...
        repo.save(order);  // tightly coupled to MySQL
    }
}
// Switching to MongoDB requires changing OrderService
```

### ✅ Correct — Depend on Abstractions
```java
// Abstraction (interface)
public interface OrderRepository {
    void save(Order order);
    Order findById(String id);
    java.util.List<Order> findAll();
}

// Low-level: MySQL implementation
public class MySQLOrderRepository implements OrderRepository {
    @Override public void save(Order o)        { System.out.println("MySQL: saving " + o.getId()); }
    @Override public Order findById(String id) { return null; /* DB query */ }
    @Override public java.util.List<Order> findAll() { return java.util.List.of(); }
}

// Low-level: MongoDB implementation
public class MongoOrderRepository implements OrderRepository {
    @Override public void save(Order o)        { System.out.println("MongoDB: saving " + o.getId()); }
    @Override public Order findById(String id) { return null; }
    @Override public java.util.List<Order> findAll() { return java.util.List.of(); }
}

// In-memory (for testing!)
public class InMemoryOrderRepository implements OrderRepository {
    private java.util.Map<String, Order> store = new java.util.HashMap<>();
    @Override public void save(Order o)        { store.put(o.getId(), o); }
    @Override public Order findById(String id) { return store.get(id); }
    @Override public java.util.List<Order> findAll() { return new java.util.ArrayList<>(store.values()); }
}

// High-level module depends on ABSTRACTION, not concrete class
public class OrderService {
    private final OrderRepository repo;  // depends on interface

    // Dependency Injection via constructor
    public OrderService(OrderRepository repo) {
        this.repo = repo;
    }

    public void placeOrder(Order order) {
        // process order...
        repo.save(order);
    }
}

// Wiring (Composition Root / DI Container)
OrderService mysqlService  = new OrderService(new MySQLOrderRepository());
OrderService mongoService  = new OrderService(new MongoOrderRepository());
OrderService testService   = new OrderService(new InMemoryOrderRepository());
// Swap implementations without touching OrderService!
```

---

## 🧪 All 5 Principles Together — Invoice System

```java
// S: Each class has ONE job
// O: Add new formatters/senders without changing existing
// L: Any InvoiceSender can substitute for another
// I: Small interfaces (Formattable, Sendable, Persistable)
// D: InvoiceService depends on interfaces, not concrete classes

public record Invoice(String id, String client, double amount) {}

// ISP: small interfaces
public interface InvoiceFormatter { String format(Invoice i); }
public interface InvoiceSender    { void send(Invoice i, String format); }
public interface InvoiceStore     { void persist(Invoice i); }

// OCP + SRP: each formatter is its own class
public class PDFFormatter implements InvoiceFormatter {
    @Override public String format(Invoice i) {
        return "[PDF] Invoice #" + i.id() + " | " + i.client() + " | ₹" + i.amount();
    }
}

public class HTMLFormatter implements InvoiceFormatter {
    @Override public String format(Invoice i) {
        return "<html><b>Invoice #" + i.id() + "</b>: ₹" + i.amount() + "</html>";
    }
}

public class EmailSender implements InvoiceSender {
    @Override public void send(Invoice i, String formatted) {
        System.out.println("[EMAIL] Sending invoice to " + i.client() + ": " + formatted);
    }
}

public class DatabaseStore implements InvoiceStore {
    @Override public void persist(Invoice i) {
        System.out.println("[DB] Saved invoice #" + i.id());
    }
}

// DIP: service depends on abstractions only
public class InvoiceService {
    private final InvoiceFormatter formatter;
    private final InvoiceSender    sender;
    private final InvoiceStore     store;

    public InvoiceService(InvoiceFormatter f, InvoiceSender s, InvoiceStore st) {
        this.formatter = f;
        this.sender    = s;
        this.store     = st;
    }

    public void processInvoice(Invoice invoice) {
        String formatted = formatter.format(invoice);
        sender.send(invoice, formatted);
        store.persist(invoice);
    }
}

// Composition root
Invoice invoice = new Invoice("INV-001", "Alice Corp", 15000.0);
InvoiceService service = new InvoiceService(
        new PDFFormatter(),
        new EmailSender(),
        new DatabaseStore()
);
service.processInvoice(invoice);
```

---

## 📝 Key Takeaways

| Principle | One-liner | Violation Smell |
|-----------|-----------|-----------------|
| **SRP** | One class, one job | Class changes for multiple unrelated reasons |
| **OCP** | Extend, don't modify | Adding feature requires editing existing class |
| **LSP** | Subtypes must honor contracts | Subclass throws `UnsupportedOperationException` |
| **ISP** | Many small interfaces > one fat | Class implements methods it throws or ignores |
| **DIP** | Depend on abstractions | `new ConcreteClass()` inside high-level module |

---

*← [08 — Design Patterns](08-design-patterns.md) | [10 — Capstone Project →](10-capstone-project.md)*
