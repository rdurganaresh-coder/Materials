# 03 — Inheritance

> Reusing and extending existing class behavior through parent-child relationships.

---

## 📖 What is Inheritance?

Inheritance lets a **child class** (subclass) acquire fields and methods from a **parent class** (superclass), then extend or specialize them.

```
        Animal (superclass / parent)
        ├── name: String
        ├── age: int
        └── eat(), sleep(), makeSound()
              │
    ┌─────────┼──────────┐
    ▼         ▼          ▼
   Dog       Cat       Bird  (subclasses / children)
 + breed   + indoor  + wingspan
 + fetch() + purr()  + fly()
 @Override makeSound()  (each overrides differently)
```

---

## 🔑 Basic Inheritance Syntax

```java
// ── Parent class ─────────────────────────────────────────
public class Animal {
    protected String name;
    protected int    age;

    public Animal(String name, int age) {
        this.name = name;
        this.age  = age;
    }

    public void eat() {
        System.out.println(name + " is eating.");
    }

    public void sleep() {
        System.out.println(name + " is sleeping.");
    }

    public String makeSound() {
        return "...";
    }

    @Override
    public String toString() {
        return getClass().getSimpleName() + "{name='" + name + "', age=" + age + "}";
    }
}

// ── Child class ──────────────────────────────────────────
public class Dog extends Animal {
    private String breed;

    // Constructor must call super() first
    public Dog(String name, int age, String breed) {
        super(name, age);         // calls Animal(String, int)
        this.breed = breed;
    }

    // Override parent method
    @Override
    public String makeSound() {
        return "Woof!";
    }

    // New method specific to Dog
    public void fetch(String item) {
        System.out.println(name + " fetches the " + item + "!");
    }

    public String getBreed() { return breed; }
}

// ── Usage ────────────────────────────────────────────────
Dog dog = new Dog("Rex", 3, "Labrador");
dog.eat();          // inherited from Animal
dog.fetch("ball");  // Dog-specific
System.out.println(dog.makeSound()); // "Woof!" — overridden
System.out.println(dog);  // Dog{name='Rex', age=3}
```

---

## 🏗️ Constructor Chaining with `super`

```java
public class Vehicle {
    protected String brand;
    protected int    year;

    public Vehicle(String brand, int year) {
        this.brand = brand;
        this.year  = year;
        System.out.println("Vehicle constructor: " + brand);
    }
}

public class Car extends Vehicle {
    private int doors;

    public Car(String brand, int year, int doors) {
        super(brand, year);   // MUST be first statement
        this.doors = doors;
        System.out.println("Car constructor: " + doors + " doors");
    }
}

public class ElectricCar extends Car {
    private int batteryKwh;

    public ElectricCar(String brand, int year, int doors, int batteryKwh) {
        super(brand, year, doors);  // calls Car → which calls Vehicle
        this.batteryKwh = batteryKwh;
        System.out.println("ElectricCar constructor: " + batteryKwh + "kWh");
    }
}

// new ElectricCar("Tesla", 2024, 4, 75) prints:
// Vehicle constructor: Tesla
// Car constructor: 4 doors
// ElectricCar constructor: 75kWh
```

> **Rule**: Java implicitly inserts `super()` if you don't write it — but only if the parent has a **no-arg constructor**. Always explicitly call `super(...)` when the parent requires arguments.

---

## 🔄 Method Overriding

```java
public class Shape {
    public double area() {
        return 0.0;  // default implementation
    }

    public String describe() {
        return "I am a " + getClass().getSimpleName()
             + " with area " + String.format("%.2f", area());
    }
}

public class Circle extends Shape {
    private double radius;

    public Circle(double radius) { this.radius = radius; }

    @Override
    public double area() {
        return Math.PI * radius * radius;
    }
}

public class Rectangle extends Shape {
    private double width, height;

    public Rectangle(double w, double h) {
        this.width = w; this.height = h;
    }

    @Override
    public double area() {
        return width * height;
    }
}

// Usage
Shape s = new Circle(5);
System.out.println(s.describe()); // "I am a Circle with area 78.54"
// describe() calls area() → dispatched to Circle.area() at RUNTIME
```

### Rules for `@Override`
| Rule | Detail |
|------|--------|
| Same method signature | Name + parameter types must match exactly |
| Return type | Must be same or covariant (subtype) |
| Access modifier | Can be same or **more** permissive (not less) |
| Exceptions | Can throw fewer/narrower checked exceptions |
| `@Override` annotation | Not required but strongly recommended (catches typos) |

---

## 🔭 `super` Keyword

```java
public class Employee {
    protected String name;
    protected double salary;

    public Employee(String name, double salary) {
        this.name   = name;
        this.salary = salary;
    }

    public String getDetails() {
        return "Employee: " + name + ", Salary: " + salary;
    }
}

public class Manager extends Employee {
    private int teamSize;

    public Manager(String name, double salary, int teamSize) {
        super(name, salary);    // super() — call parent constructor
        this.teamSize = teamSize;
    }

    @Override
    public String getDetails() {
        // super.method() — call parent's version
        return super.getDetails() + ", Team Size: " + teamSize;
    }
}
```

---

## 🚫 `final` and Inheritance

```java
// final class — CANNOT be extended
public final class String { ... }  // you cannot extend java.lang.String

// final method — CANNOT be overridden
public class Base {
    public final void criticalOperation() {
        // secure logic that must not be tampered with
    }
}

public class Child extends Base {
    // @Override criticalOperation() { ... }  ❌ COMPILE ERROR
}
```

---

## 🌳 Multi-Level Inheritance

```java
// Grandparent → Parent → Child
public class LivingBeing {
    public void breathe() {
        System.out.println("Breathing oxygen");
    }
}

public class Animal extends LivingBeing {
    public void eat() {
        System.out.println("Eating food");
    }
}

public class Dog extends Animal {
    public void bark() {
        System.out.println("Woof!");
    }
}

// Dog inherits: breathe() from LivingBeing, eat() from Animal
Dog d = new Dog();
d.breathe();  // inherited 2 levels up
d.eat();      // inherited 1 level up
d.bark();     // own method
```

> **Note**: Java does NOT support **multiple inheritance** of classes (a class cannot extend two classes). Use **interfaces** for that.

---

## 🔍 Type Checking & Casting

```java
Animal animal = new Dog("Rex", 3, "Lab");

// instanceof — check before casting
if (animal instanceof Dog) {
    Dog dog = (Dog) animal;      // safe cast
    dog.fetch("stick");
}

// Java 16+ pattern matching instanceof
if (animal instanceof Dog d) {   // binds to 'd' directly
    d.fetch("stick");
}

// ClassCastException — unsafe cast
Cat cat = (Cat) animal;  // ❌ throws ClassCastException at runtime
```

---

## 📊 Inheritance vs Composition

| Aspect | Inheritance (`is-a`) | Composition (`has-a`) |
|--------|---------------------|-----------------------|
| Relationship | Dog **is-a** Animal | Car **has-a** Engine |
| Coupling | Tight (child depends on parent internals) | Loose |
| Flexibility | Less flexible | More flexible |
| Reuse | Shares implementation | Delegates to component |
| When to use | Genuine subtype relationship | "uses" relationship |

```java
// ❌ Bad: Using inheritance when composition is better
public class Stack extends ArrayList<Integer> {
    // Stack "is-a" ArrayList? No — misuse of inheritance
}

// ✅ Good: Composition
public class Stack {
    private ArrayList<Integer> data = new ArrayList<>(); // has-a

    public void push(int val) { data.add(val); }
    public int  pop()         { return data.remove(data.size() - 1); }
    public int  peek()        { return data.get(data.size() - 1); }
}
```

---

## 🧪 Complete Example — Employee Hierarchy

```java
// Base class
public class Employee {
    private final String empId;
    private String name;
    private String department;

    public Employee(String empId, String name, String department) {
        this.empId      = empId;
        this.name       = name;
        this.department = department;
    }

    public double calculatePay() { return 0; }  // to be overridden

    // Getters
    public String getEmpId()      { return empId; }
    public String getName()       { return name; }
    public String getDepartment() { return department; }

    @Override
    public String toString() {
        return String.format("%s[%s, %s, pay=%.2f]",
                getClass().getSimpleName(), empId, name, calculatePay());
    }
}

// Full-time salaried employee
public class SalariedEmployee extends Employee {
    private double annualSalary;

    public SalariedEmployee(String id, String name, String dept, double annualSalary) {
        super(id, name, dept);
        this.annualSalary = annualSalary;
    }

    @Override
    public double calculatePay() {
        return annualSalary / 12;   // monthly pay
    }
}

// Hourly employee
public class HourlyEmployee extends Employee {
    private double hourlyRate;
    private int    hoursWorked;

    public HourlyEmployee(String id, String name, String dept,
                          double hourlyRate, int hoursWorked) {
        super(id, name, dept);
        this.hourlyRate   = hourlyRate;
        this.hoursWorked  = hoursWorked;
    }

    @Override
    public double calculatePay() {
        double regular  = Math.min(hoursWorked, 40) * hourlyRate;
        double overtime = Math.max(0, hoursWorked - 40) * hourlyRate * 1.5;
        return regular + overtime;
    }
}

// Commission-based employee
public class CommissionEmployee extends SalariedEmployee {
    private double commissionRate;
    private double salesAmount;

    public CommissionEmployee(String id, String name, String dept,
                              double baseSalary, double commissionRate, double salesAmount) {
        super(id, name, dept, baseSalary);
        this.commissionRate = commissionRate;
        this.salesAmount    = salesAmount;
    }

    @Override
    public double calculatePay() {
        return super.calculatePay() + (commissionRate * salesAmount);
    }
}

// Payroll processor
import java.util.List;
public class Payroll {
    public static void process(List<Employee> employees) {
        double total = 0;
        for (Employee e : employees) {
            double pay = e.calculatePay();
            System.out.println(e.getName() + ": ₹" + String.format("%.2f", pay));
            total += pay;
        }
        System.out.println("Total payroll: ₹" + String.format("%.2f", total));
    }
}
```

---

## 📝 Key Takeaways

- `extends` creates an is-a relationship between child and parent
- `super(...)` must be the **first line** in a child constructor
- `@Override` redefines parent behavior — match the signature exactly
- `super.method()` calls the parent's version from within the override
- `final class` prevents subclassing; `final method` prevents overriding
- Java supports **single inheritance** only — no extending two classes
- Prefer **composition over inheritance** when the relationship isn't truly is-a

---

*← [02 — Encapsulation](02-encapsulation.md) | [04 — Polymorphism →](04-polymorphism.md)*
