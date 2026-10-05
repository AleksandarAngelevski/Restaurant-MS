CREATE VIEW vw_order_overview AS
SELECT o.Id AS OrderId, e.FirstName || ' ' || e.LastName AS Waiter,
       rt.TableNumber, rt.Capacity, ot.Type AS OrderType, os.Status AS OrderStatus,
       o.DateCreated, o.DateFinished
FROM "Order" o
LEFT JOIN Employee e ON o.WaiterId = e.Id
LEFT JOIN RestaurantTable rt ON o.TableNumber = rt.TableNumber
JOIN OrderType ot ON o.TypeId = ot.Id
JOIN OrderStatus os ON o.StatusId = os.Id;

CREATE VIEW vw_order_items_detail AS
SELECT oi.OrderId, p.Name AS Product, oi.Quantity, mm.Price AS UnitPrice,
       oi.Quantity * mm.Price AS TotalPrice, oi.Finished,
       e.FirstName || ' ' || e.LastName AS PreparedBy
FROM OrderItem oi
JOIN MenuMember mm ON oi.MenuMemberId = mm.Id AND oi.MenuItemId = mm.MenuItemId
JOIN MenuItem mi ON mm.MenuItemId = mi.Id
JOIN Product p ON mi.Id = p.Id
LEFT JOIN Employee e ON oi.CreatedBy = e.Id;

CREATE VIEW vw_invoice_summary AS
SELECT i.Id AS InvoiceId, o.Id AS OrderId, e.FirstName || ' ' || e.LastName AS Waiter,
       i.InvoiceDate, i.TotalAmount, i.TaxAmount, i.TotalAmount - i.TaxAmount AS NetAmount
FROM Invoice i
JOIN "Order" o ON i.OrderId = o.Id
LEFT JOIN Employee e ON o.WaiterId = e.Id;

CREATE VIEW vw_active_menu AS
SELECT m.Name AS Menu, mt.Type AS MenuType, p.Name AS Product, mm.Price, mmt.Type AS MemberType
FROM Menu m
JOIN MenuType mt ON m.TypeId = mt.Id
JOIN MenuMember mm ON mm.MenuId = m.Id
JOIN MenuItem mi ON mm.MenuItemId = mi.Id
JOIN Product p ON mi.Id = p.Id
JOIN MenuMemberType mmt ON mm.TypeId = mmt.Id
WHERE m.Active = TRUE;

CREATE VIEW vw_table_availability AS
SELECT rt.TableNumber, rt.Capacity, tt.Type AS TableType, rt.Status AS Available
FROM RestaurantTable rt JOIN TableType tt ON rt.TableTypeId = tt.Id;

CREATE VIEW vw_inventory AS
SELECT p.Name AS Product, pt.Type AS ProductType, sp.Quantity, u.Name AS BaseUnit
FROM StoredProduct sp
JOIN Product p ON sp.ProductId = p.Id
JOIN ProductType pt ON p.TypeId = pt.Id
JOIN Unit u ON p.BaseUnitId = u.Id;

CREATE VIEW vw_todays_reservations AS
SELECT r.Id AS ReservationId, r.GuestName, r.GuestPhone, r.StartTime, r.EndTime,
       rt.TableNumber, rt.Capacity, e.FirstName || ' ' || e.LastName AS HandledBy
FROM Reservation r
LEFT JOIN RestaurantTable rt ON rt.TableNumber = r.TableNumber
LEFT JOIN Employee e ON e.Id = r.EmployeeId
WHERE r."Date" = CURRENT_DATE
ORDER BY r.StartTime;

CREATE VIEW vw_revenue_per_waiter AS
SELECT e.FirstName || ' ' || e.LastName AS Waiter, COUNT(DISTINCT o.Id) AS TotalOrders,
       SUM(i.TotalAmount) AS TotalRevenue, AVG(i.TotalAmount) AS AvgOrderValue
FROM "Order" o
JOIN Employee e ON o.WaiterId = e.Id
JOIN Invoice i ON i.OrderId = o.Id
GROUP BY e.Id, e.FirstName, e.LastName;

CREATE VIEW vw_product_usage_history AS
SELECT pul.Id AS LogId, p.Name AS ProductName, pul.ChangeAmount, ct.Type AS ChangeType,
       ct.Sign AS IsPositive, pul.Timestamp, u.Name AS UnitName
FROM ProductUsageLog pul
JOIN Product p ON pul.ProductId = p.Id
JOIN ChangeType ct ON pul.ChangeTypeId = ct.Id
JOIN Unit u ON pul.BaseUnitId = u.Id;

CREATE VIEW vw_active_staff AS
SELECT e.Id, e.FirstName || ' ' || e.LastName AS FullName, et.Type AS Role,
       et.Permissions, e.Email, e.DateEmployment
FROM Employee e
JOIN EmployeeRole er ON er.EmployeeId = e.Id
JOIN EmployeeType et ON et.Id = er.EmployeeTypeid
WHERE e.DateResignation IS NULL;
