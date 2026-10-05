# Query optimization notes (P3)

The team's `indexes.pdf` was not available, so `db/migration/V4__indexes.sql` was written from the
build spec for a target of ~2M orders, ~20M order items and ~1M reservations.

## How this was checked — and what it does not prove

The plans below were taken with `EXPLAIN (ANALYZE)` on the **demo seed** (85 orders, 196 order
items, 6 reservations) with `SET enable_seqscan = off`.

On tables this small the planner correctly prefers sequential scans, so disabling them only shows
that each index **can serve** its query. It says nothing about timing or about the plans chosen at
production volume. To get real numbers, load the team's Python seeder (`python -m seed`) and
re-run the queries without `enable_seqscan = off`:

```
docker compose exec -T db psql -U rms -d rms
```

## Hot paths and the index that serves each

| Query (screen) | Index used in the plan |
|---|---|
| Kitchen queue: unfinished items of open orders | `idx_orderitem_unfinished` (partial, `WHERE Finished = FALSE`), `idx_order_status` |
| Items of one order (order screen, invoice, `fn_calculate_order_total`) | `idx_orderitem_order` |
| "My orders" for a waiter | `idx_order_waiter` |
| Invoices in a date range (analytics refresh) | `idx_invoice_date` |
| Invoice of an order | `idx_invoice_order` |
| Reservations of a day, ordered by start time | `idx_reservation_date_start` |
| `fn_get_available_tables` overlap check | `no_overlap` (the GiST exclusion index) |
| Discounted price of a menu member (`fn_discounted_price`) | `idx_discountitem_menumember`, then `discount_pkey` |
| Stock history of a product | `idx_productusagelog_product_time` |
| Stock row of a product (inventory deduction trigger, restock) | `uq_storedproduct_product` |
| Recipes that use an ingredient | `idx_consistsof_component` |
| Roles of an employee (login) | `idx_employeerole_employee` |

Not exercised by a plan here, created from the spec's list: `idx_order_table`,
`idx_order_datecreated`, `idx_orderitem_menumember`, `idx_invoiceitem_invoice`,
`idx_menumember_menu`, `idx_discountitem_discount`, `idx_discount_menu_active`.

## Design decisions

- **Partial index for the kitchen queue.** At any moment only a handful of the ~20M order items
  are unfinished, so `idx_orderitem_unfinished` stays tiny no matter how much history accumulates.
- **`StoredProduct(ProductId)` is UNIQUE.** One stock row per product is what the deduction
  trigger and `sp_restock_product` assume. The migration fails on a database that already holds
  duplicate stock rows for a product; merge them first.
- **No extra reservation index for overlap checks.** The `no_overlap` exclusion constraint already
  maintains a GiST index on (table, date, time range), and the availability function uses it.
- **Analytics do not hit the base tables per request.** The dashboard reads the `mv_*`
  materialized views from `V7__analytics.sql`, refreshed by `sp_refresh_analytics()` every
  `ANALYTICS_REFRESH_MS` (default 60 s) with `REFRESH ... CONCURRENTLY`, so readers are not blocked.
- **Paging without `COUNT(*)`.** List endpoints fetch `size + 1` rows and return `hasMore`. They
  still use `OFFSET`, which gets slower on deep pages; keyset pagination on the id would be the
  next step for the order and invoice lists.

## Known weak spots at scale

- `api_orders` with the `open` filter and `vw_order_overview` filter on the status **name**, which
  needs the join to `OrderStatus`; the planner can use `idx_order_status` only after resolving it.
- `fn_calculate_order_total` is called once per row on the order list (limited to the page).
- `vw_revenue_per_waiter` (a graded view, left untouched) aggregates all invoices on every call.
