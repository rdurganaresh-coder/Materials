# 04 — Polymorphism

> One interface, many implementations. The ability of an object to take many forms.

---

## 📖 What is Polymorphism?

**Polymorphism** (Greek: *poly* = many, *morph* = form) allows:
- A single reference type to point to different object types
- The same method call to behave differently based on the actual object

```
Shape s;

s = new Circle(5);
s.area();   // → 78.54  (Circle's formula)

s = new Rectangle(4, 6);
s.area();   // → 24.0   (Rectangle's formula)

// Same variable 's', same call '.area()', different result!
```

---

## 🔀 Two Types of Polymorphism

### 1. Compile-Time Polymorphism (Static) — Method Overloading

The compiler decides which method to call **at compile time** based on the method signature.

```java
public class Calculator {

    // Same name, different parameter types/counts
    public int add(int a, int b) {
        System.out.println("int + int");
        return a + b;
    }

    public double add(double a, double b) {
        System.out.println("double + double");
        return a + b;
    }

    public int add(int a, int b, int c) {
        System.out.println("int + int + int");
        return a + b + c;
    }

    public String add(String a, String b) {
        System.out.println("String + String");
        return a + b;
    }
}

// Java resolves which overload to call at compile time:
Calculator calc = new Calculator();
calc.add(1, 2);           // int + int
calc.add(1.5, 2.5);       // double + double
calc.add(1, 2, 3);        // int + int + int
calc.add("Hello", " World"); // String + String
```

#### Overloading Rules
| Rule | Detail |
|------|--------|
| Must differ | Parameter count OR parameter types |
| Return type alone | ❌ NOT enough to overload |
| Access modifiers | Can vary, but don't affect resolution |
| Auto-widening | `int` can auto-widen to `long`, `float`, `double` |

```java
public int    process(int x)    { return x; }
// public long process(int x)  { }  ❌ return type alone isn't enough
public long   process(long x)   { return x; }   // ✅ different parameter type

// Widening precedence:
// byte → short → int → long → float → double
void test() {
    byte b = 5;
    process(b);  // calls process(int x) via widening, not process(long x)
}
```

---

### 2. Runtime Polymorphism (Dynamic) — Method Overriding

The JVM decides which method to call **at runtime** based on the actual object type.

```java
public abstract class Shape {
    public abstract double area();

    public void printArea() {
        // This call is resolved at RUNTIME
        System.out.println(getClass().getSimpleName() + " area: " + area());
    }
}

public class Circle extends Shape {
    private double radius;
    public Circle(double r) { this.radius = r; }

    @Override
    public double area() { return Math.PI * radius * radius; }
}

public class Rectangle extends Shape {
    private double w, h;
    public Rectangle(double w, double h) { this.w = w; this.h = h; }

    @Override
    public double area() { return w * h; }
}

public class Triangle extends Shape {
    private double base, height;
    public Triangle(double b, double h) { this.base = b; this.height = h; }

    @Override
    public double area() { return 0.5 * base * height; }
}

// Runtime polymorphism in action
List<Shape> shapes = List.of(
    new Circle(5),
    new Rectangle(4, 6),
    new Triangle(3, 8)
);

for (Shape s : shapes) {
    s.printArea();  // JVM dispatches to correct area() at runtime
}
// Output:
// Circle area: 78.54
// Rectangle area: 24.0
// Triangle area: 12.0
```

---

## 🎭 Upcasting & Downcasting

```java
// Upcasting — automatic, always safe
Animal animal = new Dog("Rex", 3, "Lab");  // Dog → Animal (implicit)
Shape  shape  = new Circle(5);             // Circle → Shape (implicit)

// Downcasting — explicit, can throw ClassCastException
Dog dog = (Dog) animal;   // safe only if animal IS-A Dog
dog.fetch("ball");

// ── Safe downcasting ────────────────────────────────────
if (animal instanceof Dog d) {      // pattern matching (Java 16+)
    d.fetch("frisbee");             // 'd' is already cast
}

// ── Unsafe — will throw at runtime ──────────────────────
Animal cat = new Cat("Whiskers", 2);
Dog wrongCast = (Dog) cat;          // ❌ ClassCastException!
```

### Virtual Method Table (vtable)

```
How the JVM dispatches method calls:

  Shape s = new Circle(5);
  s.area();

  1. s is declared as Shape → compiler allows .area() call
  2. At runtime, JVM looks at actual object: Circle
  3. JVM consults Circle's vtable:
     area() → Circle.area()   ← uses this
  4. Circle.area() executes

  If s = new Rectangle(4,6):
  3. JVM consults Rectangle's vtable:
     area() → Rectangle.area() ← uses this instead
```

---

## 🔌 Polymorphism via Interfaces

```java
public interface Drawable {
    void draw();
}

public interface Resizable {
    void resize(double factor);
}

public class Circle implements Drawable, Resizable {
    private double radius;

    public Circle(double r) { this.radius = r; }

    @Override public void draw()               { System.out.println("Drawing circle r=" + radius); }
    @Override public void resize(double f)     { this.radius *= f; }
}

public class Square implements Drawable, Resizable {
    private double side;

    public Square(double s) { this.side = s; }

    @Override public void draw()               { System.out.println("Drawing square s=" + side); }
    @Override public void resize(double f)     { this.side *= f; }
}

// Polymorphic usage
List<Drawable> drawables = List.of(new Circle(5), new Square(4));
drawables.forEach(Drawable::draw);

List<Resizable> resizables = List.of(new Circle(3), new Square(6));
resizables.forEach(r -> r.resize(2.0));
```

---

## 🧩 Polymorphism with Collections

```java
// Payment polymorphism — real-world example
public interface PaymentMethod {
    boolean pay(double amount);
    String  getType();
}

public class CreditCard implements PaymentMethod {
    private String number;
    private double creditLimit;

    public CreditCard(String number, double limit) {
        this.number = number;
        this.creditLimit = limit;
    }

    @Override
    public boolean pay(double amount) {
        if (amount > creditLimit) return false;
        creditLimit -= amount;
        System.out.printf("Credit card %s charged ₹%.2f%n", number.substring(12), amount);
        return true;
    }

    @Override public String getType() { return "CREDIT_CARD"; }
}

public class UPI implements PaymentMethod {
    private String upiId;
    private double walletBalance;

    public UPI(String upiId, double balance) {
        this.upiId         = upiId;
        this.walletBalance = balance;
    }

    @Override
    public boolean pay(double amount) {
        if (amount > walletBalance) return false;
        walletBalance -= amount;
        System.out.printf("UPI %s paid ₹%.2f%n", upiId, amount);
        return true;
    }

    @Override public String getType() { return "UPI"; }
}

public class NetBanking implements PaymentMethod {
    private String bankCode;

    public NetBanking(String bankCode) { this.bankCode = bankCode; }

    @Override
    public boolean pay(double amount) {
        System.out.printf("Net banking [%s] transferred ₹%.2f%n", bankCode, amount);
        return true;
    }

    @Override public String getType() { return "NET_BANKING"; }
}

// Checkout — doesn't care about implementation details
public class Checkout {
    public static void processOrder(PaymentMethod payment, double amount) {
        System.out.println("Processing payment via " + payment.getType());
        if (payment.pay(amount)) {
            System.out.println("✓ Payment successful");
        } else {
            System.out.println("✗ Payment failed");
        }
    }
}

// All work through same interface
Checkout.processOrder(new CreditCard("4111111111111234", 10000), 2500);
Checkout.processOrder(new UPI("user@okaxis", 1000), 800);
Checkout.processOrder(new NetBanking("HDFC"), 5000);
```

---

## ⚙️ Covariant Return Types

```java
public class Animal {
    public Animal create() {
        return new Animal();
    }
}

public class Dog extends Animal {
    @Override
    public Dog create() {  // ✅ covariant return type — Dog is-a Animal
        return new Dog("Puppy", 1, "Mixed");
    }
}
```

---

## 🔄 Overloading vs Overriding

| Feature | Overloading | Overriding |
|---------|-------------|------------|
| Where | Same class | Parent + Child class |
| Signature | Must **differ** | Must **match** |
| Resolution | Compile time | Runtime |
| Type | Static polymorphism | Dynamic polymorphism |
| Return type | Can differ | Must be same or covariant |
| `@Override` | Not applicable | Strongly recommended |
| `static` methods | Can overload | Cannot override (only hide) |

```java
// Static method hiding (NOT overriding — no polymorphism!)
public class Parent {
    public static void greet() { System.out.println("Parent greet"); }
    public        void hello() { System.out.println("Parent hello"); }
}

public class Child extends Parent {
    public static void greet() { System.out.println("Child greet"); }  // HIDING
    @Override
    public        void hello() { System.out.println("Child hello"); }  // OVERRIDING
}

Parent obj = new Child();
obj.greet();  // "Parent greet"  — static: resolved by reference type
obj.hello();  // "Child hello"   — dynamic: resolved by actual type
```

---

## 📝 Key Takeaways

- **Overloading** = same name, different parameters → compile-time polymorphism
- **Overriding** = redefining parent method in child → runtime polymorphism
- **Upcasting** is implicit and safe; **downcasting** is explicit and risky
- Use `instanceof` (or pattern matching) before downcasting
- The JVM uses a **vtable** to dispatch method calls at runtime
- `static` methods are **hidden** (not overridden) — no runtime dispatch
- Polymorphism enables writing code against **abstractions** (parent/interface), not concrete types

---

*← [03 — Inheritance](03-inheritance.md) | [05 — Abstraction →](05-abstraction.md)*
