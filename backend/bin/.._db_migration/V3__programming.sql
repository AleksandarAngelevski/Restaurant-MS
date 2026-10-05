-- P4 Database Programming: triggers, functions and procedures.
-- Implemented from the build spec (db/original/FAZA4.sql was not provided).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Lowest NewPrice among active discounts running today, or NULL when the
-- menu member is not discounted.
CREATE FUNCTION fn_discounted_price(p_menu_member_id INT4, p_menu_item_id INT4)
RETURNS NUMERIC(10,2)
LANGUAGE sql STABLE AS $$
    SELECT MIN(di.NewPrice)::NUMERIC(10,2)
    FROM DiscountItem di
    JOIN Discount d ON d.Id = di.DiscountId
    WHERE di.MenuMemberId = p_menu_member_id
      AND di.MenuMemberMenuItemId = p_menu_item_id
      AND d.Status = TRUE
      AND CURRENT_DATE BETWEEN d."From" AND d."To";
$$;

-- An order is open until it is Completed or Cancelled.
CREATE FUNCTION fn_is_order_open(p_order_id INT4)
RETURNS BOOL
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM "Order" o
        JOIN OrderStatus os ON os.Id = o.StatusId
        WHERE o.Id = p_order_id
          AND os.Status NOT IN ('Completed', 'Cancelled')
    );
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- 1. Items of a Completed / Cancelled order are frozen.
CREATE FUNCTION fn_guard_closed_order()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT os.Status INTO v_status
    FROM "Order" o
    JOIN OrderStatus os ON os.Id = o.StatusId
    WHERE o.Id = NEW.OrderId;

    IF v_status IN ('Completed', 'Cancelled') THEN
        RAISE EXCEPTION 'Order % is % and its items can no longer be changed', NEW.OrderId, v_status;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_closed_order_edit
BEFORE INSERT OR UPDATE ON OrderItem
FOR EACH ROW EXECUTE FUNCTION fn_guard_closed_order();

-- 2. Finishing an item consumes its recipe from stock.
CREATE FUNCTION fn_deduct_inventory_on_finish()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    r RECORD;
    v_required INT4;
    v_stock_id INT4;
    v_available INT4;
BEGIN
    IF NOT (OLD.Finished = FALSE AND NEW.Finished = TRUE) THEN
        RETURN NEW;
    END IF;

    FOR r IN
        SELECT c.Component, p.Name, c.Amount, u.Conversion_to_base
        FROM ConsistsOf c
        JOIN Unit u ON u.Id = c.UnitId
        JOIN Product p ON p.Id = c.Component
        WHERE c.Parent = NEW.MenuItemId
    LOOP
        v_required := r.Amount * r.Conversion_to_base * NEW.Quantity;

        SELECT sp.Id, sp.Quantity INTO v_stock_id, v_available
        FROM StoredProduct sp
        WHERE sp.ProductId = r.Component
        ORDER BY sp.Id
        LIMIT 1
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE WARNING 'No stock record for %: needed %, nothing deducted', r.Name, v_required;
            CONTINUE;
        END IF;

        IF v_available < v_required THEN
            RAISE WARNING 'Insufficient stock for %: needed %, had % - stock set to 0',
                r.Name, v_required, v_available;
            v_required := v_available;
        END IF;

        UPDATE StoredProduct SET Quantity = Quantity - v_required WHERE Id = v_stock_id;
    END LOOP;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deduct_inventory_on_item_finish
AFTER UPDATE OF Finished ON OrderItem
FOR EACH ROW EXECUTE FUNCTION fn_deduct_inventory_on_finish();

-- 3. Every stock movement is logged.
-- Increases default to 'Purchase' and decreases to 'Order'. A caller can pick
-- another ChangeType for the current transaction with
--   SELECT set_config('rms.change_type', 'Manual Adjustment Down', TRUE);
CREATE FUNCTION fn_log_stock_change()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_old INT4 := 0;
    v_increase BOOL;
    v_requested TEXT := NULLIF(current_setting('rms.change_type', TRUE), '');
    v_change_type_id INT4;
    v_unit_id INT4;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        v_old := OLD.Quantity;
    END IF;

    IF NEW.Quantity = v_old THEN
        RETURN NEW;
    END IF;

    v_increase := NEW.Quantity > v_old;

    IF v_requested IS NOT NULL THEN
        SELECT ct.Id INTO v_change_type_id
        FROM ChangeType ct
        WHERE ct.Type = v_requested AND ct.Sign = v_increase;
    END IF;

    IF v_change_type_id IS NULL THEN
        SELECT ct.Id INTO v_change_type_id
        FROM ChangeType ct
        WHERE ct.Sign = v_increase
        ORDER BY (ct.Type = CASE WHEN v_increase THEN 'Purchase' ELSE 'Order' END) DESC, ct.Id
        LIMIT 1;
    END IF;

    IF v_change_type_id IS NULL THEN
        RAISE EXCEPTION 'No ChangeType defined for a stock %',
            CASE WHEN v_increase THEN 'increase' ELSE 'decrease' END;
    END IF;

    SELECT p.BaseUnitId INTO v_unit_id FROM Product p WHERE p.Id = NEW.ProductId;

    INSERT INTO ProductUsageLog (ProductId, ChangeAmount, InputAmount, ChangeTypeId, BaseUnitId, InputUnitId)
    VALUES (NEW.ProductId, abs(NEW.Quantity - v_old), abs(NEW.Quantity - v_old),
            v_change_type_id, v_unit_id, v_unit_id);

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_stock_change
AFTER UPDATE OF Quantity ON StoredProduct
FOR EACH ROW EXECUTE FUNCTION fn_log_stock_change();

CREATE TRIGGER trg_log_initial_stock
AFTER INSERT ON StoredProduct
FOR EACH ROW EXECUTE FUNCTION fn_log_stock_change();

-- Seeder README rule: resigned employees cannot create orders.
CREATE FUNCTION fn_guard_resigned_waiter()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_resigned DATE;
BEGIN
    IF NEW.WaiterId IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT e.DateResignation INTO v_resigned FROM Employee e WHERE e.Id = NEW.WaiterId;

    IF v_resigned IS NOT NULL AND v_resigned <= CURRENT_DATE THEN
        RAISE EXCEPTION 'Employee % resigned on % and cannot create orders', NEW.WaiterId, v_resigned;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_resigned_waiter_order
BEFORE INSERT ON "Order"
FOR EACH ROW EXECUTE FUNCTION fn_guard_resigned_waiter();

-- Seeder README rule: an order cannot be Completed with unfinished items.
CREATE FUNCTION fn_guard_complete_with_unfinished_items()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_status VARCHAR(20);
    v_unfinished INT4;
BEGIN
    SELECT os.Status INTO v_status FROM OrderStatus os WHERE os.Id = NEW.StatusId;

    IF v_status = 'Completed' THEN
        SELECT COUNT(*) INTO v_unfinished
        FROM OrderItem oi
        WHERE oi.OrderId = NEW.Id AND oi.Finished = FALSE;

        IF v_unfinished > 0 THEN
            RAISE EXCEPTION 'Order % cannot be completed: % item(s) are not finished', NEW.Id, v_unfinished;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_complete_with_unfinished_items
BEFORE UPDATE OF StatusId ON "Order"
FOR EACH ROW
WHEN (OLD.StatusId IS DISTINCT FROM NEW.StatusId)
EXECUTE FUNCTION fn_guard_complete_with_unfinished_items();

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- 4. Sum of quantity x effective price (discounted price if one is running).
CREATE FUNCTION fn_calculate_order_total(p_order_id INT4)
RETURNS NUMERIC(10,2)
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(SUM(oi.Quantity * COALESCE(fn_discounted_price(mm.Id, mm.MenuItemId), mm.Price)), 0)::NUMERIC(10,2)
    FROM OrderItem oi
    JOIN MenuMember mm ON mm.Id = oi.MenuMemberId AND mm.MenuItemId = oi.MenuItemId
    WHERE oi.OrderId = p_order_id;
$$;

-- 5. Tables big enough for the party with no overlapping reservation.
CREATE FUNCTION fn_get_available_tables(p_date DATE, p_start TIME, p_end TIME, p_guests INT4)
RETURNS TABLE (TableNumber INT4, Capacity INT4, TableType VARCHAR(20))
LANGUAGE sql STABLE AS $$
    SELECT rt.TableNumber, rt.Capacity, tt.Type
    FROM RestaurantTable rt
    JOIN TableType tt ON tt.Id = rt.TableTypeId
    WHERE rt.Capacity >= p_guests
      AND NOT EXISTS (
          SELECT 1
          FROM Reservation r
          WHERE r.TableNumber = rt.TableNumber
            AND r."Date" = p_date
            AND r.StartTime < p_end
            AND r.EndTime > p_start
      )
    ORDER BY rt.Capacity, rt.TableNumber;
$$;

-- 6. Products whose stock is below the threshold (in base units).
CREATE FUNCTION fn_low_stock_report(p_threshold INT4 DEFAULT 10)
RETURNS TABLE (Product VARCHAR(30), ProductType VARCHAR(30), Quantity INT4, BaseUnit VARCHAR(20))
LANGUAGE sql STABLE AS $$
    SELECT p.Name, pt.Type, sp.Quantity, u.Name
    FROM StoredProduct sp
    JOIN Product p ON p.Id = sp.ProductId
    JOIN ProductType pt ON pt.Id = p.TypeId
    JOIN Unit u ON u.Id = p.BaseUnitId
    WHERE sp.Quantity < p_threshold
    ORDER BY sp.Quantity, p.Name;
$$;

-- ---------------------------------------------------------------------------
-- Procedures
-- ---------------------------------------------------------------------------

-- 7. Add an item to an open order (merges with an identical unfinished line).
CREATE PROCEDURE sp_add_order_item(
    p_order_id INT4,
    p_menu_member_id INT4,
    p_menu_item_id INT4,
    p_quantity INT4,
    p_created_by INT4
)
LANGUAGE plpgsql AS $$
DECLARE
    v_status VARCHAR(20);
    v_existing INT4;
BEGIN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be greater than 0';
    END IF;

    SELECT os.Status INTO v_status
    FROM "Order" o
    JOIN OrderStatus os ON os.Id = o.StatusId
    WHERE o.Id = p_order_id
    FOR UPDATE OF o;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % does not exist', p_order_id;
    END IF;

    IF v_status IN ('Completed', 'Cancelled') THEN
        RAISE EXCEPTION 'Order % is % and cannot receive new items', p_order_id, v_status;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM MenuMember mm
        WHERE mm.Id = p_menu_member_id AND mm.MenuItemId = p_menu_item_id
    ) THEN
        RAISE EXCEPTION 'Menu member (%, %) does not exist', p_menu_member_id, p_menu_item_id;
    END IF;

    SELECT oi.Id INTO v_existing
    FROM OrderItem oi
    WHERE oi.OrderId = p_order_id
      AND oi.MenuMemberId = p_menu_member_id
      AND oi.MenuItemId = p_menu_item_id
      AND oi.Finished = FALSE
    ORDER BY oi.Id
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
        UPDATE OrderItem SET Quantity = Quantity + p_quantity WHERE Id = v_existing;
    ELSE
        INSERT INTO OrderItem (Quantity, OrderId, CreatedBy, Finished, MenuMemberId, MenuItemId)
        VALUES (p_quantity, p_order_id, p_created_by, FALSE, p_menu_member_id, p_menu_item_id);
    END IF;
END;
$$;

-- 8. Open a new order. The new id comes back through the INOUT parameter:
--    CALL sp_create_order(1, 1, 5, NULL);
CREATE PROCEDURE sp_create_order(
    p_waiter_id INT4,
    p_order_type_id INT4,
    p_table_number INT4,
    INOUT p_order_id INT4 DEFAULT NULL
)
LANGUAGE plpgsql AS $$
DECLARE
    v_resigned DATE;
    v_available BOOL;
    v_status_id INT4;
BEGIN
    SELECT e.DateResignation INTO v_resigned FROM Employee e WHERE e.Id = p_waiter_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Employee % does not exist', p_waiter_id;
    END IF;

    IF v_resigned IS NOT NULL AND v_resigned <= CURRENT_DATE THEN
        RAISE EXCEPTION 'Employee % resigned on % and cannot create orders', p_waiter_id, v_resigned;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM OrderType ot WHERE ot.Id = p_order_type_id) THEN
        RAISE EXCEPTION 'Order type % does not exist', p_order_type_id;
    END IF;

    IF p_table_number IS NOT NULL THEN
        SELECT rt.Status INTO v_available
        FROM RestaurantTable rt
        WHERE rt.TableNumber = p_table_number
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Table % does not exist', p_table_number;
        END IF;

        IF NOT v_available THEN
            RAISE EXCEPTION 'Table % is occupied', p_table_number;
        END IF;
    END IF;

    SELECT os.Id INTO v_status_id FROM OrderStatus os WHERE os.Status = 'Pending';

    IF v_status_id IS NULL THEN
        RAISE EXCEPTION 'Order status "Pending" is not defined';
    END IF;

    INSERT INTO "Order" (WaiterId, TypeId, StatusId, TableNumber)
    VALUES (p_waiter_id, p_order_type_id, v_status_id, p_table_number)
    RETURNING Id INTO p_order_id;

    IF p_table_number IS NOT NULL THEN
        UPDATE RestaurantTable SET Status = FALSE WHERE TableNumber = p_table_number;
    END IF;
END;
$$;

-- 9. Book a table. The no_overlap exclusion constraint is the final safety net.
CREATE PROCEDURE sp_create_reservation(
    p_guest_name VARCHAR(50),
    p_guest_phone VARCHAR(50),
    p_date DATE,
    p_start TIME,
    p_end TIME,
    p_table_number INT4,
    p_employee_id INT4
)
LANGUAGE plpgsql AS $$
BEGIN
    IF p_start >= p_end THEN
        RAISE EXCEPTION 'Reservation start time must be before its end time';
    END IF;

    IF p_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'Reservation date % is in the past', p_date;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM RestaurantTable rt WHERE rt.TableNumber = p_table_number) THEN
        RAISE EXCEPTION 'Table % does not exist', p_table_number;
    END IF;

    IF p_employee_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM Employee e WHERE e.Id = p_employee_id) THEN
        RAISE EXCEPTION 'Employee % does not exist', p_employee_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM fn_get_available_tables(p_date, p_start, p_end, 1) t
        WHERE t.TableNumber = p_table_number
    ) THEN
        RAISE EXCEPTION 'Table % is already reserved on % between % and %',
            p_table_number, p_date, p_start, p_end;
    END IF;

    INSERT INTO Reservation (GuestName, GuestPhone, StartTime, EndTime, "Date", EmployeeId, TableNumber)
    VALUES (p_guest_name, p_guest_phone, p_start, p_end, p_date, p_employee_id, p_table_number);
END;
$$;

-- 10. Cancel an open order. Inventory already consumed is not reverted.
CREATE PROCEDURE sp_cancel_order(p_order_id INT4, p_reason TEXT)
LANGUAGE plpgsql AS $$
DECLARE
    v_status VARCHAR(20);
    v_table INT4;
    v_cancelled_id INT4;
BEGIN
    SELECT os.Status, o.TableNumber INTO v_status, v_table
    FROM "Order" o
    JOIN OrderStatus os ON os.Id = o.StatusId
    WHERE o.Id = p_order_id
    FOR UPDATE OF o;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % does not exist', p_order_id;
    END IF;

    IF v_status IN ('Completed', 'Cancelled') THEN
        RAISE EXCEPTION 'Order % is already %', p_order_id, v_status;
    END IF;

    SELECT os.Id INTO v_cancelled_id FROM OrderStatus os WHERE os.Status = 'Cancelled';

    IF v_cancelled_id IS NULL THEN
        RAISE EXCEPTION 'Order status "Cancelled" is not defined';
    END IF;

    UPDATE "Order"
    SET StatusId = v_cancelled_id, DateFinished = now()
    WHERE Id = p_order_id;

    IF v_table IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM "Order" o
        JOIN OrderStatus os ON os.Id = o.StatusId
        WHERE o.TableNumber = v_table
          AND o.Id <> p_order_id
          AND os.Status NOT IN ('Completed', 'Cancelled')
    ) THEN
        UPDATE RestaurantTable SET Status = TRUE WHERE TableNumber = v_table;
    END IF;

    RAISE NOTICE 'Order % cancelled: %', p_order_id, COALESCE(NULLIF(trim(p_reason), ''), 'no reason given');
END;
$$;

-- 11. Close an order and produce its invoice. TotalAmount includes tax.
CREATE PROCEDURE sp_close_order_and_invoice(p_order_id INT4, p_tax_rate NUMERIC DEFAULT 0.18)
LANGUAGE plpgsql AS $$
DECLARE
    v_status VARCHAR(20);
    v_table INT4;
    v_unfinished INT4;
    v_total NUMERIC(10,2);
    v_tax NUMERIC(10,2);
    v_invoice_id INT4;
    v_completed_id INT4;
BEGIN
    IF p_tax_rate IS NULL OR p_tax_rate < 0 OR p_tax_rate >= 1 THEN
        RAISE EXCEPTION 'Tax rate must be between 0 and 1';
    END IF;

    SELECT os.Status, o.TableNumber INTO v_status, v_table
    FROM "Order" o
    JOIN OrderStatus os ON os.Id = o.StatusId
    WHERE o.Id = p_order_id
    FOR UPDATE OF o;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % does not exist', p_order_id;
    END IF;

    IF v_status IN ('Completed', 'Cancelled') THEN
        RAISE EXCEPTION 'Order % is already %', p_order_id, v_status;
    END IF;

    SELECT COUNT(*) INTO v_unfinished
    FROM OrderItem oi
    WHERE oi.OrderId = p_order_id AND oi.Finished = FALSE;

    IF v_unfinished > 0 THEN
        RAISE EXCEPTION 'Order % cannot be closed: % item(s) are not finished', p_order_id, v_unfinished;
    END IF;

    v_total := fn_calculate_order_total(p_order_id);
    v_tax := round(v_total * p_tax_rate, 2);

    INSERT INTO Invoice (OrderId, TotalAmount, TaxAmount)
    VALUES (p_order_id, v_total, v_tax)
    RETURNING Id INTO v_invoice_id;

    INSERT INTO InvoiceItem (InvoiceId, OrderItemId, OriginalPrice, DiscountedPrice, Quantity)
    SELECT v_invoice_id, oi.Id, mm.Price, fn_discounted_price(mm.Id, mm.MenuItemId), oi.Quantity
    FROM OrderItem oi
    JOIN MenuMember mm ON mm.Id = oi.MenuMemberId AND mm.MenuItemId = oi.MenuItemId
    WHERE oi.OrderId = p_order_id
    ORDER BY oi.Id;

    SELECT os.Id INTO v_completed_id FROM OrderStatus os WHERE os.Status = 'Completed';

    IF v_completed_id IS NULL THEN
        RAISE EXCEPTION 'Order status "Completed" is not defined';
    END IF;

    UPDATE "Order"
    SET StatusId = v_completed_id, DateFinished = now()
    WHERE Id = p_order_id;

    IF v_table IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM "Order" o
        JOIN OrderStatus os ON os.Id = o.StatusId
        WHERE o.TableNumber = v_table
          AND o.Id <> p_order_id
          AND os.Status NOT IN ('Completed', 'Cancelled')
    ) THEN
        UPDATE RestaurantTable SET Status = TRUE WHERE TableNumber = v_table;
    END IF;
END;
$$;

-- 12. Receive stock. Logging happens in trg_log_stock_change / trg_log_initial_stock.
CREATE PROCEDURE sp_restock_product(p_product_id INT4, p_quantity INT4)
LANGUAGE plpgsql AS $$
DECLARE
    v_stock_id INT4;
BEGIN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Restock quantity must be greater than 0';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM Product p WHERE p.Id = p_product_id) THEN
        RAISE EXCEPTION 'Product % does not exist', p_product_id;
    END IF;

    SELECT sp.Id INTO v_stock_id
    FROM StoredProduct sp
    WHERE sp.ProductId = p_product_id
    ORDER BY sp.Id
    LIMIT 1
    FOR UPDATE;

    IF v_stock_id IS NULL THEN
        INSERT INTO StoredProduct (Quantity, ProductId) VALUES (p_quantity, p_product_id);
    ELSE
        UPDATE StoredProduct SET Quantity = Quantity + p_quantity WHERE Id = v_stock_id;
    END IF;
END;
$$;

-- 13. Percentage discount on every item of a menu for a date range.
CREATE PROCEDURE sp_apply_discount_to_menu(
    p_menu_id INT4,
    p_name VARCHAR(30),
    p_pct NUMERIC,
    p_from DATE,
    p_to DATE
)
LANGUAGE plpgsql AS $$
DECLARE
    v_discount_id INT4;
    v_items INT4;
BEGIN
    IF p_pct IS NULL OR p_pct <= 0 OR p_pct >= 100 THEN
        RAISE EXCEPTION 'Discount percentage must be between 0 and 100 (exclusive)';
    END IF;

    IF p_from > p_to THEN
        RAISE EXCEPTION 'Discount start date must not be after its end date';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM Menu m WHERE m.Id = p_menu_id) THEN
        RAISE EXCEPTION 'Menu % does not exist', p_menu_id;
    END IF;

    INSERT INTO Discount (Name, "From", "To", MenuId, Status)
    VALUES (p_name, p_from, p_to, p_menu_id, TRUE)
    RETURNING Id INTO v_discount_id;

    INSERT INTO DiscountItem (NewPrice, MenuMemberId, MenuMemberMenuItemId, DiscountId)
    SELECT round(mm.Price * (1 - p_pct / 100), 2), mm.Id, mm.MenuItemId, v_discount_id
    FROM MenuMember mm
    WHERE mm.MenuId = p_menu_id;

    GET DIAGNOSTICS v_items = ROW_COUNT;

    IF v_items = 0 THEN
        RAISE WARNING 'Menu % has no items, discount "%" does not affect any price', p_menu_id, p_name;
    END IF;
END;
$$;
