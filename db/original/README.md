Optional: drop the team's original files here (`FAZA4.sql`, `indexes.sql`, `schema.sql`, `views.sql`).

They were not available when the project was generated, so `V3__programming.sql` and
`V4__indexes.sql` were written from the build spec. If `FAZA4.sql` is added, replace the
body of `V3__programming.sql` with it (keeping the helper `fn_discounted_price`, which the
`api_*` views in V6 use) and re-run the Testcontainers suite.
