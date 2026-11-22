/* =========================================================
   SQL DATA ANALYST INTERVIEW PRACTICE FILE
   (WITH DETAILED LAYMAN EXPLANATIONS)
   ========================================================= */


/* =========================================================
   TABLE CREATION
   =========================================================
   We create four tables to simulate a small e-commerce system.

   customers    → who the users are
   orders       → what they purchased and how much they paid
   products     → list of products with category and price
   order_items  → which products belong to which order
*/

CREATE TABLE customers (
    customer_id INT PRIMARY KEY,
    customer_name VARCHAR(50),
    city VARCHAR(50),
    signup_date DATE
);

CREATE TABLE orders (
    order_id INT PRIMARY KEY,
    customer_id INT,
    order_date DATE,
    amount DECIMAL(10,2),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE TABLE products (
    product_id INT PRIMARY KEY,
    product_name VARCHAR(50),
    category VARCHAR(50),
    price DECIMAL(10,2)
);

CREATE TABLE order_items (
    order_id INT,
    product_id INT,
    quantity INT,
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id)
);


/* =========================================================
   INSERT DATA (FROM CSV FILES)
   =========================================================
   We insert sample data so that queries can be tested.
   This mimics loading CSV data into database tables.
*/

INSERT INTO customers VALUES
(1,'Alice','New York','2022-01-10'),
(2,'Bob','Los Angeles','2022-02-15'),
(3,'Charlie','New York','2022-03-12'),
(4,'David','Chicago','2022-01-20'),
(5,'Eva','Los Angeles','2022-04-01');

INSERT INTO orders VALUES
(101,1,'2022-02-01',120),
(102,2,'2022-02-05',80),
(103,1,'2022-03-01',150),
(104,3,'2022-03-15',200),
(105,2,'2022-04-01',50),
(106,3,'2022-04-10',300);

INSERT INTO products VALUES
(1,'Laptop','Electronics',800),
(2,'Phone','Electronics',500),
(3,'Tablet','Electronics',300),
(4,'Desk','Furniture',200),
(5,'Chair','Furniture',100);

INSERT INTO order_items VALUES
(101,1,1),
(101,2,1),
(102,2,1),
(103,1,1),
(104,3,2),
(105,4,1),
(106,1,2);


/* =========================================================
   BASIC & INTERMEDIATE SQL QUESTIONS (1–12)
   ========================================================= */

-- Q1. Count total customers
-- Layman Explanation:
-- This question simply asks: "How many customers do we have?"
-- COUNT(*) counts every row in the customers table.
-- Each row represents one customer.
SELECT COUNT(*) AS total_customers
FROM customers;


-- Q2. Find customers from New York
-- Layman Explanation:
-- We only want customers who live in New York.
-- WHERE is used to filter rows based on a condition.
SELECT *
FROM customers
WHERE city = 'New York';


-- Q3. Total orders per customer
-- Layman Explanation:
-- Each order belongs to one customer.
-- We group orders by customer_id
-- and count how many orders each customer placed.
SELECT customer_id, COUNT(*) AS total_orders
FROM orders
GROUP BY customer_id;


-- Q4. Total revenue
-- Layman Explanation:
-- Revenue means total money earned.
-- SUM(amount) adds all order values together.
SELECT SUM(amount) AS total_revenue
FROM orders;


-- Q5. Average order value
-- Layman Explanation:
-- This tells us the average amount per order.
-- AVG automatically divides total sum by number of orders.
SELECT AVG(amount) AS avg_order_value
FROM orders;


-- Q6. Customers who signed up in 2022
-- Layman Explanation:
-- We check the signup_date column
-- and keep only customers whose signup date falls in 2022.
SELECT *
FROM customers
WHERE signup_date BETWEEN '2022-01-01' AND '2022-12-31';


-- Q7. Customers with more than one order
-- Layman Explanation:
-- First, orders are grouped by customer.
-- COUNT(*) gives total orders per customer.
-- HAVING filters groups, not individual rows.
SELECT customer_id
FROM orders
GROUP BY customer_id
HAVING COUNT(*) > 1;


-- Q8. Customer name with total spending
-- Layman Explanation:
-- Orders only have customer_id, not name.
-- So we join customers and orders.
-- Then we add up the order amounts for each customer.
SELECT c.customer_name, SUM(o.amount) AS total_spent
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
GROUP BY c.customer_name;


-- Q9. Customers with no orders
-- Layman Explanation:
-- LEFT JOIN keeps all customers.
-- If a customer has no order, order_id becomes NULL.
-- We filter those NULL values.
SELECT c.customer_name
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id
WHERE o.order_id IS NULL;


-- Q10. Orders placed in March 2022
-- Layman Explanation:
-- We filter orders where the order date falls in March 2022.
SELECT *
FROM orders
WHERE order_date BETWEEN '2022-03-01' AND '2022-03-31';


-- Q11. Highest order amount
-- Layman Explanation:
-- MAX returns the largest value from a column.
-- This finds the biggest order amount.
SELECT MAX(amount) AS highest_order
FROM orders;


-- Q12. Total quantity sold per product
-- Layman Explanation:
-- order_items tells how many units were sold.
-- We group by product and sum the quantities.
SELECT product_id, SUM(quantity) AS total_quantity
FROM order_items
GROUP BY product_id;


/* =========================================================
   ADVANCED SQL QUESTIONS (13–20)
   ========================================================= */

-- Q13. Rank customers by total spending
-- Layman Explanation:
-- First, total spending is calculated per customer.
-- Then RANK() assigns positions based on spending.
-- Highest spender gets rank 1.
SELECT
    c.customer_name,
    SUM(o.amount) AS total_spent,
    RANK() OVER (ORDER BY SUM(o.amount) DESC) AS spending_rank
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
GROUP BY c.customer_name;


-- Q14. Top 2 highest-spending customers
-- Layman Explanation:
-- We reuse the ranking logic in a subquery.
-- Then we filter only rank 1 and 2.
SELECT *
FROM (
    SELECT
        c.customer_name,
        SUM(o.amount) AS total_spent,
        RANK() OVER (ORDER BY SUM(o.amount) DESC) AS rnk
    FROM customers c
    JOIN orders o ON c.customer_id = o.customer_id
    GROUP BY c.customer_name
) ranked
WHERE rnk <= 2;


-- Q15. Running total of revenue by date
-- Layman Explanation:
-- First we calculate daily revenue.
-- Then window SUM adds revenue day by day cumulatively.
-- This helps track growth over time.
SELECT
    order_date,
    SUM(amount) AS daily_revenue,
    SUM(SUM(amount)) OVER (ORDER BY order_date) AS running_total
FROM orders
GROUP BY order_date;


-- Q16. Category-wise revenue
-- Layman Explanation:
-- Revenue depends on quantity × price.
-- We join order_items and products.
-- Then group by product category.
SELECT
    p.category,
    SUM(oi.quantity * p.price) AS revenue
FROM order_items oi
JOIN products p ON oi.product_id = p.product_id
GROUP BY p.category;


-- Q17. Most sold product (by quantity)
-- Layman Explanation:
-- We sum quantities sold per product.
-- Then sort descending.
-- LIMIT 1 returns the top product.
SELECT
    p.product_name,
    SUM(oi.quantity) AS total_sold
FROM order_items oi
JOIN products p ON oi.product_id = p.product_id
GROUP BY p.product_name
ORDER BY total_sold DESC
LIMIT 1;


-- Q18. Customers spending above average
-- Layman Explanation:
-- First calculate total spending per customer.
-- Then compare it with average order amount.
-- Customers spending more than average are returned.
SELECT customer_name
FROM (
    SELECT
        c.customer_name,
        SUM(o.amount) AS total_spent
    FROM customers c
    JOIN orders o ON c.customer_id = o.customer_id
    GROUP BY c.customer_name
) t
WHERE total_spent > (SELECT AVG(amount) FROM orders);


-- Q19. Customer spending classification
-- Layman Explanation:
-- CASE works like if–else.
-- We categorize customers into High, Medium, Low spenders.
SELECT
    c.customer_name,
    SUM(o.amount) AS total_spent,
    CASE
        WHEN SUM(o.amount) >= 300 THEN 'High'
        WHEN SUM(o.amount) >= 150 THEN 'Medium'
        ELSE 'Low'
    END AS spender_category
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
GROUP BY c.customer_name;


-- Q20. Customers who purchased Electronics
-- Layman Explanation:
-- We connect customers → orders → order_items → products.
-- DISTINCT avoids duplicate customer names.
-- Filter category as Electronics.
SELECT DISTINCT c.customer_name
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
JOIN order_items oi ON o.order_id = oi.order_id
JOIN products p ON oi.product_id = p.product_id
WHERE p.category = 'Electronics';
