# 01 — Classes & Objects

> The foundation of OOP: everything in Java is a class or lives inside one.

---

## 📖 What is a Class?

A **class** is a blueprint or template that defines:
- **State** → instance variables (fields)
- **Behavior** → methods
- **Identity** → the class name itself

A **object** is a concrete instance created from a class using `new`.

```
Class (Blueprint)          Object (Instance)
┌─────────────────┐       ┌─────────────────┐
│  Car             │  new  │  myCar           │
│  - brand: String │──────▶│  - brand: "BMW"  │
│  - speed: int    │       │  - speed: 120    │
│  + drive()       │       │  [drive() lives  │
│  + brake()       │       │   in heap]       │
└─────────────────┘       └─────────────────┘
```

---

## 🔑 Anatomy of a Class

```java
// File: Car.java
public class Car {

    // ── 1. FIELDS (instance variables) ──────────────────
    private String brand;       // per-object state
    private int    speed;
    private static int totalCars = 0;  // shared across ALL instances

    // ── 2. CONSTRUCTORS ─────────────────────────────────
    /** Default constructor */
    public Car() {
        this.brand = "Unknown";
        this.speed = 0;
        totalCars++;
    }

    /** Parameterized constructor */
    public Car(String brand, int speed) {
        this.brand = brand;   // 'this' disambiguates field vs param
        this.speed = speed;
        totalCars++;
    }

    /** Copy constructor */
    public Car(Car other) {
        this.brand = other.brand;
        this.speed = other.speed;
        totalCars++;
    }

    // ── 3. INSTANCE METHODS ──────────────────────────────
    public void accelerate(int amount) {
        this.speed += amount;
        System.out.println(brand + " accelerates to " + speed + " km/h");
    }

    public void brake() {
        this.speed = Math.max(0, this.speed - 20);
    }

    // ── 4. STATIC METHOD ─────────────────────────────────
    public static int getTotalCars() {
        return totalCars;   // can't use 'this' — belongs to class
    }

    // ── 5. toString() ────────────────────────────────────
    @Override
    public String toString() {
        return "Car{brand='" + brand + "', speed=" + speed + "}";
    }
}
```

---

## 🏗️ Constructors In Depth

### Constructor Overloading
```java
public class Person {
    private String name;
    private int    age;
    private String email;

    // No-arg constructor
    public Person() {
        this("Anonymous", 0);          // calls 2-arg constructor
    }

    // 2-arg constructor
    public Person(String name, int age) {
        this(name, age, "none@email.com"); // calls 3-arg constructor
    }

    // Full constructor (canonical)
    public Person(String name, int age, String email) {
        this.name  = name;
        this.age   = age;
        this.email = email;
    }
}
```
> **Rule**: `this(...)` must be the **first statement** in a constructor.

### Constructor vs Method
| Feature | Constructor | Method |
|---------|-------------|--------|
| Name | Same as class | Any valid name |
| Return type | None (not even `void`) | Must declare return type |
| Called by | `new` keyword | Direct invocation |
| Purpose | Initialize object | Perform action |
| Inherited | ❌ No | ✅ Yes |

---

## 🔤 The `this` Keyword

```java
public class Rectangle {
    private double width;
    private double height;

    // Use 1: disambiguate field vs parameter
    public Rectangle(double width, double height) {
        this.width  = width;   // 'this.width' is the field
        this.height = height;  // 'width' alone is the parameter
    }

    // Use 2: call another constructor
    public Rectangle(double side) {
        this(side, side);      // square shortcut
    }

    // Use 3: pass current object as argument
    public void register(ShapeRegistry registry) {
        registry.add(this);    // passes THIS rectangle object
    }

    // Use 4: return current object (builder/fluent API)
    public Rectangle scale(double factor) {
        this.width  *= factor;
        this.height *= factor;
        return this;           // enables chaining: rect.scale(2).scale(3)
    }
}
```

---

## ⚡ `static` vs Instance

```java
public class Counter {
    // Instance variable — each object has its own copy
    private int instanceCount = 0;

    // Static variable — ONE copy shared by all objects
    private static int globalCount = 0;

    public void increment() {
        instanceCount++;    // changes THIS object's counter
        globalCount++;      // changes the SHARED counter
    }

    // Static method — no 'this', no access to instance fields
    public static int getGlobal() {
        return globalCount;
        // return instanceCount;  // ❌ COMPILE ERROR
    }

    // Instance method — has 'this', can access everything
    public int getInstanceCount() {
        return instanceCount;
        // return globalCount;    // ✅ also allowed
    }
}

// Usage
Counter a = new Counter();
Counter b = new Counter();
a.increment();
a.increment();
b.increment();

System.out.println(a.getInstanceCount()); // 2 (a's own)
System.out.println(b.getInstanceCount()); // 1 (b's own)
System.out.println(Counter.getGlobal());  // 3 (shared)
```

---

## 🧊 `final` Fields & Methods

```java
public class Circle {
    // final field — must be set in constructor, never changed after
    private final double radius;

    // static final — a true CONSTANT (convention: UPPER_SNAKE_CASE)
    public static final double PI = 3.14159265358979;

    public Circle(double radius) {
        this.radius = radius;  // set once here
        // this.radius = 5;    // ❌ can't assign again
    }

    // final method — cannot be overridden by subclasses
    public final double getArea() {
        return PI * radius * radius;
    }
}
```

---

## 🏭 Object Creation & Memory

```java
// Stack holds the REFERENCE; Heap holds the OBJECT
Car myCar;           // null reference on stack
myCar = new Car();   // object allocated on heap

Car another = myCar; // two references → SAME object
another.accelerate(50);
System.out.println(myCar.getSpeed()); // 50 — same object!

// Primitive vs Reference
int x = 5;
int y = x;    // COPY of value
y = 10;
System.out.println(x); // 5 — unaffected

Car c1 = new Car("BMW", 100);
Car c2 = c1;  // copy of REFERENCE (not object)
c2.accelerate(50);
System.out.println(c1.getSpeed()); // 150 — same object!
```

---

## 🗑️ Garbage Collection

```java
Car car = new Car("Toyota", 80);  // object #1 created
car = new Car("Honda", 90);       // object #1 now eligible for GC
                                  // (no references pointing to it)
car = null;                       // object #2 now eligible for GC
// GC runs automatically — no delete/free in Java
```

---

## 🧪 Complete Example — `BankAccount`

```java
public class BankAccount {
    // Fields
    private String accountNumber;
    private String owner;
    private double balance;
    private static int nextAccountId = 1000;

    // Constructor
    public BankAccount(String owner, double initialDeposit) {
        this.accountNumber = "ACC-" + (nextAccountId++);
        this.owner         = owner;
        this.balance       = initialDeposit;
    }

    // Methods
    public void deposit(double amount) {
        if (amount <= 0) throw new IllegalArgumentException("Amount must be positive");
        balance += amount;
        System.out.printf("Deposited ₹%.2f. New balance: ₹%.2f%n", amount, balance);
    }

    public void withdraw(double amount) {
        if (amount > balance) throw new IllegalStateException("Insufficient funds");
        balance -= amount;
        System.out.printf("Withdrew ₹%.2f. New balance: ₹%.2f%n", amount, balance);
    }

    public double getBalance()       { return balance; }
    public String getAccountNumber() { return accountNumber; }
    public String getOwner()         { return owner; }

    @Override
    public String toString() {
        return String.format("BankAccount[%s, owner=%s, balance=₹%.2f]",
                accountNumber, owner, balance);
    }
}

// Driver
public class Main {
    public static void main(String[] args) {
        BankAccount acc1 = new BankAccount("Alice", 5000);
        BankAccount acc2 = new BankAccount("Bob", 1000);

        acc1.deposit(2000);
        acc1.withdraw(500);
        System.out.println(acc1);
        System.out.println(acc2);
    }
}
```

---

## 📝 Key Takeaways

- A **class** is the blueprint; an **object** is the instance (`new`)
- **Constructors** initialize the object — same name, no return type
- `this` refers to the current object; `this(...)` calls another constructor
- `static` members belong to the **class**; instance members belong to **objects**
- `final` fields must be initialized once and never changed
- Java uses **garbage collection** — no manual memory management
- Objects live on the **heap**; references live on the **stack**

---

*Next: [02 — Encapsulation →](02-encapsulation.md)*
