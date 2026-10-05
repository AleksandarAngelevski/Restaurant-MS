# RestaurantMS — Build Spec for Claude Code

> Source: FINKI Trac project https://develop.finki.ukim.mk/projects/RestaurantMS
> Course: Advanced Databases 2025/2026 (Prof. Dr. Goran Velinov, Asst. Nenad Anchev)
> Team: Aleksandar Angelevski (231219), Filip Hadjievski (231034), Andrej Hristovski (231162)
> Seeder repo: https://github.com/AleksandarAngelevski/database-seeder

You (Claude Code) are building a working **Restaurant Management System**: a PostgreSQL database (already designed and approved — reproduce it exactly) plus a web application on top of it. Read this whole file before writing code. Work through the milestones at the bottom in order and commit after each.

---

## 1. What the product is

A web-based (mobile-friendly) restaurant management platform, offered as SaaS to restaurants. It centralises:

- **Orders** — staff enter orders digitally per table / takeaway / delivery / bar; kitchen marks items finished.
- **Reservations** — table booking with overlap prevention (no overbooking).
- **Inventory** — stock levels per product; automatically deducted from recipes when kitchen finishes an item; low-stock alerts; full movement log.
- **Menus & discounts** — multiple menus (breakfast, lunch, drinks…), per-menu prices, time-boxed percentage discounts.
- **Invoicing** — closing an order produces an invoice with tax (default 18% VAT) and per-line original/discounted prices.
- **Employees** — staff, roles, permissions, employment/resignation dates.
- **Analytics & reporting** — sales trends, revenue per waiter, stock usage.

Differentiator stated by the team: **customisation** — each restaurant adapts menus, workflows and features rather than a rigid one-size-fits-all system.

### User roles

| Role (EmployeeType) | Permissions value | Can do |
|---|---|---|
| Waiter | 0 | Create orders, add items, view own orders, view tables/menu |
| Manager | 1 | Everything a waiter can + menus, discounts, reservations, reports |
| Supervisor | 2 | Manager rights + staff overview |
| Host | 3 | Reservations, table availability |
| Admin | 4 | Full control: employees, roles, lookup tables, inventory, analytics |

Kitchen staff are not a separate type in the seed data; `OrderItem.CreatedBy` records who prepared an item. Add a **Kitchen** employee type (id after the seeded ones) so there is a kitchen screen with a proper role. Treat `Permissions` as a role level, not a bitmask (Host=3 breaks bitmask semantics) — authorise by role name.

The original page also mentions **Administrative staff (inventory & reporting)** — map to Admin.

---

## 2. Tech stack

The wiki fixes only **PostgreSQL** and "web-based, optional mobile". Use this stack unless I tell you otherwise:

- **Database:** PostgreSQL 16 (Docker Compose for local dev). Requires extension `btree_gist`.
- **Backend:** Spring Boot 3 / Java 21, Spring Security (session or JWT), **Spring JDBC / JdbcClient** (not JPA entities for the business logic — the logic lives in stored procedures and must be called, not re-implemented). Flyway for migrations.
- **Frontend:** React + TypeScript + Vite, TanStack Query, a component library (shadcn/ui or MUI). Responsive so waiters can use phones/tablets.
- **Tests:** JUnit + Testcontainers (Postgres) for DB/procedure behaviour; Playwright smoke tests for main flows.

**Core principle:** the database is the source of truth. Business rules (inventory deduction, closed-order guard, invoice calculation, reservation availability, discounts) are implemented as PostgreSQL functions/procedures/triggers. The backend calls them (`CALL sp_...`, `SELECT fn_...`) and translates `RAISE EXCEPTION` messages into 4xx responses. Read-only screens query the views.

Quoted identifiers: the schema uses `"Order"`, `"From"`, `"To"`, `"Date"`. All other identifiers are unquoted and therefore folded to lowercase by Postgres — keep that in mind in the backend SQL.

---

## 3. Database schema (approved P2 — reproduce exactly)

Put this in `db/migration/V1__schema.sql`.

```sql
-- Lookup / Type Tables
CREATE TABLE EmployeeType (
    Id SERIAL PRIMARY KEY,
    Type VARCHAR(30) NOT NULL UNIQUE,
    Permissions INT4 NOT NULL DEFAULT 0
);
CREATE TABLE OrderType (Id SERIAL PRIMARY KEY, Type VARCHAR(20) NOT NULL UNIQUE);
CREATE TABLE OrderStatus (Id SERIAL PRIMARY KEY, Status VARCHAR(20) NOT NULL UNIQUE);
CREATE TABLE MenuType (Id SERIAL PRIMARY KEY, Type VARCHAR(30) NOT NULL UNIQUE);
CREATE TABLE ProductType (Id SERIAL PRIMARY KEY, Type VARCHAR(30) NOT NULL UNIQUE);
CREATE TABLE MenuMemberType (Id SERIAL PRIMARY KEY, Type VARCHAR(20) NOT NULL UNIQUE);
CREATE TABLE TableType (Id SERIAL PRIMARY KEY, Type VARCHAR(20) NOT NULL UNIQUE);
CREATE TABLE UnitType (Id SERIAL PRIMARY KEY, Type VARCHAR(20) NOT NULL UNIQUE);
CREATE TABLE ChangeType (
    Id SERIAL PRIMARY KEY,
    Type VARCHAR(30) NOT NULL UNIQUE,
    Sign BOOL NOT NULL
);
CREATE TABLE Location (Id SERIAL PRIMARY KEY, Name VARCHAR(30) NOT NULL UNIQUE);

-- Core Tables
CREATE TABLE Unit (
    Id SERIAL PRIMARY KEY,
    Name VARCHAR(20) NOT NULL,
    Conversion_to_base INT4 NOT NULL DEFAULT 1 CHECK (Conversion_to_base > 0),
    TypeId INT4 NOT NULL,
    CONSTRAINT FKUnit_UnitType FOREIGN KEY (TypeId) REFERENCES UnitType (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE RestaurantTable (
    TableNumber SERIAL PRIMARY KEY,
    Capacity INT4 NOT NULL DEFAULT 2 CHECK (Capacity > 0),
    Status BOOL NOT NULL DEFAULT TRUE,           -- TRUE = available
    TableTypeId INT4 NOT NULL,
    CONSTRAINT FKTable_TableType FOREIGN KEY (TableTypeId) REFERENCES TableType (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE Employee (
    Id SERIAL PRIMARY KEY,
    FirstName VARCHAR(50) NOT NULL DEFAULT 'Unknown',
    LastName VARCHAR(50) NOT NULL DEFAULT 'Unknown',
    SSN VARCHAR(13) NOT NULL UNIQUE,
    Sex CHAR(1) NOT NULL CHECK (Sex IN ('M', 'F', 'O')),
    Email VARCHAR(100) UNIQUE CHECK (Email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,4}$'),
    PasswordHash VARCHAR(255) NOT NULL,
    DateEmployment DATE NOT NULL DEFAULT CURRENT_DATE,
    DateResignation DATE,
    CHECK (DateResignation IS NULL OR DateResignation >= DateEmployment)
);

CREATE TABLE EmployeeRole (
    Id SERIAL PRIMARY KEY,
    EmployeeId INT4 NOT NULL,
    EmployeeTypeid INT4 NOT NULL,
    CONSTRAINT FKEmployeeRole_Employee FOREIGN KEY (EmployeeId) REFERENCES Employee (Id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT FKEmployeeRole_EmployeeType FOREIGN KEY (EmployeeTypeid) REFERENCES EmployeeType (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE Product (
    Id SERIAL PRIMARY KEY,
    Name VARCHAR(30) NOT NULL UNIQUE,
    Url VARCHAR(255),
    TypeId INT4 NOT NULL,
    BaseUnitId INT4 NOT NULL,
    CONSTRAINT FKProduct_ProductType FOREIGN KEY (TypeId) REFERENCES ProductType (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT FKProduct_Unit FOREIGN KEY (BaseUnitId) REFERENCES Unit (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Specialisation: a Product that can be sold
CREATE TABLE MenuItem (
    Id INT4 PRIMARY KEY,
    CONSTRAINT FKMenuItem_Product FOREIGN KEY (Id) REFERENCES Product (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE StoredProduct (
    Id SERIAL PRIMARY KEY,
    Quantity INT4 NOT NULL DEFAULT 0 CHECK (Quantity >= 0),   -- in product's base unit
    ProductId INT4 NOT NULL,
    CONSTRAINT FKStoredProduct_Product FOREIGN KEY (ProductId) REFERENCES Product (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Recipe / bill of materials (self-referencing Product)
CREATE TABLE ConsistsOf (
    Parent INT4 NOT NULL,    -- the recipe
    Component INT4 NOT NULL, -- the ingredient
    Amount INT4 NOT NULL CHECK (Amount > 0),
    UnitId INT4 NOT NULL,
    PRIMARY KEY (Parent, Component),
    CONSTRAINT FKConsistsOf_ParentProduct FOREIGN KEY (Parent) REFERENCES Product (Id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT FKConsistsOf_ComponentProduct FOREIGN KEY (Component) REFERENCES Product (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT FKConsistsOf_Unit FOREIGN KEY (UnitId) REFERENCES Unit (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE ProductUsageLog (
    Id SERIAL PRIMARY KEY,
    ProductId INT4 NOT NULL,
    ChangeAmount INT4 NOT NULL,
    InputAmount INT4 NOT NULL,
    Timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ChangeTypeId INT4 NOT NULL,
    BaseUnitId INT4 NOT NULL,
    InputUnitId INT4 NOT NULL,
    CONSTRAINT FKProductUsageLog_Product FOREIGN KEY (ProductId) REFERENCES Product (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT FKProductUsageLog_ChangeType FOREIGN KEY (ChangeTypeId) REFERENCES ChangeType (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT FKProductUsageLog_BaseUnit FOREIGN KEY (BaseUnitId) REFERENCES Unit (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT FKProductUsageLog_InputUnit FOREIGN KEY (InputUnitId) REFERENCES Unit (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE Menu (
    Id SERIAL PRIMARY KEY,
    Name VARCHAR(30) NOT NULL DEFAULT 'Standard Menu',
    Active BOOL NOT NULL DEFAULT TRUE,
    Wallpaper VARCHAR(255),
    TypeId INT4 NOT NULL,
    CONSTRAINT FKMenu_MenuType FOREIGN KEY (TypeId) REFERENCES MenuType (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE MenuMember (
    Id SERIAL NOT NULL,
    MenuItemId INT4 NOT NULL,
    Price NUMERIC(10,2) NOT NULL CHECK (Price >= 0),
    TypeId INT4 NOT NULL,
    MenuId INT4 NOT NULL,
    PRIMARY KEY (Id, MenuItemId),
    CONSTRAINT FKMenuMember_MenuItem FOREIGN KEY (MenuItemId) REFERENCES MenuItem (Id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT FKMenuMember_MenuMemberType FOREIGN KEY (TypeId) REFERENCES MenuMemberType (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT FKMenuMember_Menu FOREIGN KEY (MenuId) REFERENCES Menu (Id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE Discount (
    Id SERIAL PRIMARY KEY,
    Name VARCHAR(30) NOT NULL,
    "From" DATE NOT NULL,
    "To" DATE NOT NULL,
    MenuId INT4 NOT NULL,
    Status BOOL NOT NULL DEFAULT TRUE,
    CONSTRAINT FKDiscount_Menu FOREIGN KEY (MenuId) REFERENCES Menu (Id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CHECK ("To" >= "From")
);

CREATE TABLE DiscountItem (
    Id SERIAL PRIMARY KEY,
    NewPrice NUMERIC(10,2) NOT NULL CHECK (NewPrice >= 0),
    MenuMemberId INT4 NOT NULL,
    MenuMemberMenuItemId INT4 NOT NULL,
    DiscountId INT4 NOT NULL,
    CONSTRAINT FKDiscountItem_Discount FOREIGN KEY (DiscountId) REFERENCES Discount (Id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT FKDiscountItem_MenuMember FOREIGN KEY (MenuMemberId, MenuMemberMenuItemId)
        REFERENCES MenuMember (Id, MenuItemId) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Order" (
    Id SERIAL PRIMARY KEY,
    WaiterId INT4,
    DateCreated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    DateFinished TIMESTAMP,
    TypeId INT4 NOT NULL,
    StatusId INT4 NOT NULL,
    TableNumber INT4,
    CONSTRAINT FKOrder_OrderType FOREIGN KEY (TypeId) REFERENCES OrderType (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT FKOrder_OrderStatus FOREIGN KEY (StatusId) REFERENCES OrderStatus (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT FKOrder_Employee FOREIGN KEY (WaiterId) REFERENCES Employee (Id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT FKOrder_Table FOREIGN KEY (TableNumber) REFERENCES RestaurantTable (TableNumber)
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE OrderItem (
    Id SERIAL PRIMARY KEY,
    Quantity INT4 NOT NULL CHECK (Quantity > 0),
    OrderId INT4 NOT NULL,
    CreatedBy INT4,                        -- employee who prepared it
    Finished BOOL NOT NULL DEFAULT FALSE,
    MenuMemberId INT4 NOT NULL,
    MenuItemId INT4 NOT NULL,
    CONSTRAINT FKOrderItem_Order FOREIGN KEY (OrderId) REFERENCES "Order" (Id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT FKOrderItem_Employee FOREIGN KEY (CreatedBy) REFERENCES Employee (Id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT FKOrderItem_MenuMember FOREIGN KEY (MenuMemberId, MenuItemId)
        REFERENCES MenuMember (Id, MenuItemId) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE Reservation (
    Id SERIAL PRIMARY KEY,
    GuestName VARCHAR(50) NOT NULL,
    GuestPhone VARCHAR(50),
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    StartTime TIME NOT NULL,
    EndTime TIME NOT NULL,
    "Date" DATE NOT NULL,
    EmployeeId INT4,
    TableNumber INT4,
    CONSTRAINT FKReservation_Employee FOREIGN KEY (EmployeeId) REFERENCES Employee (Id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT FKReservation_Table FOREIGN KEY (TableNumber) REFERENCES RestaurantTable (TableNumber)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CHECK (EndTime > StartTime)
);

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE Reservation
ADD CONSTRAINT no_overlap EXCLUDE USING gist (
    TableNumber WITH =,
    "Date" WITH =,
    tsrange(("Date" + StartTime)::timestamp, ("Date" + EndTime)::timestamp) WITH &&
);

CREATE TABLE Invoice (
    Id SERIAL PRIMARY KEY,
    OrderId INT4 NOT NULL,
    InvoiceDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    TotalAmount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (TotalAmount >= 0),
    TaxAmount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (TaxAmount >= 0),
    CONSTRAINT FKInvoice_Order FOREIGN KEY (OrderId) REFERENCES "Order" (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE InvoiceItem (
    Id SERIAL PRIMARY KEY,
    InvoiceId INT4 NOT NULL,
    OrderItemId INT4 NOT NULL,
    OriginalPrice NUMERIC(10,2) NOT NULL CHECK (OriginalPrice >= 0),
    DiscountedPrice NUMERIC(10,2) CHECK (DiscountedPrice >= 0),
    Quantity INT4 NOT NULL CHECK (Quantity > 0),
    CONSTRAINT FKInvoiceItem_Invoice FOREIGN KEY (InvoiceId) REFERENCES Invoice (Id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT FKInvoiceItem_OrderItem FOREIGN KEY (OrderItemId) REFERENCES OrderItem (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);
```

### Domain notes (read carefully)

- **Product** is the master for everything physical (ingredients, dishes, beverages, packaging, cleaning supplies). A **MenuItem** is a Product that can be sold (1:1 specialisation sharing the PK).
- **ConsistsOf** is a recipe: `Parent` dish is made of `Component` products in `Amount` of `UnitId`. Convert to the component's base unit with `Unit.Conversion_to_base` before deducting stock.
- **MenuMember** = a MenuItem placed on a specific Menu at a specific price. Composite PK `(Id, MenuItemId)` — always carry both columns when referencing it (OrderItem, DiscountItem).
- **StoredProduct.Quantity** is in the product's base unit (e.g. grams, millilitres, pieces).
- **ChangeType.Sign**: TRUE = stock increase, FALSE = decrease.
- **RestaurantTable.Status**: TRUE = free, FALSE = occupied.
- **Location** table exists but is not referenced yet — leave it; P5 (Advanced Topics) is still in progress and may use it (multi-location SaaS).
- Invoice: `TotalAmount` includes tax; net = Total − Tax (see `vw_invoice_summary`).

---

## 4. Views (approved P2) — `V2__views.sql`

```sql
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
```

The views lack IDs the UI needs (e.g. `vw_inventory` has no ProductId, `vw_active_menu` has no MenuMember keys). **Do not alter these views** (they are graded deliverables). Add separate `api_*` views in a later migration for anything the app needs.

---

## 5. Functions, procedures & triggers (approved P4) — `V3__programming.sql`

The original file is `FAZA4.sql` (attachment on the DatabaseProgramming wiki page). **If `db/original/FAZA4.sql` exists in the repo, use it verbatim instead of writing your own.** Otherwise implement from this spec, keeping the exact names and signatures:

### Triggers

1. **`trg_prevent_closed_order_edit`** — `BEFORE INSERT OR UPDATE ON OrderItem`, function `fn_guard_closed_order()`. Raise an exception (including order id and status) if the parent order's status is `Completed` or `Cancelled`.
   - Careful: `sp_close_order_and_invoice` and the kitchen flow must still work — finishing items happens before close.
2. **`trg_deduct_inventory_on_item_finish`** — `AFTER UPDATE OF Finished ON OrderItem`, function `fn_deduct_inventory_on_finish()`. When `Finished` goes FALSE→TRUE, for each `ConsistsOf` component of the menu item: required = `Amount × Unit.Conversion_to_base × OrderItem.Quantity`; subtract from `StoredProduct.Quantity`. If insufficient, `RAISE WARNING` and floor at 0.
3. **`trg_log_stock_change`** — `AFTER UPDATE OF Quantity ON StoredProduct`, function `fn_log_stock_change()`. If quantity changed, insert into `ProductUsageLog` (`ChangeAmount` = |new − old|, `InputAmount` same, ChangeType = an increase type if new > old else a decrease type, BaseUnitId/InputUnitId = product's base unit). Skip if unchanged.
   - Also log on INSERT of a new StoredProduct row (initial stock) — restock may create rows.

### Functions

4. **`fn_calculate_order_total(p_order_id INT4) RETURNS NUMERIC(10,2)`** — Σ quantity × effective price, where effective price = lowest `DiscountItem.NewPrice` from an active (`Status = TRUE`) discount whose `"From"`–`"To"` range contains `CURRENT_DATE`, else `MenuMember.Price`.
5. **`fn_get_available_tables(p_date DATE, p_start TIME, p_end TIME, p_guests INT4) RETURNS TABLE(...)`** — tables with `Capacity >= p_guests` and no overlapping reservation on that date/time; order by capacity ascending.
6. **`fn_low_stock_report(p_threshold INT4 DEFAULT 10) RETURNS TABLE(...)`** — products with `StoredProduct.Quantity < p_threshold`: name, type, quantity, base unit; ascending by quantity.

### Procedures

7. **`sp_add_order_item(p_order_id, p_menu_member_id, p_menu_item_id, p_quantity, p_created_by)`** — validate quantity > 0, order exists and open, MenuMember exists. If an unfinished identical item already exists on the order, increment its quantity; else insert.
8. **`sp_create_order(p_waiter_id, p_order_type_id, p_table_number)`** — waiter must be active (resignation NULL or in the future); order type exists; table (if given) exists and is available. Initial status = `Pending`. Mark table occupied (`Status = FALSE`). Return the new id (use an `INOUT p_order_id` param or a companion function so the app can read it).
9. **`sp_create_reservation(p_guest_name, p_guest_phone, p_date, p_start, p_end, p_table_number, p_employee_id)`** — start < end, date not in the past, table exists, employee exists if given, table appears in `fn_get_available_tables`. Insert. (The `no_overlap` exclusion constraint is the final safety net.)
10. **`sp_cancel_order(p_order_id, p_reason TEXT)`** — reject if already Cancelled/Completed. Set status `Cancelled`, `DateFinished = now()`. Free the table only if no other open orders use it. Do not revert inventory.
11. **`sp_close_order_and_invoice(p_order_id, p_tax_rate NUMERIC DEFAULT 0.18)`** — order must exist and be open; (from the seeder README) **all items must be finished** first. Total = `fn_calculate_order_total`; tax = round(total × rate, 2). Insert Invoice, then one InvoiceItem per OrderItem (OriginalPrice = MenuMember.Price, DiscountedPrice = effective discount price or NULL). Set status `Completed`, `DateFinished = now()`, free the table.
12. **`sp_restock_product(p_product_id INT4, p_quantity INT4)`** — quantity > 0, product exists; create StoredProduct row if missing else increment. Logging happens via trigger.
13. **`sp_apply_discount_to_menu(p_menu_id, p_name, p_pct, p_from, p_to)`** — 0 < pct < 100, from ≤ to, menu exists. Insert Discount (Status TRUE) and a DiscountItem for each MenuMember of the menu with `NewPrice = round(Price × (1 − pct/100), 2)`. `RAISE WARNING` if the menu has no items.

### Extra DB-level rules from the seeder README

- Resigned employees cannot create orders (trigger on `"Order"` insert, or enforced in `sp_create_order` — do both).
- No overlapping reservations (already the `no_overlap` constraint).
- Order cannot become `Completed` while it has unfinished items (trigger on `"Order"` status update).

---

## 6. Indexes (P3 — Query Optimization)

The team's index work is in `indexes.pdf` on the QueryOptimization wiki page, which I could not read. **If `db/original/indexes.sql` (or the PDF) is provided, use it.** Otherwise create `V4__indexes.sql` with indexes for the hot paths of a dataset of ~2M orders / ~20M order items / 1M reservations:

- `"Order"(WaiterId)`, `"Order"(StatusId)`, `"Order"(TableNumber)`, `"Order"(DateCreated)`
- `OrderItem(OrderId)`, `OrderItem(MenuMemberId, MenuItemId)`, partial `OrderItem(OrderId) WHERE Finished = FALSE` (kitchen queue)
- `Invoice(OrderId)`, `Invoice(InvoiceDate)`, `InvoiceItem(InvoiceId)`
- `Reservation("Date", StartTime)` (the GiST exclusion index already covers table/date/time)
- `MenuMember(MenuId)`, `DiscountItem(DiscountId)`, `DiscountItem(MenuMemberId, MenuMemberMenuItemId)`, `Discount(MenuId, "From", "To") WHERE Status`
- `StoredProduct(ProductId)` (consider `UNIQUE` — one stock row per product), `ProductUsageLog(ProductId, Timestamp)`
- `EmployeeRole(EmployeeId)`, `ConsistsOf(Component)`

Verify each with `EXPLAIN ANALYZE` against the seeded DB and keep notes in `docs/query-optimization.md`.

---

## 7. Seed data — `V5__lookup_seed.sql` + dev seeder

Lookup values from the team's seeder (insert with explicit order so ids are stable):

- **EmployeeType** (Type, Permissions): Waiter 0, Manager 1, Supervisor 2, Admin 4, Host 3 — plus add Kitchen 0.
- **OrderType**: Dine-in, Takeaway, Delivery, Bar
- **OrderStatus**: Pending, In Progress, Ready, Served, Completed, **Cancelled** (see quirks below)
- **MenuType**: Breakfast, Lunch, Dinner, Drinks, Desserts, Specials, Kids, Seasonal
- **MenuMemberType**: Regular, Special, Seasonal, Chef's Pick
- **ProductType**: Ingredient, Beverage, Dish, Dessert, Condiment, Packaging, Cleaning
- **TableType**: Indoor, Outdoor, Bar, Private Room, Terrace
- **UnitType**: Weight, Volume, Count, Length
- **Unit** (name, conversion_to_base, type): gram 1 W, kilogram 1000 W, milligram 1 W, milliliter 1 V, liter 1000 V, centiliter 10 V, piece 1 C, dozen 12 C, slice 1 C
- **ChangeType** (type, sign): Purchase T, Order F, Manual Adjustment Down F, Manual Adjustment Up T, Return to Supplier F

Sample recipes (ConsistsOf) from the seeder: Margherita Pizza (Wheat Flour, Tomato Sauce, Mozzarella, Basil, Olive Oil, Salt), Spaghetti Bolognese (Pasta, Beef Mince, Tomato Sauce, Onions, Garlic, Black Pepper), Caesar Salad (Lettuce, Parmesan, Garlic), Beef Burger (Beef Mince, Bun, Lettuce, Tomatoes, Cheese), Tiramisu (Eggs, Sugar, Cocoa Powder, Cream, Chocolate).

For local dev, write a small **demo seed** (`db/dev/demo_seed.sql`, not a Flyway migration): ~20 employees across all roles with known passwords (BCrypt; e.g. `admin@demo.mk / admin123`), 20 tables, ~40 products with stock, 3 active menus with prices, a few recipes, a running discount, some open/closed orders and today's reservations. For load testing, point to the team's Python seeder (`python -m seed`, configured via `.env`).

### Known quirks in the original seeder — fix in our seed, don't copy

- OrderStatus seeds `Packaging` and `Cleaning` (copy-paste from ProductType) and has **no `Cancelled`**, which `sp_cancel_order` needs. Use the list above.
- ChangeType seeds both `ORDER` and `Order`. Use one.
- `Employee.PasswordHash` is seeded with random SHA-256 strings — not usable for login. Use BCrypt in our app.
- `UnitType` insert has no `ON CONFLICT` (not idempotent).

---

## 8. Application features (screens & API)

All endpoints under `/api`, JSON, role-protected. Map DB exceptions to `409`/`422` with the Postgres message.

### Auth
- Login with email + password (BCrypt against `Employee.PasswordHash`). Resigned employees cannot log in. Role(s) from `EmployeeRole`.

### Waiter (phone/tablet first)
- **Floor plan / table grid** from `vw_table_availability` (free/occupied, capacity, type).
- **New order** → `sp_create_order` (dine-in on a table; takeaway/delivery/bar without table).
- **Order screen**: active menu (with any discounted prices shown), add items → `sp_add_order_item`, see item status (finished or not), running total via `fn_calculate_order_total`.
- **Close & invoice** → `sp_close_order_and_invoice`; show printable invoice (lines with original & discounted price, subtotal, 18% VAT, total).
- **Cancel order** with reason → `sp_cancel_order`.
- "My orders" filtered from `vw_order_overview`.

### Kitchen
- **Kitchen queue**: unfinished OrderItems grouped by order, oldest first, auto-refresh (polling every 5s or SSE).
- Mark item finished → `UPDATE OrderItem SET Finished = TRUE, CreatedBy = :me` (triggers deduct inventory). Show any low-stock warnings returned.

### Host / Reservations
- Search availability → `fn_get_available_tables(date, start, end, guests)`.
- Create → `sp_create_reservation`. Today's list → `vw_todays_reservations`. Calendar/day view, edit/cancel reservation.

### Manager
- **Menus**: CRUD menus (name, type, active, wallpaper URL), add/remove MenuMembers with prices and member type.
- **Discounts**: create via `sp_apply_discount_to_menu`, list/toggle Status, view DiscountItems.
- **Products & recipes**: CRUD products, mark as MenuItem, edit ConsistsOf (component, amount, unit).

### Admin / Inventory
- **Inventory** list (`vw_inventory` + IDs), restock → `sp_restock_product`, manual adjustments (log with Manual Adjustment ChangeTypes).
- **Low-stock alerts** → `fn_low_stock_report(threshold)`; badge in the nav bar.
- **Stock movement history** → `vw_product_usage_history`, filterable by product/date/type.
- **Employees**: CRUD, assign roles, set resignation date; list from `vw_active_staff`.
- **Lookup tables**: manage table types, order types, menu types etc. (the "customisation" pitch).
- **Restaurant tables**: CRUD tables (capacity, type).

### Analytics dashboard (Manager/Admin)
- Revenue per waiter (`vw_revenue_per_waiter`), invoice summaries (`vw_invoice_summary`).
- Sales over time (daily/weekly revenue from Invoice), top-selling items, revenue by order type, average order value, stock usage over time, busiest hours/tables.
- Date range filters; charts (Recharts). For heavy aggregates over millions of rows, back them with materialized views refreshed on a schedule — fits P5 "Advanced Topics".

---

## 9. Non-functional requirements

- Prices in MKD, NUMERIC end-to-end (BigDecimal in Java), never floats.
- All multi-step writes go through the stored procedures in a single transaction.
- Pagination on every list (orders/reservations tables will have millions of rows).
- Responsive UI; large touch targets on waiter & kitchen screens.
- i18n-ready (English first; Macedonian strings later).
- `docker compose up` starts Postgres + backend + frontend; README explains it.
- Config via env vars (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) — the team accesses the university DB through an SSH tunnel on a local port (e.g. 5433), so do not hard-code 5432.

---

## 10. Repository layout

```
restaurantms/
├── docker-compose.yml
├── README.md
├── db/
│   ├── migration/            # Flyway: V1__schema, V2__views, V3__programming, V4__indexes, V5__lookup_seed, V6__api_views...
│   ├── original/             # (optional) team's original schema.sql, views.sql, FAZA4.sql, indexes
│   └── dev/demo_seed.sql
├── backend/                  # Spring Boot
│   └── src/main/java/mk/finki/rms/{auth,orders,kitchen,reservations,menu,inventory,employees,analytics,common}
├── frontend/                 # React + Vite + TS
│   └── src/{pages,components,api,hooks,auth}
└── docs/
    ├── query-optimization.md
    └── api.md
```

---

## 11. Milestones (do in order, commit after each)

1. **DB foundation** — docker-compose Postgres, migrations V1–V2 + lookup seed; verify schema loads cleanly.
2. **DB programming** — V3 (functions/procedures/triggers) + Testcontainers tests for each rule: closed-order guard, inventory deduction & logging, discount pricing, invoice totals with tax, reservation overlap rejection, resigned waiter rejection, cancel frees table.
3. **Indexes** — V4, `EXPLAIN ANALYZE` notes.
4. **Backend skeleton** — Spring Boot, JDBC, auth (BCrypt), role security, error mapping, demo seed.
5. **Orders + Kitchen** end to end (waiter + kitchen screens).
6. **Reservations**.
7. **Menus, products, recipes, discounts**.
8. **Inventory & employees admin**.
9. **Analytics dashboard**.
10. **Polish** — responsive pass, Playwright smoke tests, README with screenshots.

### Definition of done
- Fresh clone → `docker compose up` → log in as each demo role and complete: create order → add items → kitchen finishes items (stock drops, log rows appear) → close order (invoice with 18% VAT) → table freed; book a reservation and see an overlapping booking rejected; apply a 20% menu discount and see it reflected in the next order total.

---

## 12. Open questions (ask me before guessing)

- Stack preference if not Spring Boot + React.
- Contents of `indexes.pdf` (P3) and the final P5 "Advanced Topics" scope.
- Multi-restaurant tenancy (is `Location` meant for that?).
- Whether to deploy against the university server (SSH tunnel) or local Docker only.
