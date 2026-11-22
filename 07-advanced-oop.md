# 07 — Advanced OOP

> Inner classes, Generics, Enums, Records, Sealed Classes, and more.

---

## 🏠 Inner Classes

Java has four kinds of nested/inner classes:

```
┌─────────────────────────────────────────────────────┐
│  Outer Class                                         │
│  ┌───────────────────┐  ┌──────────────────────┐    │
│  │ Static Nested     │  │ Inner Class           │    │
│  │ (no outer ref)    │  │ (has outer ref)       │    │
│  └───────────────────┘  └──────────────────────┘    │
│                                                      │
│  void method() {                                     │
│    class LocalClass { }   // method-local            │
│    Runnable r = new Runnable() { }; // anonymous     │
│  }                                                   │
└─────────────────────────────────────────────────────┘
```

### 1. Static Nested Class
```java
public class Computer {
    private String brand;

    // Static nested — no reference to outer object
    public static class CPU {
        private String model;
        private int cores;

        public CPU(String model, int cores) {
            this.model = model;
            this.cores = cores;
        }

        public String getSpec() { return model + " (" + cores + " cores)"; }
    }

    public Computer(String brand) { this.brand = brand; }

    // Create without a Computer instance
    // Computer.CPU cpu = new Computer.CPU("i9-13900K", 24);
}
```

### 2. Non-Static Inner Class
```java
public class BankAccount {
    private double balance;
    private String owner;

    public BankAccount(String owner, double balance) {
        this.owner   = owner;
        this.balance = balance;
    }

    // Inner class — has implicit reference to outer BankAccount
    public class Transaction {
        private double amount;
        private String type;

        public Transaction(double amount, String type) {
            this.amount = amount;
            this.type   = type;
        }

        public void execute() {
            // Can access outer class's private members directly!
            if (type.equals("DEPOSIT"))  balance += amount;
            else if (type.equals("WITHDRAWAL")) balance -= amount;
            System.out.printf("%s: ₹%.2f | %s balance: ₹%.2f%n",
                    type, amount, owner, balance);
        }
    }
}

// Usage — need outer object first
BankAccount acc = new BankAccount("Alice", 1000);
BankAccount.Transaction t = acc.new Transaction(500, "DEPOSIT");
t.execute();
```

### 3. Local Class
```java
public class EventProcessor {
    public void process(String eventData) {
        // Local class — defined inside method, invisible outside
        class EventParser {
            String[] parse(String raw) {
                return raw.split(",");
            }
        }

        EventParser parser = new EventParser();
        String[] parts = parser.parse(eventData);
        System.out.println("Parts: " + java.util.Arrays.toString(parts));
    }
}
```

### 4. Anonymous Class
```java
import java.util.Comparator;
import java.util.Arrays;

String[] names = {"Charlie", "Alice", "Bob"};

// Anonymous class implementing Comparator
Arrays.sort(names, new Comparator<String>() {
    @Override
    public int compare(String a, String b) {
        return a.compareToIgnoreCase(b);
    }
});

// Java 8+ lambda is cleaner:
Arrays.sort(names, (a, b) -> a.compareToIgnoreCase(b));
// Or method reference:
Arrays.sort(names, String::compareToIgnoreCase);
```

---

## 🧬 Generics

Generics enable classes and methods to operate on **typed parameters**, providing compile-time type safety.

### Generic Class
```java
public class Box<T> {
    private T content;

    public Box(T content)  { this.content = content; }
    public T getContent()  { return content; }
    public void setContent(T content) { this.content = content; }

    @Override
    public String toString() { return "Box[" + content + "]"; }
}

Box<String>  strBox = new Box<>("Hello");
Box<Integer> intBox = new Box<>(42);
Box<Double>  dblBox = new Box<>(3.14);

// Type safety at compile time:
// strBox.getContent() returns String — no cast needed
// strBox = intBox;  ❌ COMPILE ERROR
```

### Generic Method
```java
public class Utils {
    // <T> before return type declares the type parameter
    public static <T> void swap(T[] arr, int i, int j) {
        T temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }

    public static <T extends Comparable<T>> T max(T a, T b) {
        return a.compareTo(b) >= 0 ? a : b;
    }

    public static <T> List<T> repeat(T item, int times) {
        List<T> list = new ArrayList<>();
        for (int i = 0; i < times; i++) list.add(item);
        return list;
    }
}

Utils.max(10, 20);          // Integer
Utils.max("apple", "mango");// String
Utils.max(3.14, 2.71);      // Double
```

### Bounded Type Parameters
```java
// Upper bound: T must be Number or subclass
public class NumberBox<T extends Number> {
    private T value;

    public NumberBox(T value) { this.value = value; }

    public double doubleValue() { return value.doubleValue(); }
    public boolean isGreaterThan(NumberBox<? extends Number> other) {
        return this.doubleValue() > other.doubleValue();
    }
}

NumberBox<Integer> intBox = new NumberBox<>(42);
NumberBox<Double>  dblBox = new NumberBox<>(3.14);
// NumberBox<String> strBox = new NumberBox<>("x"); ❌ String not a Number
```

### Wildcards
```java
import java.util.List;

// ? extends T — read-only (producer)
public static double sumList(List<? extends Number> list) {
    return list.stream().mapToDouble(Number::doubleValue).sum();
}
sumList(List.of(1, 2, 3));        // works with Integer list
sumList(List.of(1.5, 2.5, 3.0)); // works with Double list

// ? super T — write-only (consumer)
public static void addNumbers(List<? super Integer> list) {
    list.add(1); list.add(2); list.add(3);
}
```

### Generic Pair
```java
public class Pair<A, B> {
    private final A first;
    private final B second;

    public Pair(A first, B second) {
        this.first  = first;
        this.second = second;
    }

    public A getFirst()  { return first; }
    public B getSecond() { return second; }

    public static <X, Y> Pair<X, Y> of(X x, Y y) { return new Pair<>(x, y); }

    @Override
    public String toString() { return "(" + first + ", " + second + ")"; }
}

Pair<String, Integer> nameAge = Pair.of("Alice", 30);
Pair<String, String>  coords  = Pair.of("12.97°N", "77.59°E");
```

---

## 🎯 Enums

Enums are special classes where instances are predefined constants.

### Basic Enum
```java
public enum Day {
    MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY;

    public boolean isWeekend() {
        return this == SATURDAY || this == SUNDAY;
    }

    public boolean isWeekday() { return !isWeekend(); }
}

Day today = Day.WEDNESDAY;
System.out.println(today.isWeekend()); // false
System.out.println(today.name());      // "WEDNESDAY"
System.out.println(today.ordinal());   // 2

for (Day d : Day.values()) {
    System.out.println(d + ": " + (d.isWeekend() ? "Weekend" : "Weekday"));
}
```

### Enum with Fields and Methods
```java
public enum Planet {
    MERCURY(3.303e+23, 2.4397e6),
    VENUS  (4.869e+24, 6.0518e6),
    EARTH  (5.976e+24, 6.37814e6),
    MARS   (6.421e+23, 3.3972e6);

    private final double mass;    // in kilograms
    private final double radius;  // in meters

    // Enum constructor is always private
    Planet(double mass, double radius) {
        this.mass   = mass;
        this.radius = radius;
    }

    static final double G = 6.67300E-11;

    public double surfaceGravity() {
        return G * mass / (radius * radius);
    }

    public double surfaceWeight(double otherMass) {
        return otherMass * surfaceGravity();
    }
}

double earthWeight = 75.0;
double mass = earthWeight / Planet.EARTH.surfaceGravity();
for (Planet p : Planet.values())
    System.out.printf("Weight on %s is %6.2f%n", p, p.surfaceWeight(mass));
```

### Enum with Abstract Methods
```java
public enum Operation {
    ADD("+") {
        @Override public double apply(double x, double y) { return x + y; }
    },
    SUBTRACT("-") {
        @Override public double apply(double x, double y) { return x - y; }
    },
    MULTIPLY("*") {
        @Override public double apply(double x, double y) { return x * y; }
    },
    DIVIDE("/") {
        @Override public double apply(double x, double y) {
            if (y == 0) throw new ArithmeticException("Division by zero");
            return x / y;
        }
    };

    private final String symbol;
    Operation(String symbol) { this.symbol = symbol; }

    public abstract double apply(double x, double y);

    @Override public String toString() { return symbol; }
}

for (Operation op : Operation.values())
    System.out.printf("10 %s 3 = %.1f%n", op, op.apply(10, 3));
```

---

## 📦 Records (Java 16+)

Records are immutable data carriers — a concise replacement for plain data classes.

```java
// Traditional data class (verbose)
public class PersonOld {
    private final String name;
    private final int    age;
    public PersonOld(String name, int age) { this.name = name; this.age = age; }
    public String getName() { return name; }
    public int    getAge()  { return age; }
    @Override public String toString() { return "Person{name=" + name + ", age=" + age + "}"; }
    @Override public boolean equals(Object o) { /* 15 lines */ }
    @Override public int hashCode() { /* 5 lines */ }
}

// Record — same result in one line!
public record Person(String name, int age) {}

// Java auto-generates:
// - final fields
// - canonical constructor
// - getters (name(), age() — no "get" prefix)
// - equals(), hashCode(), toString()

Person p = new Person("Alice", 30);
System.out.println(p.name());     // Alice
System.out.println(p.age());      // 30
System.out.println(p);            // Person[name=Alice, age=30]

// Records can have compact constructors (validation)
public record Email(String address) {
    // Compact constructor — no params, assigns automatically
    public Email {
        if (!address.contains("@"))
            throw new IllegalArgumentException("Invalid email: " + address);
        address = address.toLowerCase(); // normalize
    }
}

// Records can have additional methods
public record Range(int min, int max) {
    public Range {
        if (min > max) throw new IllegalArgumentException("min > max");
    }

    public int size()             { return max - min; }
    public boolean contains(int n){ return n >= min && n <= max; }
}
```

---

## 🔒 Sealed Classes (Java 17+)

Sealed classes restrict which classes can extend them — enabling exhaustive pattern matching.

```java
// Only the listed classes can extend Shape
public sealed class Shape
        permits Circle, Rectangle, Triangle {}

public final class Circle    extends Shape { double radius; }
public final class Rectangle extends Shape { double width, height; }
public non-sealed class Triangle extends Shape { double base, height; }
// 'non-sealed' allows Triangle to be extended freely

// Exhaustive pattern matching (Java 21+)
String describe(Shape s) {
    return switch (s) {
        case Circle    c -> "Circle r=" + c.radius;
        case Rectangle r -> "Rect " + r.width + "x" + r.height;
        case Triangle  t -> "Triangle b=" + t.base;
        // No default needed — compiler knows all subclasses!
    };
}
```

---

## 📝 Key Takeaways

- **Static nested class** — no outer reference; instantiate with `Outer.Inner`
- **Inner class** — has outer reference; instantiate with `outer.new Inner()`
- **Generics** — type-safe containers; `<T>` declared at class or method level
- **Bounded wildcards**: `? extends T` (read), `? super T` (write)
- **Enums** are full classes — can have fields, methods, and abstract methods
- **Records** auto-generate constructors, getters, `equals`/`hashCode`/`toString`
- **Sealed classes** restrict inheritance for exhaustive pattern matching

---

*← [06 — Interfaces](06-interfaces.md) | [08 — Design Patterns →](08-design-patterns.md)*
