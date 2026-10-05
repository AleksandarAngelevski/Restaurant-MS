-- Application support objects. The graded vw_* views are left untouched; the
-- web app reads these api_* views, which carry the ids the UI needs.

CREATE VIEW api_tables AS
SELECT rt.TableNumber AS table_number,
       rt.Capacity AS capacity,
       rt.Status AS available,
       rt.TableTypeId AS table_type_id,
       tt.Type AS table_type,
       (SELECT o.Id
        FROM "Order" o
        JOIN OrderStatus os ON os.Id = o.StatusId
        WHERE o.TableNumber = rt.TableNumber
          AND os.Status NOT IN ('Completed', 'Cancelled')
        ORDER BY o.Id DESC
        LIMIT 1) AS open_order_id
FROM RestaurantTable rt
JOIN TableType tt ON tt.Id = rt.TableTypeId;

CREATE VIEW api_orders AS
SELECT o.Id AS order_id,
       o.WaiterId AS waiter_id,
       e.FirstName || ' ' || e.LastName AS waiter,
       o.TableNumber AS table_number,
       o.TypeId AS type_id,
       ot.Type AS order_type,
       o.StatusId AS status_id,
       os.Status AS status,
       os.Status NOT IN ('Completed', 'Cancelled') AS open,
       o.DateCreated AS date_created,
       o.DateFinished AS date_finished
FROM "Order" o
LEFT JOIN Employee e ON e.Id = o.WaiterId
JOIN OrderType ot ON ot.Id = o.TypeId
JOIN OrderStatus os ON os.Id = o.StatusId;

CREATE VIEW api_order_items AS
SELECT oi.Id AS id,
       oi.OrderId AS order_id,
       oi.MenuMemberId AS menu_member_id,
       oi.MenuItemId AS menu_item_id,
       p.Name AS product,
       oi.Quantity AS quantity,
       mm.Price AS unit_price,
       fn_discounted_price(mm.Id, mm.MenuItemId) AS discounted_price,
       oi.Finished AS finished,
       oi.CreatedBy AS prepared_by_id,
       e.FirstName || ' ' || e.LastName AS prepared_by
FROM OrderItem oi
JOIN MenuMember mm ON mm.Id = oi.MenuMemberId AND mm.MenuItemId = oi.MenuItemId
JOIN Product p ON p.Id = oi.MenuItemId
LEFT JOIN Employee e ON e.Id = oi.CreatedBy;

CREATE VIEW api_kitchen_queue AS
SELECT oi.Id AS item_id,
       o.Id AS order_id,
       o.TableNumber AS table_number,
       ot.Type AS order_type,
       o.DateCreated AS date_created,
       w.FirstName || ' ' || w.LastName AS waiter,
       p.Name AS product,
       oi.Quantity AS quantity
FROM OrderItem oi
JOIN "Order" o ON o.Id = oi.OrderId
JOIN OrderStatus os ON os.Id = o.StatusId
JOIN OrderType ot ON ot.Id = o.TypeId
JOIN Product p ON p.Id = oi.MenuItemId
LEFT JOIN Employee w ON w.Id = o.WaiterId
WHERE oi.Finished = FALSE
  AND os.Status NOT IN ('Completed', 'Cancelled');

CREATE VIEW api_menu_members AS
SELECT m.Id AS menu_id,
       m.Name AS menu,
       mt.Type AS menu_type,
       m.Active AS active,
       mm.Id AS menu_member_id,
       mm.MenuItemId AS menu_item_id,
       p.Name AS product,
       p.Url AS url,
       mm.Price AS price,
       fn_discounted_price(mm.Id, mm.MenuItemId) AS discounted_price,
       mm.TypeId AS member_type_id,
       mmt.Type AS member_type
FROM Menu m
JOIN MenuType mt ON mt.Id = m.TypeId
JOIN MenuMember mm ON mm.MenuId = m.Id
JOIN Product p ON p.Id = mm.MenuItemId
JOIN MenuMemberType mmt ON mmt.Id = mm.TypeId;

CREATE VIEW api_products AS
SELECT p.Id AS id,
       p.Name AS name,
       p.Url AS url,
       p.TypeId AS type_id,
       pt.Type AS type,
       p.BaseUnitId AS base_unit_id,
       u.Name AS base_unit,
       EXISTS (SELECT 1 FROM MenuItem mi WHERE mi.Id = p.Id) AS menu_item,
       (SELECT COUNT(*) FROM ConsistsOf c WHERE c.Parent = p.Id)::INT4 AS recipe_size
FROM Product p
JOIN ProductType pt ON pt.Id = p.TypeId
JOIN Unit u ON u.Id = p.BaseUnitId;

CREATE VIEW api_recipes AS
SELECT c.Parent AS parent_id,
       c.Component AS component_id,
       p.Name AS component,
       c.Amount AS amount,
       c.UnitId AS unit_id,
       u.Name AS unit
FROM ConsistsOf c
JOIN Product p ON p.Id = c.Component
JOIN Unit u ON u.Id = c.UnitId;

CREATE VIEW api_inventory AS
SELECT p.Id AS product_id,
       p.Name AS product,
       pt.Type AS product_type,
       COALESCE(sp.Quantity, 0) AS quantity,
       u.Name AS base_unit,
       sp.Id IS NOT NULL AS stocked
FROM Product p
JOIN ProductType pt ON pt.Id = p.TypeId
JOIN Unit u ON u.Id = p.BaseUnitId
LEFT JOIN StoredProduct sp ON sp.ProductId = p.Id;

CREATE VIEW api_stock_history AS
SELECT pul.Id AS log_id,
       pul.ProductId AS product_id,
       p.Name AS product,
       pul.ChangeAmount AS change_amount,
       pul.ChangeTypeId AS change_type_id,
       ct.Type AS change_type,
       ct.Sign AS positive,
       pul.Timestamp AS logged_at,
       u.Name AS unit
FROM ProductUsageLog pul
JOIN Product p ON p.Id = pul.ProductId
JOIN ChangeType ct ON ct.Id = pul.ChangeTypeId
JOIN Unit u ON u.Id = pul.BaseUnitId;

CREATE VIEW api_reservations AS
SELECT r.Id AS id,
       r.GuestName AS guest_name,
       r.GuestPhone AS guest_phone,
       r."Date" AS reservation_date,
       r.StartTime AS start_time,
       r.EndTime AS end_time,
       r.TableNumber AS table_number,
       rt.Capacity AS capacity,
       r.EmployeeId AS employee_id,
       e.FirstName || ' ' || e.LastName AS handled_by,
       r.CreatedAt AS created_at
FROM Reservation r
LEFT JOIN RestaurantTable rt ON rt.TableNumber = r.TableNumber
LEFT JOIN Employee e ON e.Id = r.EmployeeId;

CREATE VIEW api_employees AS
SELECT e.Id AS id,
       e.FirstName AS first_name,
       e.LastName AS last_name,
       e.SSN AS ssn,
       e.Sex AS sex,
       e.Email AS email,
       e.DateEmployment AS date_employment,
       e.DateResignation AS date_resignation,
       (e.DateResignation IS NULL OR e.DateResignation > CURRENT_DATE) AS active,
       COALESCE((SELECT string_agg(et.Type, ', ' ORDER BY et.Id)
                 FROM EmployeeRole er
                 JOIN EmployeeType et ON et.Id = er.EmployeeTypeid
                 WHERE er.EmployeeId = e.Id), '') AS roles,
       COALESCE((SELECT string_agg(er.EmployeeTypeid::TEXT, ',' ORDER BY er.EmployeeTypeid)
                 FROM EmployeeRole er
                 WHERE er.EmployeeId = e.Id), '') AS role_ids
FROM Employee e;

CREATE VIEW api_discounts AS
SELECT d.Id AS id,
       d.Name AS name,
       d."From" AS from_date,
       d."To" AS to_date,
       d.MenuId AS menu_id,
       m.Name AS menu,
       d.Status AS status,
       (d.Status AND CURRENT_DATE BETWEEN d."From" AND d."To") AS running,
       (SELECT COUNT(*) FROM DiscountItem di WHERE di.DiscountId = d.Id)::INT4 AS items
FROM Discount d
JOIN Menu m ON m.Id = d.MenuId;

CREATE VIEW api_discount_items AS
SELECT di.Id AS id,
       di.DiscountId AS discount_id,
       p.Name AS product,
       mm.Price AS price,
       di.NewPrice AS new_price
FROM DiscountItem di
JOIN MenuMember mm ON mm.Id = di.MenuMemberId AND mm.MenuItemId = di.MenuMemberMenuItemId
JOIN Product p ON p.Id = mm.MenuItemId;

CREATE VIEW api_invoice_items AS
SELECT ii.Id AS id,
       ii.InvoiceId AS invoice_id,
       p.Name AS product,
       ii.Quantity AS quantity,
       ii.OriginalPrice AS original_price,
       ii.DiscountedPrice AS discounted_price,
       ii.Quantity * COALESCE(ii.DiscountedPrice, ii.OriginalPrice) AS line_total
FROM InvoiceItem ii
JOIN OrderItem oi ON oi.Id = ii.OrderItemId
JOIN Product p ON p.Id = oi.MenuItemId;

-- Keeps the order status in step with the kitchen: unfinished items mean
-- 'In Progress', everything finished means 'Ready'.
CREATE FUNCTION fn_sync_order_status()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_status VARCHAR(20);
    v_target VARCHAR(20);
BEGIN
    SELECT os.Status INTO v_status
    FROM "Order" o
    JOIN OrderStatus os ON os.Id = o.StatusId
    WHERE o.Id = NEW.OrderId;

    IF EXISTS (SELECT 1 FROM OrderItem oi WHERE oi.OrderId = NEW.OrderId AND oi.Finished = FALSE) THEN
        IF v_status IN ('Pending', 'Ready', 'Served') THEN
            v_target := 'In Progress';
        END IF;
    ELSIF v_status IN ('Pending', 'In Progress') THEN
        v_target := 'Ready';
    END IF;

    IF v_target IS NOT NULL THEN
        UPDATE "Order"
        SET StatusId = (SELECT os.Id FROM OrderStatus os WHERE os.Status = v_target)
        WHERE Id = NEW.OrderId
          AND EXISTS (SELECT 1 FROM OrderStatus os WHERE os.Status = v_target);
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_order_status
AFTER INSERT OR UPDATE OF Finished ON OrderItem
FOR EACH ROW EXECUTE FUNCTION fn_sync_order_status();

-- Waiter confirms that a ready order reached the guests.
CREATE PROCEDURE sp_mark_order_served(p_order_id INT4)
LANGUAGE plpgsql AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT os.Status INTO v_status
    FROM "Order" o
    JOIN OrderStatus os ON os.Id = o.StatusId
    WHERE o.Id = p_order_id
    FOR UPDATE OF o;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % does not exist', p_order_id;
    END IF;

    IF v_status <> 'Ready' THEN
        RAISE EXCEPTION 'Order % is % and cannot be marked as served', p_order_id, v_status;
    END IF;

    UPDATE "Order"
    SET StatusId = (SELECT os.Id FROM OrderStatus os WHERE os.Status = 'Served')
    WHERE Id = p_order_id;
END;
$$;

-- Manual stock correction to an absolute quantity (stock count, spoilage...).
-- Logged with the 'Manual Adjustment Up/Down' change types.
CREATE PROCEDURE sp_adjust_stock(p_product_id INT4, p_new_quantity INT4)
LANGUAGE plpgsql AS $$
DECLARE
    v_stock_id INT4;
    v_current INT4;
BEGIN
    IF p_new_quantity IS NULL OR p_new_quantity < 0 THEN
        RAISE EXCEPTION 'Stock quantity cannot be negative';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM Product p WHERE p.Id = p_product_id) THEN
        RAISE EXCEPTION 'Product % does not exist', p_product_id;
    END IF;

    SELECT sp.Id, sp.Quantity INTO v_stock_id, v_current
    FROM StoredProduct sp
    WHERE sp.ProductId = p_product_id
    FOR UPDATE;

    PERFORM set_config('rms.change_type',
        CASE WHEN p_new_quantity >= COALESCE(v_current, 0)
             THEN 'Manual Adjustment Up' ELSE 'Manual Adjustment Down' END,
        TRUE);

    IF v_stock_id IS NULL THEN
        INSERT INTO StoredProduct (Quantity, ProductId) VALUES (p_new_quantity, p_product_id);
    ELSE
        UPDATE StoredProduct SET Quantity = p_new_quantity WHERE Id = v_stock_id;
    END IF;

    PERFORM set_config('rms.change_type', '', TRUE);
END;
$$;
