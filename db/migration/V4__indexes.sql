-- P3 Query Optimization: indexes for the hot paths (~2M orders, ~20M order items,
-- ~1M reservations). The team's indexes.pdf was not provided; see
-- docs/query-optimization.md for the reasoning and EXPLAIN ANALYZE notes.

-- Orders
CREATE INDEX idx_order_waiter ON "Order" (WaiterId);
CREATE INDEX idx_order_status ON "Order" (StatusId);
CREATE INDEX idx_order_table ON "Order" (TableNumber);
CREATE INDEX idx_order_datecreated ON "Order" (DateCreated);

-- Order items
CREATE INDEX idx_orderitem_order ON OrderItem (OrderId);
CREATE INDEX idx_orderitem_menumember ON OrderItem (MenuMemberId, MenuItemId);
CREATE INDEX idx_orderitem_unfinished ON OrderItem (OrderId) WHERE Finished = FALSE;  -- kitchen queue

-- Invoicing
CREATE INDEX idx_invoice_order ON Invoice (OrderId);
CREATE INDEX idx_invoice_date ON Invoice (InvoiceDate);
CREATE INDEX idx_invoiceitem_invoice ON InvoiceItem (InvoiceId);

-- Reservations (the no_overlap GiST index already covers table/date/time)
CREATE INDEX idx_reservation_date_start ON Reservation ("Date", StartTime);

-- Menus and discounts
CREATE INDEX idx_menumember_menu ON MenuMember (MenuId);
CREATE INDEX idx_discountitem_discount ON DiscountItem (DiscountId);
CREATE INDEX idx_discountitem_menumember ON DiscountItem (MenuMemberId, MenuMemberMenuItemId);
CREATE INDEX idx_discount_menu_active ON Discount (MenuId, "From", "To") WHERE Status;

-- Inventory: one stock row per product
CREATE UNIQUE INDEX uq_storedproduct_product ON StoredProduct (ProductId);
CREATE INDEX idx_productusagelog_product_time ON ProductUsageLog (ProductId, Timestamp);

-- Staff and recipes
CREATE INDEX idx_employeerole_employee ON EmployeeRole (EmployeeId);
CREATE INDEX idx_consistsof_component ON ConsistsOf (Component);
