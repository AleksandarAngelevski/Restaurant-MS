# REST API

All endpoints are under `/api` and exchange JSON. Except for login and health, every request
needs `Authorization: Bearer <token>`.

## Conventions

- **Errors** are `{ "status": 422, "message": "...", "sqlState": "P0001" }`.
  - `422` — a database rule said no (`RAISE EXCEPTION`); `message` is the Postgres text.
  - `409` — a constraint was violated (duplicate, still referenced, overlapping reservation).
  - `400` invalid request, `401` not signed in, `403` role not allowed, `404` not found.
- **Paging**: `?page=0&size=25` (size is capped at 200). Paged responses are
  `{ "items": [...], "page": 0, "size": 25, "hasMore": true }`.
- **Money** is MKD as JSON numbers with two decimals (`NUMERIC` in the database, `BigDecimal` in Java).
- **Dates and times** are ISO strings: `2026-10-05`, `19:30:00`, `2026-10-05T19:30:00`.

## Roles

Access is decided by role name (`EmployeeType.Type`, upper-cased), not by `Permissions`.

| Group | Roles |
|---|---|
| Floor | WAITER, MANAGER, SUPERVISOR, ADMIN |
| Kitchen | KITCHEN, MANAGER, SUPERVISOR, ADMIN |
| Reservations | HOST, MANAGER, SUPERVISOR, ADMIN |
| Management | MANAGER, SUPERVISOR, ADMIN |
| Staff overview | SUPERVISOR, ADMIN |
| Admin | ADMIN |

A waiter only sees and changes their own orders; management sees all of them.

## Auth

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/auth/login` | public | `{email, password}` → `{token, user: {id, name, email, roles}}`. Resigned employees get 401. |
| GET | `/auth/me` | any | Current user. |
| GET | `/health` | public | `{status: "UP"}` |

## Orders (waiter)

| Method | Path | Access | Backed by |
|---|---|---|---|
| GET | `/tables` | Floor + HOST | `api_tables` (includes `openOrderId`) |
| GET | `/menu/active` | Floor | `api_menu_members` of active menus, with `discountedPrice` |
| GET | `/orders?state=open\|closed\|all&mine=&page=` | Floor | `api_orders` + `fn_calculate_order_total` |
| POST | `/orders` | Floor | `sp_create_order` — `{orderTypeId, tableNumber?}` |
| GET | `/orders/{id}` | Floor | `{order, items, total, invoice}` |
| POST | `/orders/{id}/items` | Floor | `sp_add_order_item` — `{menuMemberId, menuItemId, quantity}` |
| POST | `/orders/{id}/serve` | Floor | `sp_mark_order_served` |
| POST | `/orders/{id}/close` | Floor | `sp_close_order_and_invoice` (tax rate from `TAX_RATE`, default 0.18) |
| POST | `/orders/{id}/cancel` | Floor | `sp_cancel_order` — `{reason}` |

## Kitchen

| Method | Path | Backed by |
|---|---|---|
| GET | `/kitchen/queue` | `api_kitchen_queue`, oldest order first |
| POST | `/kitchen/items/{id}/finish` | `UPDATE OrderItem SET Finished = TRUE, CreatedBy = :me`; returns `{warnings: [...]}` with the stock warnings raised by the inventory trigger |

## Reservations

| Method | Path | Backed by |
|---|---|---|
| GET | `/reservations/availability?date=&start=&end=&guests=` | `fn_get_available_tables` |
| GET | `/reservations/today` (also Floor) | `vw_todays_reservations` |
| GET | `/reservations?date=` | `api_reservations` |
| POST | `/reservations` | `sp_create_reservation` — `{guestName, guestPhone?, date, startTime, endTime, tableNumber}` |
| PUT | `/reservations/{id}` | direct update; the `no_overlap` constraint rejects double bookings (409) |
| DELETE | `/reservations/{id}` | cancel |

## Menus, discounts, products (Management)

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/menus` | `{name, active, wallpaper?, typeId}` |
| PUT/DELETE | `/menus/{id}` | |
| GET/POST | `/menus/{id}/members` | add: `{menuItemId, price, typeId}` |
| PUT/DELETE | `/menu-members/{id}/{menuItemId}` | composite key; update: `{price, typeId}` |
| GET | `/menu-items` | sellable products |
| GET/POST | `/discounts` | create calls `sp_apply_discount_to_menu` — `{menuId, name, percent, from, to}` |
| PUT | `/discounts/{id}/status` | `{status}` |
| GET | `/discounts/{id}/items` | discounted prices |
| DELETE | `/discounts/{id}` | |
| GET/POST | `/products?search=` | `{name, url?, typeId, baseUnitId, menuItem}` |
| PUT/DELETE | `/products/{id}` | a product still on a menu cannot be deleted or un-marked as sellable (409) |
| GET | `/products/{id}/recipe` | `ConsistsOf` lines |
| PUT/DELETE | `/products/{id}/recipe/{componentId}` | put: `{amount, unitId}` |

## Inventory

| Method | Path | Access | Backed by |
|---|---|---|---|
| GET | `/inventory?search=&stockedOnly=` | Management | `api_inventory` |
| POST | `/inventory/{productId}/restock` | Admin | `sp_restock_product` — `{quantity}` |
| POST | `/inventory/{productId}/adjust` | Admin | `sp_adjust_stock` — `{quantity}` is the new absolute stock |
| GET | `/inventory/low-stock?threshold=` | Management | `fn_low_stock_report` (default `LOW_STOCK_THRESHOLD`) |
| GET | `/inventory/history?productId=&changeTypeId=&from=&to=` | Management | `api_stock_history` |

## Staff and set-up

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/staff` | Staff overview | `vw_active_staff` |
| GET/POST | `/employees?search=&activeOnly=` | Admin | `{firstName, lastName, ssn, sex, email, password, dateEmployment, dateResignation?, roleIds}` |
| PUT/DELETE | `/employees/{id}` | Admin | empty `password` keeps the current one |
| POST | `/tables` | Admin | `{capacity, tableTypeId}` |
| PUT/DELETE | `/tables/{tableNumber}` | Admin | occupied tables cannot be deleted |
| GET | `/lookups/{name}` | any | `{id, label, ...}` |
| POST | `/lookups/{name}` | Admin | `{label, ...extras}` |
| PUT/DELETE | `/lookups/{name}/{id}` | Admin | values in use cannot be deleted (409) |

Lookup names: `table-types`, `order-types`, `order-statuses`, `menu-types`, `menu-member-types`,
`product-types`, `employee-types` (+`permissions`), `unit-types`, `units` (+`conversionToBase`,
`typeid`), `change-types` (+`sign`), `locations`.

## Analytics (Management)

| Method | Path | Backed by |
|---|---|---|
| GET | `/analytics/dashboard?from=&to=&bucket=day\|week&stockProduct=` | `mv_*` materialized views: summary, sales over time, by order type, top items, busiest hours and tables, stock usage |
| GET | `/analytics/revenue-per-waiter` | `vw_revenue_per_waiter` |
| GET | `/analytics/invoices` | `vw_invoice_summary` |
| POST | `/analytics/refresh` | `sp_refresh_analytics()` (also runs on a schedule) |
