# 10 — Capstone Project: Banking System

> A complete mini banking application combining every OOP concept from this course.

---

## 📐 System Design

```
         ┌─────────────────────────────────────────────┐
         │              Banking System                  │
         │                                              │
         │  ┌──────────────┐    ┌──────────────────┐   │
         │  │  Account     │    │   Transaction    │   │
         │  │  Hierarchy   │    │   System         │   │
         │  │              │    │                  │   │
         │  │  BankAccount │    │  <<interface>>   │   │
         │  │  (abstract)  │    │  Transactable    │   │
         │  │  /    \      │    │  Command Pattern │   │
         │  │ Savings Current  │    └──────────────────┘   │
         │  │      \           │                  │
         │  │    Fixed Deposit │    ┌──────────────────┐   │
         │  └──────────────┘    │   Notification   │   │
         │                      │   Observer       │   │
         │  ┌──────────────┐    └──────────────────┘   │
         │  │  Customer    │                            │
         │  │  (Generics,  │    ┌──────────────────┐   │
         │  │   Builder)   │    │  Interest Calc   │   │
         │  └──────────────┘    │  Strategy Pattern│   │
         └─────────────────────────────────────────────┘
```

---

## 🏗️ All Source Files

### 1. `Transaction.java` — Record + Enum

```java
package banking;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public enum TransactionType {
    DEPOSIT("Deposit", "+"),
    WITHDRAWAL("Withdrawal", "-"),
    TRANSFER_IN("Transfer In", "+"),
    TRANSFER_OUT("Transfer Out", "-"),
    INTEREST("Interest", "+");

    private final String label;
    private final String sign;

    TransactionType(String label, String sign) {
        this.label = label;
        this.sign  = sign;
    }

    public String getLabel() { return label; }
    public String getSign()  { return sign; }
}

// Record — immutable transaction log entry
public record Transaction(
        String          id,
        TransactionType type,
        double          amount,
        double          balanceAfter,
        String          description,
        LocalDateTime   timestamp
) {
    private static final DateTimeFormatter FMT =
            DateTimeFormatter.ofPattern("dd-MM-yyyy HH:mm:ss");

    // Compact constructor — validates
    public Transaction {
        if (amount <= 0) throw new IllegalArgumentException("Amount must be positive");
    }

    @Override
    public String toString() {
        return String.format("[%s] %-15s %s₹%8.2f  Balance: ₹%10.2f  %s",
                timestamp.format(FMT), type.getLabel(),
                type.getSign(), amount, balanceAfter, description);
    }
}
```

---

### 2. `InterestStrategy.java` — Strategy + Functional Interface

```java
package banking;

@FunctionalInterface
public interface InterestStrategy {
    double calculate(double principal, int months);

    // Static factory methods
    static InterestStrategy simple(double annualRate) {
        return (principal, months) -> principal * annualRate * months / 12;
    }

    static InterestStrategy compound(double annualRate) {
        return (principal, months) -> {
            double r = annualRate / 12;
            return principal * (Math.pow(1 + r, months) - 1);
        };
    }

    static InterestStrategy none() {
        return (principal, months) -> 0;
    }
}
```

---

### 3. `AccountObserver.java` — Observer Pattern

```java
package banking;

public interface AccountObserver {
    void onTransaction(String accountNumber, Transaction txn);
    void onLowBalance(String accountNumber, double balance, double threshold);
}

public class ConsolePrinter implements AccountObserver {
    @Override
    public void onTransaction(String accNum, Transaction txn) {
        System.out.println("  " + txn);
    }

    @Override
    public void onLowBalance(String accNum, double balance, double threshold) {
        System.out.printf("  ⚠  LOW BALANCE ALERT [%s]: ₹%.2f (threshold: ₹%.2f)%n",
                accNum, balance, threshold);
    }
}

public class AuditLogger implements AccountObserver {
    private final java.util.List<String> log = new java.util.ArrayList<>();

    @Override
    public void onTransaction(String accNum, Transaction txn) {
        log.add(String.format("AUDIT|%s|%s|%.2f", accNum, txn.type(), txn.amount()));
    }

    @Override
    public void onLowBalance(String accNum, double balance, double threshold) {
        log.add(String.format("AUDIT|%s|LOW_BALANCE|%.2f", accNum, balance));
    }

    public java.util.List<String> getLog() {
        return java.util.Collections.unmodifiableList(log);
    }
}
```

---

### 4. `BankAccount.java` — Abstract Class + Template Method

```java
package banking;

import java.time.LocalDateTime;
import java.util.*;

public abstract class BankAccount {
    // ── Fields ──────────────────────────────────────────────────
    private final String accountNumber;
    private final String customerId;
    protected double balance;
    private final List<Transaction>    history   = new ArrayList<>();
    private final List<AccountObserver> observers = new ArrayList<>();
    private static int txnCounter = 1000;

    // ── Constructor ─────────────────────────────────────────────
    protected BankAccount(String accountNumber, String customerId, double initialDeposit) {
        this.accountNumber = accountNumber;
        this.customerId    = customerId;
        this.balance       = initialDeposit;
    }

    // ── Observer registration ───────────────────────────────────
    public void addObserver(AccountObserver o)    { observers.add(o); }
    public void removeObserver(AccountObserver o) { observers.remove(o); }

    private void notify(Transaction txn) {
        observers.forEach(o -> o.onTransaction(accountNumber, txn));
        if (balance < getLowBalanceThreshold())
            observers.forEach(o -> o.onLowBalance(accountNumber, balance, getLowBalanceThreshold()));
    }

    // ── Template Method: deposit (same for all accounts) ───────
    public final void deposit(double amount) {
        validateAmount(amount);
        balance += amount;
        Transaction txn = new Transaction(
                "TXN-" + (txnCounter++), TransactionType.DEPOSIT,
                amount, balance, "Customer deposit", LocalDateTime.now());
        history.add(txn);
        notify(txn);
    }

    // ── Template Method: withdraw (steps vary by account type) ─
    public final void withdraw(double amount) {
        validateAmount(amount);
        if (!canWithdraw(amount))
            throw new IllegalStateException(getWithdrawalRejectionReason(amount));

        balance -= amount;
        Transaction txn = new Transaction(
                "TXN-" + (txnCounter++), TransactionType.WITHDRAWAL,
                amount, balance, getWithdrawalDescription(), LocalDateTime.now());
        history.add(txn);
        notify(txn);
        onAfterWithdrawal(amount);
    }

    // ── Abstract methods — subclasses define specifics ──────────
    protected abstract boolean canWithdraw(double amount);
    protected abstract String  getWithdrawalRejectionReason(double amount);
    protected abstract double  getLowBalanceThreshold();
    public    abstract String  getAccountType();
    public    abstract double  applyMonthlyInterest();

    // ── Hook — subclasses may override ─────────────────────────
    protected String getWithdrawalDescription() { return "Cash withdrawal"; }
    protected void   onAfterWithdrawal(double amount) { }

    // ── Transfer ────────────────────────────────────────────────
    public final void transferTo(BankAccount target, double amount) {
        validateAmount(amount);
        if (!canWithdraw(amount))
            throw new IllegalStateException("Insufficient funds for transfer");

        balance -= amount;
        Transaction out = new Transaction("TXN-" + (txnCounter++), TransactionType.TRANSFER_OUT,
                amount, balance, "Transfer to " + target.accountNumber, LocalDateTime.now());
        history.add(out);
        notify(out);

        target.balance += amount;
        Transaction in = new Transaction("TXN-" + (txnCounter++), TransactionType.TRANSFER_IN,
                amount, target.balance, "Transfer from " + accountNumber, LocalDateTime.now());
        target.history.add(in);
        target.notify(in);
    }

    // ── Utility ─────────────────────────────────────────────────
    private void validateAmount(double amount) {
        if (amount <= 0) throw new IllegalArgumentException("Amount must be positive");
    }

    public void printStatement() {
        System.out.println("═".repeat(75));
        System.out.printf("  Account: %-12s  Type: %-15s  Balance: ₹%.2f%n",
                accountNumber, getAccountType(), balance);
        System.out.println("─".repeat(75));
        history.forEach(System.out::println);
        System.out.println("═".repeat(75));
    }

    // Getters
    public String getAccountNumber() { return accountNumber; }
    public String getCustomerId()    { return customerId; }
    public double getBalance()       { return balance; }
    public List<Transaction> getHistory() { return Collections.unmodifiableList(history); }

    @Override
    public String toString() {
        return String.format("%s[%s, balance=₹%.2f]", getAccountType(), accountNumber, balance);
    }
}
```

---

### 5. Concrete Account Types

```java
package banking;

// ── Savings Account ──────────────────────────────────────────────
public class SavingsAccount extends BankAccount {
    private static final double MIN_BALANCE = 1000.0;
    private final InterestStrategy interestStrategy;

    public SavingsAccount(String accNum, String custId, double balance) {
        super(accNum, custId, balance);
        this.interestStrategy = InterestStrategy.simple(0.04); // 4% p.a.
    }

    @Override protected boolean canWithdraw(double amount) {
        return (balance - amount) >= MIN_BALANCE;
    }

    @Override protected String getWithdrawalRejectionReason(double amount) {
        return String.format("Minimum balance ₹%.2f required. Available: ₹%.2f",
                MIN_BALANCE, balance - MIN_BALANCE);
    }

    @Override protected double getLowBalanceThreshold() { return MIN_BALANCE * 1.5; }
    @Override public    String getAccountType()         { return "SAVINGS"; }

    @Override
    public double applyMonthlyInterest() {
        double interest = interestStrategy.calculate(balance, 1);
        if (interest > 0) {
            balance += interest;
            System.out.printf("  Interest credited: ₹%.2f%n", interest);
        }
        return interest;
    }
}

// ── Current Account (with overdraft) ─────────────────────────────
public class CurrentAccount extends BankAccount {
    private final double overdraftLimit;

    public CurrentAccount(String accNum, String custId, double balance, double overdraft) {
        super(accNum, custId, balance);
        this.overdraftLimit = overdraft;
    }

    @Override protected boolean canWithdraw(double amount) {
        return (balance - amount) >= -overdraftLimit;
    }

    @Override protected String getWithdrawalRejectionReason(double amount) {
        return String.format("Exceeds overdraft limit of ₹%.2f", overdraftLimit);
    }

    @Override protected double getLowBalanceThreshold() { return 500.0; }
    @Override public    String getAccountType()         { return "CURRENT"; }

    @Override
    protected void onAfterWithdrawal(double amount) {
        if (balance < 0)
            System.out.printf("  ⚠ Overdraft in use: ₹%.2f of ₹%.2f limit%n",
                    Math.abs(balance), overdraftLimit);
    }

    @Override
    public double applyMonthlyInterest() { return 0; }  // No interest on current
}

// ── Fixed Deposit ─────────────────────────────────────────────────
public class FixedDeposit extends BankAccount {
    private final double    principal;
    private final int       termMonths;
    private final java.time.LocalDate maturityDate;
    private final InterestStrategy interestStrategy;

    public FixedDeposit(String accNum, String custId, double amount, int termMonths) {
        super(accNum, custId, amount);
        this.principal        = amount;
        this.termMonths       = termMonths;
        this.maturityDate     = java.time.LocalDate.now().plusMonths(termMonths);
        this.interestStrategy = InterestStrategy.compound(0.07); // 7% compound
    }

    @Override
    protected boolean canWithdraw(double amount) {
        return java.time.LocalDate.now().isAfter(maturityDate);
    }

    @Override
    protected String getWithdrawalRejectionReason(double amount) {
        return "FD matures on " + maturityDate + ". Premature withdrawal not allowed.";
    }

    @Override protected double getLowBalanceThreshold() { return 0; }
    @Override public    String getAccountType()         { return "FIXED_DEPOSIT"; }

    @Override
    public double applyMonthlyInterest() {
        double interest = interestStrategy.calculate(principal, 1);
        balance += interest;
        return interest;
    }

    public java.time.LocalDate getMaturityDate() { return maturityDate; }
    public double getMaturityAmount() {
        return principal + interestStrategy.calculate(principal, termMonths);
    }
}
```

---

### 6. `Customer.java` — Builder Pattern + Generics

```java
package banking;

import java.util.*;

public class Customer {
    private final String customerId;
    private final String name;
    private final String email;
    private final String phone;
    private final List<BankAccount> accounts;

    private Customer(Builder b) {
        this.customerId = b.customerId;
        this.name       = b.name;
        this.email      = b.email;
        this.phone      = b.phone;
        this.accounts   = new ArrayList<>();
    }

    public void addAccount(BankAccount account) { accounts.add(account); }

    public <T extends BankAccount> Optional<T> getAccountOfType(Class<T> type) {
        return accounts.stream()
                .filter(type::isInstance)
                .map(type::cast)
                .findFirst();
    }

    public List<BankAccount> getAccounts() { return Collections.unmodifiableList(accounts); }

    public double getTotalBalance() {
        return accounts.stream().mapToDouble(BankAccount::getBalance).sum();
    }

    public void printSummary() {
        System.out.println("\n👤 Customer: " + name + " [" + customerId + "]");
        System.out.println("   Email: " + email + " | Phone: " + phone);
        System.out.println("   Accounts:");
        accounts.forEach(a -> System.out.printf("     %-15s %-12s ₹%,.2f%n",
                a.getAccountType(), a.getAccountNumber(), a.getBalance()));
        System.out.printf("   ─────────────────────────────────────%n");
        System.out.printf("   Total Balance: ₹%,.2f%n", getTotalBalance());
    }

    public String getCustomerId() { return customerId; }
    public String getName()       { return name; }
    public String getEmail()      { return email; }

    // ── Builder ───────────────────────────────────────────────
    public static class Builder {
        private final String customerId;
        private String name;
        private String email  = "";
        private String phone  = "";

        public Builder(String customerId) { this.customerId = customerId; }

        public Builder name(String name)   { this.name  = name;  return this; }
        public Builder email(String email) { this.email = email; return this; }
        public Builder phone(String phone) { this.phone = phone; return this; }

        public Customer build() {
            if (name == null || name.isBlank())
                throw new IllegalStateException("Customer name is required");
            return new Customer(this);
        }
    }
}
```

---

### 7. `Bank.java` — Facade + Singleton-style

```java
package banking;

import java.util.*;

public class Bank {
    private final String name;
    private final Map<String, Customer>    customers = new LinkedHashMap<>();
    private final Map<String, BankAccount> accounts  = new LinkedHashMap<>();
    private int customerCounter = 1000;
    private int accountCounter  = 100000;

    public Bank(String name) { this.name = name; }

    // ── Customer management ───────────────────────────────────
    public Customer createCustomer(String name, String email, String phone) {
        String id = "CUST-" + (customerCounter++);
        Customer customer = new Customer.Builder(id)
                .name(name).email(email).phone(phone)
                .build();
        customers.put(id, customer);
        System.out.println("✓ Customer created: " + name + " [" + id + "]");
        return customer;
    }

    // ── Account opening ───────────────────────────────────────
    public SavingsAccount openSavings(Customer customer, double initialDeposit) {
        String accNum = "SAV-" + (accountCounter++);
        SavingsAccount acc = new SavingsAccount(accNum, customer.getCustomerId(), initialDeposit);
        acc.addObserver(new ConsolePrinter());
        customer.addAccount(acc);
        accounts.put(accNum, acc);
        System.out.println("✓ Savings account opened: " + accNum);
        return acc;
    }

    public CurrentAccount openCurrent(Customer customer, double initialDeposit, double overdraft) {
        String accNum = "CUR-" + (accountCounter++);
        CurrentAccount acc = new CurrentAccount(accNum, customer.getCustomerId(),
                initialDeposit, overdraft);
        acc.addObserver(new ConsolePrinter());
        customer.addAccount(acc);
        accounts.put(accNum, acc);
        System.out.println("✓ Current account opened: " + accNum);
        return acc;
    }

    public FixedDeposit openFD(Customer customer, double amount, int months) {
        String accNum = "FD-" + (accountCounter++);
        FixedDeposit fd = new FixedDeposit(accNum, customer.getCustomerId(), amount, months);
        customer.addAccount(fd);
        accounts.put(accNum, fd);
        System.out.printf("✓ FD opened: %s | ₹%.2f for %d months | Matures: %s%n",
                accNum, amount, months, fd.getMaturityDate());
        return fd;
    }

    // ── Monthly processing ────────────────────────────────────
    public void processMonthEnd() {
        System.out.println("\n📅 Month-End Processing...");
        accounts.values().forEach(BankAccount::applyMonthlyInterest);
    }

    // ── Reports ───────────────────────────────────────────────
    public void printBankSummary() {
        System.out.println("\n" + "═".repeat(60));
        System.out.println("  🏦 " + name + " — Bank Summary");
        System.out.println("═".repeat(60));
        System.out.println("  Customers: " + customers.size());
        System.out.println("  Accounts:  " + accounts.size());
        double totalDeposits = accounts.values().stream()
                .mapToDouble(BankAccount::getBalance).sum();
        System.out.printf("  Total Deposits: ₹%,.2f%n", totalDeposits);
        System.out.println("═".repeat(60));
        customers.values().forEach(Customer::printSummary);
    }
}
```

---

### 8. `Main.java` — Running it all

```java
package banking;

public class Main {
    public static void main(String[] args) {
        Bank bank = new Bank("Java National Bank");

        // Create customers (Builder pattern)
        Customer alice = bank.createCustomer("Alice Sharma", "alice@email.com", "+91-9876543210");
        Customer bob   = bank.createCustomer("Bob Kumar", "bob@email.com", "+91-9876500000");

        // Open accounts
        SavingsAccount aliceSavings = bank.openSavings(alice, 10000);
        CurrentAccount aliceCurrent = bank.openCurrent(alice, 5000, 10000);
        FixedDeposit   aliceFD      = bank.openFD(alice, 50000, 12);
        SavingsAccount bobSavings   = bank.openSavings(bob, 3000);

        System.out.println("\n── Transactions ──────────────────────────────────────");

        // Deposits and withdrawals
        aliceSavings.deposit(5000);
        aliceSavings.withdraw(2000);
        aliceCurrent.deposit(15000);
        aliceCurrent.withdraw(18000);  // uses overdraft

        // Transfer
        System.out.println("\n── Transfer ──────────────────────────────────────────");
        aliceSavings.transferTo(bobSavings, 3000);

        // Try invalid withdrawal from FD
        System.out.println("\n── FD Withdrawal Attempt ─────────────────────────────");
        try {
            aliceFD.withdraw(1000);
        } catch (IllegalStateException e) {
            System.out.println("  ✗ " + e.getMessage());
        }

        // Month-end interest
        bank.processMonthEnd();

        // Statements
        System.out.println("\n── Alice's Savings Statement ─────────────────────────");
        aliceSavings.printStatement();

        // Full bank summary
        bank.printBankSummary();

        // Generics — find account by type
        alice.getAccountOfType(FixedDeposit.class).ifPresent(fd ->
            System.out.printf("%nAlice's FD matures on %s for ₹%,.2f%n",
                    fd.getMaturityDate(), fd.getMaturityAmount())
        );
    }
}
```

---

## 🗺️ OOP Concepts Used — Quick Reference

| Concept | Where Used |
|---------|-----------|
| **Abstract Class** | `BankAccount` — defines template |
| **Template Method** | `withdraw()`, `deposit()` in `BankAccount` |
| **Inheritance** | `SavingsAccount`, `CurrentAccount`, `FixedDeposit extends BankAccount` |
| **Polymorphism** | `applyMonthlyInterest()`, `canWithdraw()` dispatched at runtime |
| **Encapsulation** | `private balance` + controlled access via methods |
| **Interface** | `AccountObserver`, `InterestStrategy` |
| **Functional Interface** | `InterestStrategy` — used with lambdas |
| **Records** | `Transaction` — immutable log entry |
| **Enums** | `TransactionType` — with fields and methods |
| **Generics** | `getAccountOfType(Class<T>)`, `List<T>` throughout |
| **Builder Pattern** | `HttpRequest.Builder`, `Customer.Builder` |
| **Observer Pattern** | `AccountObserver`, `ConsolePrinter`, `AuditLogger` |
| **Strategy Pattern** | `InterestStrategy` — simple vs compound |
| **Facade Pattern** | `Bank` — unified API over account complexity |
| **SRP** | Each class has one job |
| **OCP** | Add account types without touching `Bank` |
| **DIP** | `BankAccount` depends on `InterestStrategy` interface |

---

*← [09 — SOLID Principles](09-solid-principles.md) | [← Back to README](../README.md)*
