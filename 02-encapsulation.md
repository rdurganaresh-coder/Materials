# 02 — Encapsulation

> Bundling data and methods together while restricting direct access to internals.

---

## 📖 What is Encapsulation?

Encapsulation = **Data Hiding** + **Controlled Access**

```
WITHOUT Encapsulation         WITH Encapsulation
┌────────────────────┐       ┌────────────────────┐
│  Person             │       │  Person             │
│  + name: String     │       │  - name: String     │
│  + age: int         │       │  - age: int         │
│  (anyone can write) │       │  + getName()        │
│                     │       │  + setAge(int)      │
│  person.age = -5; ✅│       │  person.age = -5; ❌│
│  // breaks logic!   │       │  // blocked!        │
└────────────────────┘       └────────────────────┘
```

**Benefits:**
- Prevents invalid state (`age = -5`, `balance = -1000`)
- Internal implementation can change without breaking callers
- Enforces invariants via validation in setters
- Improves maintainability and testability

---

## 🔐 Access Modifiers

| Modifier | Same Class | Same Package | Subclass | Everywhere |
|----------|:----------:|:------------:|:--------:|:----------:|
| `private` | ✅ | ❌ | ❌ | ❌ |
| *(package-private)* | ✅ | ✅ | ❌ | ❌ |
| `protected` | ✅ | ✅ | ✅ | ❌ |
| `public` | ✅ | ✅ | ✅ | ✅ |

```java
public class AccessDemo {
    private   int secret       = 1;  // only this class
              int packageOnly  = 2;  // package-private (no keyword)
    protected int forChildren  = 3;  // subclasses + package
    public    int forEveryone  = 4;  // world-visible
}
```

---

## 🏗️ The JavaBean Pattern

The standard Java convention for encapsulated classes:
1. All fields are `private`
2. Public **getters** for readable fields
3. Public **setters** for writable fields (with validation)
4. No-arg constructor available

```java
public class Employee {

    // ── Private fields ───────────────────────────────────
    private String  name;
    private int     age;
    private double  salary;
    private String  department;
    private final   String empId;   // immutable — no setter

    private static int idCounter = 1000;

    // ── Constructor ──────────────────────────────────────
    public Employee(String name, int age, double salary, String department) {
        this.empId      = "EMP-" + (idCounter++);
        setName(name);          // reuse setter validation
        setAge(age);
        setSalary(salary);
        setDepartment(department);
    }

    // ── Getters ──────────────────────────────────────────
    public String getName()       { return name; }
    public int    getAge()        { return age; }
    public double getSalary()     { return salary; }
    public String getDepartment() { return department; }
    public String getEmpId()      { return empId; }  // read-only

    // ── Setters with validation ──────────────────────────
    public void setName(String name) {
        if (name == null || name.isBlank())
            throw new IllegalArgumentException("Name cannot be blank");
        this.name = name.trim();
    }

    public void setAge(int age) {
        if (age < 18 || age > 65)
            throw new IllegalArgumentException("Age must be 18–65, got: " + age);
        this.age = age;
    }

    public void setSalary(double salary) {
        if (salary < 0)
            throw new IllegalArgumentException("Salary cannot be negative");
        this.salary = salary;
    }

    public void setDepartment(String department) {
        if (department == null || department.isBlank())
            throw new IllegalArgumentException("Department required");
        this.department = department;
    }

    // Computed property — no backing field
    public double getAnnualSalary() {
        return salary * 12;
    }

    @Override
    public String toString() {
        return String.format("Employee{id=%s, name='%s', age=%d, dept=%s, salary=%.2f}",
                empId, name, age, department, salary);
    }
}
```

---

## 🔒 Immutable Classes

An **immutable** object cannot change after construction — the safest form of encapsulation.

Rules for immutability:
1. Declare class as `final` (no subclassing)
2. All fields `private final`
3. No setters
4. Deep copy mutable objects in constructor and getters

```java
public final class Money {
    private final double amount;
    private final String currency;

    public Money(double amount, String currency) {
        if (amount < 0) throw new IllegalArgumentException("Amount cannot be negative");
        this.amount   = amount;
        this.currency = currency.toUpperCase();
    }

    public double getAmount()   { return amount; }
    public String getCurrency() { return currency; }

    // Operations return NEW objects — never mutate
    public Money add(Money other) {
        if (!this.currency.equals(other.currency))
            throw new IllegalArgumentException("Currency mismatch");
        return new Money(this.amount + other.amount, this.currency);
    }

    public Money multiply(double factor) {
        return new Money(this.amount * factor, this.currency);
    }

    @Override
    public String toString() {
        return String.format("%s %.2f", currency, amount);
    }
}

// Usage
Money price  = new Money(100.0, "INR");
Money tax    = price.multiply(0.18);     // new object
Money total  = price.add(tax);           // new object
System.out.println(total);               // INR 118.00
// price is still INR 100.00 — immutable!
```

### Immutability with Mutable Fields

```java
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Date;

public final class ImmutableOrder {
    private final String        orderId;
    private final Date          orderDate;
    private final List<String>  items;

    public ImmutableOrder(String orderId, Date orderDate, List<String> items) {
        this.orderId   = orderId;
        this.orderDate = new Date(orderDate.getTime());      // defensive copy
        this.items     = new ArrayList<>(items);             // defensive copy
    }

    public String getOrderId() { return orderId; }

    public Date getOrderDate() {
        return new Date(orderDate.getTime());  // return copy, not original
    }

    public List<String> getItems() {
        return Collections.unmodifiableList(items);  // read-only view
    }
}
```

---

## 🏠 Encapsulation in Real Scenarios

### Scenario 1: Temperature Sensor
```java
public class TemperatureSensor {
    private double celsius;
    private static final double MIN_CELSIUS = -273.15; // absolute zero

    public void setCelsius(double celsius) {
        if (celsius < MIN_CELSIUS)
            throw new IllegalArgumentException("Below absolute zero!");
        this.celsius = celsius;
    }

    public double getCelsius()    { return celsius; }
    public double getFahrenheit() { return celsius * 9.0/5.0 + 32; }
    public double getKelvin()     { return celsius - MIN_CELSIUS; }
}
```

### Scenario 2: Password Field
```java
public class UserAccount {
    private String username;
    private char[] password;   // char[] preferred over String (security)
    private boolean locked;

    public UserAccount(String username, String password) {
        this.username = username;
        this.password = password.toCharArray();
    }

    // No getter for password! — you verify, not retrieve
    public boolean verifyPassword(String attempt) {
        return java.util.Arrays.equals(password, attempt.toCharArray());
    }

    public void changePassword(String oldPass, String newPass) {
        if (!verifyPassword(oldPass))
            throw new SecurityException("Incorrect current password");
        if (newPass.length() < 8)
            throw new IllegalArgumentException("Password too short");
        java.util.Arrays.fill(password, '\0');  // zero out old password
        this.password = newPass.toCharArray();
    }
}
```

---

## 🔗 Fluent Interface (Builder-style Encapsulation)

```java
public class QueryBuilder {
    private String  table;
    private String  condition;
    private int     limit = 100;
    private boolean distinct = false;

    // Private constructor — use static factory
    private QueryBuilder() {}

    public static QueryBuilder from(String table) {
        QueryBuilder qb = new QueryBuilder();
        qb.table = table;
        return qb;
    }

    public QueryBuilder where(String condition) {
        this.condition = condition;
        return this;  // return 'this' for chaining
    }

    public QueryBuilder limit(int limit) {
        this.limit = limit;
        return this;
    }

    public QueryBuilder distinct() {
        this.distinct = true;
        return this;
    }

    public String build() {
        StringBuilder sb = new StringBuilder("SELECT ");
        if (distinct) sb.append("DISTINCT ");
        sb.append("* FROM ").append(table);
        if (condition != null) sb.append(" WHERE ").append(condition);
        sb.append(" LIMIT ").append(limit);
        return sb.toString();
    }
}

// Usage — fluent chaining
String query = QueryBuilder
    .from("employees")
    .where("salary > 50000")
    .distinct()
    .limit(20)
    .build();
// → SELECT DISTINCT * FROM employees WHERE salary > 50000 LIMIT 20
```

---

## 📝 Key Takeaways

- Make fields `private` by default — expose only what's necessary
- Use **getters** for read access, **setters** for write with validation
- **Immutable** classes (`final` + no setters) are the safest design
- Defensive copy mutable objects (`Date`, `List`) to prevent leaks
- Validation in setters enforces business rules and prevents bad state
- `final` fields require initialization in constructor, can never change

---

*← [01 — Classes & Objects](01-classes-and-objects.md) | [03 — Inheritance →](03-inheritance.md)*
