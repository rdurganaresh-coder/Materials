use sample;

-- Lets Start with VIEWS 

select * from orders;
select * from products;
select * from payments;
select * from employees;


show full tables where table_type = 'VIEW';

-- Find employees who have the highest salary in their department
select * from studentMarks;


CREATE VIEW iitStudents as 
select * from demo_table where college = 'IIT'
with check option;


INSERT INTO sample.demo_table
(NAME, COLLEGE, EXAM_DATE, SUBJECTS, MARKS)
VALUES('K', 'IIT', '2005-01-01', 'MCH', 70);

-- Updatable Views 
-- Rule1 - single table;
-- Rule - 2 subquery, group by, distinct 

insert into iitStudents (NAME, COLLEGE, EXAM_DATE, SUBJECTS, MARKS)
VALUES('Loki', 'IET', '2005-01-01', 'MCH', 70);



CREATE VIEW highestSalary AS 
SELECT e1.eId, e1.email, e1.salary, e1.department
FROM employees e1
WHERE e1.salary = (
  SELECT MAX(e2.salary)
  FROM employees e2
  WHERE e2.department = e1.department
);



-- CREATE USE AND GRAND PERMISSIONS

CREATE USER 'user_db1'@'localhost' IDENTIFIED BY '12345678';

GRANT SELECT ON sample.* TO 'user_db1'@'localhost';

GRANT SELECT ON sample.order_details_view TO 'user_db1'@'localhost';

FLUSH PRIVILEGES;


