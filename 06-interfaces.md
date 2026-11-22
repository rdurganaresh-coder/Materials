# 06 — Interfaces

> Pure contracts that define capabilities without dictating implementation.

---

## 📖 What is an Interface?

An interface is a **100% abstract contract** specifying what a class must do, not how.

```
Interface = Contract
┌─────────────────────────────┐
│  <<interface>>              │
│  Flyable                    │
│  ─────────────────────────  │
│  + fly(): void              │   ← must implement
│  + getMaxAltitude(): int    │   ← must implement
└─────────────────────────────┘
         ▲          ▲
         │          │
      Bird        Drone
  (flaps wings) (rotors spin)
```

---

## 🔑 Interface Syntax

```java
public interface Drawable {
    // ── Constants (implicitly public static final) ────────
    int DEFAULT_SIZE = 100;   // same as: public static final int DEFAULT_SIZE = 100;

    // ── Abstract method (implicitly public abstract) ──────
    void draw();              // same as: public abstract void draw();

    // ── Default method (Java 8+) — has body ──────────────
    default void drawWithBorder() {
        System.out.println("Drawing border...");
        draw();               // calls the abstract method
    }

    // ── Static method (Java 8+) ───────────────────────────
    static Drawable createDefault() {
        return new Circle(DEFAULT_SIZE);  // factory method
    }

    // ── Private method (Java 9+) — helper for default methods
    private void logDraw(String shape) {
        System.out.println("[LOG] Drawing " + shape);
    }
}

// Implementing
public class Circle implements Drawable {
    private int radius;
    public Circle(int r) { this.radius = r; }

    @Override
    public void draw() {
        System.out.println("Drawing circle with radius " + radius);
    }
}
```

---

## 🔗 Multiple Interface Implementation

```java
public interface Flyable {
    void fly();
    default String getMode() { return "AIR"; }
}

public interface Swimmable {
    void swim();
    default String getMode() { return "WATER"; }
}

public interface Runnable {
    void run();
}

// A class can implement MULTIPLE interfaces
public class Duck implements Flyable, Swimmable, Runnable {

    @Override public void fly()  { System.out.println("Duck flapping wings"); }
    @Override public void swim() { System.out.println("Duck paddling"); }
    @Override public void run()  { System.out.println("Duck waddling"); }

    // Conflict: both Flyable and Swimmable have getMode()
    // MUST override to resolve
    @Override
    public String getMode() {
        return Flyable.super.getMode() + "/" + Swimmable.super.getMode();
    }
}
```

---

## 🧩 Interface Inheritance

```java
// Base interface
public interface Shape {
    double area();
    double perimeter();
}

// Extended interface
public interface ColoredShape extends Shape {
    String getColor();

    default String describe() {
        return String.format("%s shape: area=%.2f, color=%s",
                getClass().getSimpleName(), area(), getColor());
    }
}

// Even further extended
public interface AnimatedShape extends ColoredShape {
    void animate();
    int getFrameRate();
}

// Implementing the deepest interface requires ALL methods
public class AnimatedCircle implements AnimatedShape {
    private double radius;
    private String color;

    public AnimatedCircle(double r, String c) { this.radius = r; this.color = c; }

    @Override public double area()       { return Math.PI * radius * radius; }
    @Override public double perimeter()  { return 2 * Math.PI * radius; }
    @Override public String getColor()   { return color; }
    @Override public void   animate()    { System.out.println("Spinning circle..."); }
    @Override public int    getFrameRate(){ return 60; }
}
```

---

## ⚡ Functional Interfaces (Java 8+)

A **functional interface** has exactly **one abstract method** — used with lambdas.

```java
@FunctionalInterface
public interface Validator<T> {
    boolean validate(T value);

    // default/static methods allowed — don't count as the single abstract
    default Validator<T> and(Validator<T> other) {
        return value -> this.validate(value) && other.validate(value);
    }

    default Validator<T> or(Validator<T> other) {
        return value -> this.validate(value) || other.validate(value);
    }
}

// Without lambda — anonymous class
Validator<String> notEmpty = new Validator<String>() {
    @Override
    public boolean validate(String value) {
        return value != null && !value.isEmpty();
    }
};

// With lambda — much cleaner!
Validator<String> notEmpty    = value -> value != null && !value.isEmpty();
Validator<String> notTooLong  = value -> value.length() <= 50;
Validator<Integer> positiveNum = n -> n > 0;

// Compose validators
Validator<String> nameValidator = notEmpty.and(notTooLong);
System.out.println(nameValidator.validate("Alice"));  // true
System.out.println(nameValidator.validate(""));       // false
```

### Built-in Functional Interfaces (java.util.function)

```java
import java.util.function.*;

// Predicate<T> — T → boolean
Predicate<String> isEmail = s -> s.contains("@");
System.out.println(isEmail.test("user@gmail.com"));  // true

// Function<T, R> — T → R
Function<String, Integer> strLen = String::length;
System.out.println(strLen.apply("Hello"));           // 5

// Consumer<T> — T → void
Consumer<String> printer = System.out::println;
printer.accept("Hello World");

// Supplier<T> — () → T
Supplier<Double> randomNum = Math::random;
System.out.println(randomNum.get());

// BiFunction<T, U, R> — T, U → R
BiFunction<Integer, Integer, Integer> add = (a, b) -> a + b;
System.out.println(add.apply(3, 5));                 // 8

// UnaryOperator<T> — T → T (special Function)
UnaryOperator<String> shout = String::toUpperCase;

// BinaryOperator<T> — T, T → T
BinaryOperator<Integer> max = Math::max;
```

---

## 🏭 Interface as API Contract — Strategy Pattern

```java
// Strategy interface
public interface SortStrategy {
    void sort(int[] arr);
    default String getName() { return getClass().getSimpleName(); }
}

// Concrete strategies
public class BubbleSort implements SortStrategy {
    @Override
    public void sort(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n - 1; i++)
            for (int j = 0; j < n - i - 1; j++)
                if (arr[j] > arr[j + 1]) {
                    int tmp = arr[j]; arr[j] = arr[j+1]; arr[j+1] = tmp;
                }
    }
}

public class QuickSort implements SortStrategy {
    @Override
    public void sort(int[] arr) { quickSort(arr, 0, arr.length - 1); }

    private void quickSort(int[] a, int lo, int hi) {
        if (lo < hi) {
            int p = partition(a, lo, hi);
            quickSort(a, lo, p - 1);
            quickSort(a, p + 1, hi);
        }
    }

    private int partition(int[] a, int lo, int hi) {
        int pivot = a[hi], i = lo - 1;
        for (int j = lo; j < hi; j++)
            if (a[j] <= pivot) { i++; int t = a[i]; a[i] = a[j]; a[j] = t; }
        int t = a[i+1]; a[i+1] = a[hi]; a[hi] = t;
        return i + 1;
    }
}

// Context — uses any strategy
public class Sorter {
    private SortStrategy strategy;

    public Sorter(SortStrategy strategy) { this.strategy = strategy; }

    public void setStrategy(SortStrategy strategy) { this.strategy = strategy; }

    public int[] sort(int[] arr) {
        int[] copy = arr.clone();
        long start = System.nanoTime();
        strategy.sort(copy);
        long end = System.nanoTime();
        System.out.printf("%s sorted in %d ns%n", strategy.getName(), end - start);
        return copy;
    }
}

// Swap strategies at runtime
Sorter sorter = new Sorter(new BubbleSort());
sorter.sort(new int[]{5, 3, 1, 4, 2});

sorter.setStrategy(new QuickSort());
sorter.sort(new int[]{5, 3, 1, 4, 2});

// Or use a lambda!
sorter.setStrategy(arr -> java.util.Arrays.sort(arr));
```

---

## 📋 Marker Interfaces

Interfaces with **no methods** — used to mark/tag a class.

```java
// Java's own marker interfaces
java.io.Serializable    // marks class as serializable
java.lang.Cloneable     // marks class as cloneable
java.util.RandomAccess  // marks List as O(1) random access

// Custom marker interface
public interface Auditable { }  // no methods

public class Order implements Auditable {
    private String id;
    // ... regular class
}

// Check at runtime
public void save(Object obj) {
    if (obj instanceof Auditable) {
        auditLog.record(obj);  // extra logging for auditable objects
    }
    database.save(obj);
}
```

---

## 🆚 Default Methods & Diamond Problem

```java
public interface A {
    default void hello() { System.out.println("Hello from A"); }
}

public interface B extends A {
    default void hello() { System.out.println("Hello from B"); }
}

public interface C extends A {
    default void hello() { System.out.println("Hello from C"); }
}

// Class implementing both B and C — conflict!
public class D implements B, C {
    @Override
    public void hello() {
        B.super.hello();  // explicitly choose B's version
        // or C.super.hello(), or write your own
    }
}
```

---

## 📝 Key Takeaways

- Interfaces define **what**, not **how** — pure contracts
- A class can implement **multiple** interfaces (solving multiple inheritance)
- `default` methods (Java 8+) add implementation without breaking existing code
- `static` methods in interfaces are utility helpers, called via `InterfaceName.method()`
- **Functional interfaces** have one abstract method — enable lambdas
- Use `@FunctionalInterface` annotation to enforce single-abstract-method rule
- Interface constants are implicitly `public static final`
- Resolve default method conflicts by explicitly calling `Interface.super.method()`

---

*← [05 — Abstraction](05-abstraction.md) | [07 — Advanced OOP →](07-advanced-oop.md)*
