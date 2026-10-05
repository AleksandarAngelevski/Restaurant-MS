-- P5 Advanced Topics: materialized views behind the analytics dashboard, so
-- aggregates over millions of orders are not recomputed on every request.
-- The backend calls sp_refresh_analytics() on a schedule.

CREATE MATERIALIZED VIEW mv_sales_daily AS
SELECT i.InvoiceDate::DATE AS day,
       ot.Type AS order_type,
       COUNT(*)::INT4 AS invoices,
       SUM(i.TotalAmount) AS revenue,
       SUM(i.TaxAmount) AS tax
FROM Invoice i
JOIN "Order" o ON o.Id = i.OrderId
JOIN OrderType ot ON ot.Id = o.TypeId
GROUP BY i.InvoiceDate::DATE, ot.Type;

CREATE UNIQUE INDEX uq_mv_sales_daily ON mv_sales_daily (day, order_type);

CREATE MATERIALIZED VIEW mv_item_sales_daily AS
SELECT i.InvoiceDate::DATE AS day,
       oi.MenuItemId AS menu_item_id,
       p.Name AS product,
       SUM(ii.Quantity)::INT4 AS quantity,
       SUM(ii.Quantity * COALESCE(ii.DiscountedPrice, ii.OriginalPrice)) AS revenue
FROM InvoiceItem ii
JOIN Invoice i ON i.Id = ii.InvoiceId
JOIN OrderItem oi ON oi.Id = ii.OrderItemId
JOIN Product p ON p.Id = oi.MenuItemId
GROUP BY i.InvoiceDate::DATE, oi.MenuItemId, p.Name;

CREATE UNIQUE INDEX uq_mv_item_sales_daily ON mv_item_sales_daily (day, menu_item_id);

-- table_number 0 = order without a table (takeaway, delivery, bar)
CREATE MATERIALIZED VIEW mv_order_activity AS
SELECT o.DateCreated::DATE AS day,
       EXTRACT(HOUR FROM o.DateCreated)::INT4 AS hour,
       COALESCE(o.TableNumber, 0) AS table_number,
       COUNT(*)::INT4 AS orders
FROM "Order" o
JOIN OrderStatus os ON os.Id = o.StatusId
WHERE os.Status <> 'Cancelled'
GROUP BY o.DateCreated::DATE, EXTRACT(HOUR FROM o.DateCreated)::INT4, COALESCE(o.TableNumber, 0);

CREATE UNIQUE INDEX uq_mv_order_activity ON mv_order_activity (day, hour, table_number);

CREATE MATERIALIZED VIEW mv_stock_usage_daily AS
SELECT pul.Timestamp::DATE AS day,
       pul.ProductId AS product_id,
       p.Name AS product,
       u.Name AS unit,
       ct.Sign AS positive,
       SUM(pul.ChangeAmount)::INT8 AS amount
FROM ProductUsageLog pul
JOIN Product p ON p.Id = pul.ProductId
JOIN Unit u ON u.Id = pul.BaseUnitId
JOIN ChangeType ct ON ct.Id = pul.ChangeTypeId
GROUP BY pul.Timestamp::DATE, pul.ProductId, p.Name, u.Name, ct.Sign;

CREATE UNIQUE INDEX uq_mv_stock_usage_daily ON mv_stock_usage_daily (day, product_id, unit, positive);

CREATE PROCEDURE sp_refresh_analytics()
LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_sales_daily;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_item_sales_daily;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_order_activity;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_stock_usage_daily;
END;
$$;
