# 05 — Abstraction

> Hiding implementation complexity and exposing only the essential interface.

---

## 📖 What is Abstraction?

Abstraction means showing **what** something does, hiding **how** it does it.

```
WITHOUT Abstraction                WITH Abstraction
┌──────────────────────────┐      ┌──────────────────────────┐
│  Car internals exposed:  │      │  Car interface:           │
│  - combustionCycle()     │      │  + startEngine()          │
│  - injectFuel()          │      │  + accelerate(int speed)  │
│  - fireSparkPlug()       │      │  + brake()                │
│  - rotateShafts()        │      │                           │
│  (user must know all!)   │      │  (internals hidden)       │
└──────────────────────────┘      └──────────────────────────┘
```

Java achieves abstraction via:
1. **Abstract Classes** — partial abstraction
2. **Interfaces** — full abstraction (covered in depth in `06-interfaces.md`)

---

## 🔶 Abstract Classes

An **abstract class** cannot be instantiated. It defines a template with:
- **Concrete methods** — shared implementation all subclasses inherit
- **Abstract methods** — declared but not implemented; subclasses *must* provide them

```java
// abstract keyword on class
public abstract class Shape {

    private String color;

    // ── Concrete: shared logic ───────────────────────────
    public Shape(String color) {
        this.color = color;
    }

    public String getColor() { return color; }

    public void printInfo() {
        System.out.printf("%s [color=%s, area=%.2f, perimeter=%.2f]%n",
                getClass().getSimpleName(), color, area(), perimeter());
    }

    // ── Abstract: no body — subclass MUST implement ──────
    public abstract double area();
    public abstract double perimeter();
}

// Concrete subclass — must implement both abstract methods
public class Circle extends Shape {
    private double radius;

    public Circle(String color, double radius) {
        super(color);
        this.radius = radius;
    }

    @Override public double area()      { return Math.PI * radius * radius; }
    @Override public double perimeter() { return 2 * Math.PI * radius; }
}

public class Rectangle extends Shape {
    private double width, height;

    public Rectangle(String color, double w, double h) {
        super(color);
        this.width = w; this.height = h;
    }

    @Override public double area()      { return width * height; }
    @Override public double perimeter() { return 2 * (width + height); }
}

// Usage
Shape c = new Circle("Red", 5);
Shape r = new Rectangle("Blue", 4, 6);
// Shape s = new Shape("Green");  ❌ cannot instantiate abstract class

c.printInfo(); // Circle [color=Red, area=78.54, perimeter=31.42]
r.printInfo(); // Rectangle [color=Blue, area=24.00, perimeter=20.00]
```

---

## 🏗️ Abstract Class Rules

| Rule | Detail |
|------|--------|
| `abstract` keyword | Required on both class and method declaration |
| Instantiation | ❌ Cannot do `new AbstractClass()` |
| Concrete subclass | Must implement ALL abstract methods |
| Abstract subclass | Can leave some abstract methods unimplemented |
| Constructors | Abstract classes CAN have constructors (called via `super()`) |
| Fields | Abstract classes CAN have instance fields |
| Static members | Allowed in abstract classes |

```java
// Partial implementation chain
public abstract class Animal {
    public abstract void makeSound();
    public abstract void move();

    public void breathe() { System.out.println("Inhale/exhale"); }
}

// Still abstract — doesn't implement move()
public abstract class WaterAnimal extends Animal {
    @Override
    public void move() { System.out.println("Swimming"); }
    // makeSound() still abstract — left to concrete subclasses
}

// Concrete — must implement makeSound()
public class Dolphin extends WaterAnimal {
    @Override
    public void makeSound() { System.out.println("Click-click-whistle"); }
}
```

---

## 🎨 Template Method Pattern

One of the most powerful uses of abstract classes — define the **skeleton** of an algorithm in the base class, let subclasses fill in specific steps.

```java
public abstract class DataProcessor {

    // ── Template method — final to prevent changing the algorithm ──
    public final void process() {
        readData();
        processData();
        writeResults();
        cleanup();         // optional hook with default
    }

    // ── Abstract steps — subclass provides specifics ────────────
    protected abstract void readData();
    protected abstract void processData();
    protected abstract void writeResults();

    // ── Hook — optional override with default behavior ──────────
    protected void cleanup() {
        System.out.println("Default cleanup done.");
    }
}

public class CSVProcessor extends DataProcessor {
    @Override protected void readData()     { System.out.println("Reading CSV file..."); }
    @Override protected void processData()  { System.out.println("Parsing CSV rows..."); }
    @Override protected void writeResults() { System.out.println("Writing to database..."); }
}

public class JSONProcessor extends DataProcessor {
    @Override protected void readData()     { System.out.println("Reading JSON file..."); }
    @Override protected void processData()  { System.out.println("Deserializing JSON..."); }
    @Override protected void writeResults() { System.out.println("Writing to REST API..."); }

    @Override  // override the hook
    protected void cleanup() {
        System.out.println("Closing HTTP connection.");
    }
}

// Usage
DataProcessor csv  = new CSVProcessor();
DataProcessor json = new JSONProcessor();
csv.process();   // follows same steps, different impl
json.process();
```

---

## 🔬 Abstract Class vs Interface

| Feature | Abstract Class | Interface |
|---------|---------------|-----------|
| Keyword | `abstract class` | `interface` |
| Instantiation | ❌ | ❌ |
| Fields | Instance fields allowed | `public static final` only |
| Constructors | ✅ Yes | ❌ No |
| Method types | Abstract + concrete | Abstract + default + static |
| Inheritance | Single (`extends`) | Multiple (`implements`) |
| Access modifiers | Any | `public` by default |
| State | Can hold state | Stateless |
| Use when | Shared implementation + IS-A | Contract / capability |

```java
// Abstract class — for IS-A with shared state/behavior
abstract class Vehicle {
    protected int speed;              // shared state
    public void refuel() { speed = 0; }  // shared behavior

    abstract void drive();
}

// Interface — for CAN-DO capability contracts
interface GPS        { String getLocation(); }
interface Bluetooth  { void connect(String device); }
interface Chargeable { void charge(int percent); }

// A class can extend ONE abstract class, implement MANY interfaces
class ElectricCar extends Vehicle
        implements GPS, Bluetooth, Chargeable {

    @Override public void drive()                   { speed += 10; }
    @Override public String getLocation()           { return "12.9716,77.5946"; }
    @Override public void connect(String device)    { System.out.println("Connected: " + device); }
    @Override public void charge(int percent)       { System.out.println("Charging: " + percent + "%"); }
}
```

---

## 🏦 Real-World Example — Banking

```java
// Abstract base — defines structure
public abstract class BankAccount {
    private final String accountNumber;
    private final String owner;
    protected double balance;

    public BankAccount(String accountNumber, String owner, double initialBalance) {
        this.accountNumber = accountNumber;
        this.owner         = owner;
        this.balance       = initialBalance;
    }

    // Concrete shared methods
    public void deposit(double amount) {
        validateAmount(amount);
        balance += amount;
        System.out.printf("Deposited ₹%.2f | Balance: ₹%.2f%n", amount, balance);
    }

    public double getBalance()       { return balance; }
    public String getAccountNumber() { return accountNumber; }
    public String getOwner()         { return owner; }

    // Template method
    public final void withdraw(double amount) {
        validateAmount(amount);
        if (!canWithdraw(amount))
            throw new IllegalStateException("Withdrawal not allowed: " + getRejectReason(amount));
        balance -= amount;
        onWithdrawal(amount);
    }

    // Abstract steps
    protected abstract boolean canWithdraw(double amount);
    protected abstract String  getRejectReason(double amount);
    protected abstract void    onWithdrawal(double amount);
    public    abstract String  getAccountType();

    private void validateAmount(double amount) {
        if (amount <= 0) throw new IllegalArgumentException("Amount must be positive");
    }

    @Override
    public String toString() {
        return String.format("%s[%s, owner=%s, balance=₹%.2f]",
                getAccountType(), accountNumber, owner, balance);
    }
}

// Savings account — minimum balance constraint
public class SavingsAccount extends BankAccount {
    private static final double MIN_BALANCE = 500.0;

    public SavingsAccount(String accNum, String owner, double balance) {
        super(accNum, owner, balance);
    }

    @Override
    protected boolean canWithdraw(double amount) {
        return (balance - amount) >= MIN_BALANCE;
    }

    @Override
    protected String getRejectReason(double amount) {
        return String.format("Would breach minimum balance of ₹%.2f", MIN_BALANCE);
    }

    @Override
    protected void onWithdrawal(double amount) {
        System.out.printf("Savings withdrawal: ₹%.2f | Remaining: ₹%.2f%n", amount, balance);
    }

    @Override public String getAccountType() { return "SAVINGS"; }
}

// Current account — allows overdraft up to a limit
public class CurrentAccount extends BankAccount {
    private final double overdraftLimit;

    public CurrentAccount(String accNum, String owner, double balance, double overdraftLimit) {
        super(accNum, owner, balance);
        this.overdraftLimit = overdraftLimit;
    }

    @Override
    protected boolean canWithdraw(double amount) {
        return (balance - amount) >= -overdraftLimit;
    }

    @Override
    protected String getRejectReason(double amount) {
        return String.format("Exceeds overdraft limit of ₹%.2f", overdraftLimit);
    }

    @Override
    protected void onWithdrawal(double amount) {
        if (balance < 0)
            System.out.printf("⚠ Overdraft used! Balance: ₹%.2f%n", balance);
        else
            System.out.printf("Current withdrawal: ₹%.2f | Balance: ₹%.2f%n", amount, balance);
    }

    @Override public String getAccountType() { return "CURRENT"; }
}
```

---

## 📝 Key Takeaways

- `abstract class` = partial abstraction with shared implementation + forced contract
- `abstract method` has no body — subclasses **must** implement it
- Abstract classes can have fields, constructors, and concrete methods
- You **cannot** instantiate an abstract class directly
- The **Template Method Pattern** uses abstract classes to define algorithm skeletons
- Use abstract classes for IS-A relationships with shared state/behavior
- Use interfaces when you need a contract without shared implementation

---

*← [04 — Polymorphism](04-polymorphism.md) | [06 — Interfaces →](06-interfaces.md)*
