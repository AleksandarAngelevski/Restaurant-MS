# RestaurantMS

Restaurant management system for the FINKI Advanced Databases course (2025/2026): a PostgreSQL
database that owns the business rules, a Spring Boot API that calls its stored procedures, and a
React front end for waiters, kitchen, hosts, managers and admins.

The build spec this was generated from is `RestaurantMS_CLAUDE_BUILD_SPEC.md`.

## Run it

```
cp .env.example .env        # optional: change ports if 5432 / 8080 / 5173 are taken
docker compose up --build
```

Then open http://localhost:5173 (or your `FRONTEND_PORT`).

On first start the backend applies the Flyway migrations and, because `APP_DEMO_SEED=true`, loads
`db/dev/demo_seed.sql`. To start over with a clean database: `docker compose down -v`.

### Demo logins

| Role | E-mail | Password | Lands on |
|---|---|---|---|
| Admin | admin@demo.mk | admin123 | everything |
| Manager | manager@demo.mk | manager123 | orders, menus, discounts, inventory (read), analytics |
| Supervisor | supervisor@demo.mk | supervisor123 | manager screens + staff overview |
| Host | host@demo.mk | host123 | tables, reservations |
| Waiter | waiter@demo.mk | waiter123 | tables, own orders |
| Kitchen | kitchen@demo.mk | kitchen123 | kitchen queue |

`waiter8@demo.mk` has resigned and cannot sign in.

### Walk-through

1. **Waiter**: tap a free table → add items from the menu.
2. **Kitchen**: press *Done* on each item. Stock drops by the recipe and a movement is logged
   (Admin → Inventory → Movements).
3. **Waiter**: *Close & invoice* → invoice with 18% VAT; the table is free again.
4. **Host**: Reservations → find free tables for a slot → book. Table 5 is taken today 19:00–21:00,
   so it is not offered for an overlapping slot.
5. **Manager**: Discounts → *New discount* (20% on a menu) → the next order shows the lower prices.

## Configuration

Environment variables, read by both `docker compose` and the backend:

| Variable | Default | Meaning |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | `localhost`, `5432`, `rms`, `rms`, `rms` | Database. For the university server, point `DB_PORT` at your SSH tunnel (e.g. 5433). |
| `APP_DEMO_SEED` | `true` in compose, `false` otherwise | Load the demo seed when there are no employees. |
| `JWT_SECRET` | dev value | At least 32 bytes. **Change it outside local development.** |
| `TAX_RATE` | `0.18` | Passed to `sp_close_order_and_invoice`. |
| `LOW_STOCK_THRESHOLD` | `500` | Default threshold (base units) for the low-stock badge. |
| `ANALYTICS_REFRESH_MS` | `60000` | How often the analytics materialized views are refreshed. |
| `BACKEND_PORT`, `FRONTEND_PORT` | `8080`, `5173` | Host ports published by compose. |

Do not set `APP_DEMO_SEED=true` against the university database unless it is empty and you want
demo data in it.

## Development without Docker for the app

```
docker compose up -d db

cd backend                      # needs JDK 21+
./mvnw spring-boot:run          # reads DB_* and APP_DEMO_SEED from the environment

cd frontend                     # needs Node 20+
npm install
npm run dev                     # proxies /api to VITE_API_TARGET (default http://localhost:8080)
```

## Tests

```
cd backend && ./mvnw test       # Testcontainers: needs Docker running
```

`DbRulesTest` runs every database rule against a real PostgreSQL 16: closed-order guard, inventory
deduction and logging, discount pricing, invoice totals with tax, reservation overlap, resigned
waiter, cancel frees the table, and more.

```
cd frontend
npx playwright install chromium
BASE_URL=http://localhost:5173 npm run test:e2e    # against a running stack with the demo seed
```

## Layout

```
db/migration/   Flyway: V1 schema, V2 views, V3 functions/procedures/triggers, V4 indexes,
                V5 lookup seed, V6 api_* views and app procedures, V7 analytics materialized views
db/dev/         demo_seed.sql (not a migration)
db/original/    place for the team's original SQL files
backend/        Spring Boot 3 / Java 21, JdbcClient (no JPA), JWT auth
frontend/       React + TypeScript + Vite, MUI, TanStack Query, Recharts
docs/           api.md, query-optimization.md
```

## How it is built

- **The database is the source of truth.** Orders, invoices, reservations, stock and discounts are
  changed only through the `sp_*` procedures and triggers; the backend never re-implements a rule.
  `RAISE EXCEPTION` comes back as HTTP 422 and constraint violations as 409, with the Postgres message.
- **The graded views (`vw_*`) are untouched.** The app reads separate `api_*` views that carry the
  ids the UI needs.
- **Authorisation is by role name**, not by `EmployeeType.Permissions`.
- **Money** is `NUMERIC` in the database and `BigDecimal` in Java.

## Deviations and things to know

- `V3__programming.sql` and `V4__indexes.sql` were written from the spec because the team's
  `FAZA4.sql` and `indexes.pdf` were not available. See `db/original/README.md` to swap them in.
- **Invoice tax** follows the spec literally: `TaxAmount = round(Total × rate, 2)` and
  `Net = Total − Tax`, where Total is the sum of the item prices. For prices that already include
  VAT the usual formula would be `Total × rate / (1 + rate)`.
- `StoredProduct(ProductId)` has a UNIQUE index (one stock row per product).
- Additions beyond the spec, all in `V6`: `sp_adjust_stock` (manual adjustments),
  `sp_mark_order_served`, and `trg_sync_order_status`, which moves an order between
  `In Progress` and `Ready` as the kitchen works.
- A menu item without a recipe deducts nothing from stock when it is finished.
- The cancel reason is not stored: the schema has no column for it, so `sp_cancel_order` only
  raises it as a notice.
- `Location` exists but is unused (reserved for P5 / multi-location).
- Translation is wired (English text is the key; `frontend/src/i18n/mk.json`), but only the
  navigation and a few common labels have Macedonian strings so far.
- Query plans in `docs/query-optimization.md` were taken on the small demo data set, not at the
  target volume.
