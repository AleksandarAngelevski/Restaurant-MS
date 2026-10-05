package mk.finki.rms.analytics;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import mk.finki.rms.common.Db;
import mk.finki.rms.common.PageResult;
import mk.finki.rms.common.Params;
import mk.finki.rms.common.Roles;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Dashboard queries. Date-ranged aggregates read the mv_* materialized views
 * (refreshed on a schedule), so they stay fast over millions of orders.
 */
@RestController
@RequestMapping("/api/analytics")
@PreAuthorize(Roles.MANAGEMENT)
public class AnalyticsController {

    private static final String RANGE = " day BETWEEN :from AND :to ";

    private final Db db;

    public AnalyticsController(Db db) {
        this.db = db;
    }

    @PostMapping("/refresh")
    public void refresh() {
        db.call("CALL sp_refresh_analytics()", Params.of());
    }

    @GetMapping("/revenue-per-waiter")
    public List<Map<String, Object>> revenuePerWaiter() {
        return db.list("""
                SELECT Waiter AS waiter, TotalOrders AS total_orders, TotalRevenue AS total_revenue,
                       round(AvgOrderValue, 2) AS avg_order_value
                FROM vw_revenue_per_waiter ORDER BY TotalRevenue DESC LIMIT 50
                """);
    }

    @GetMapping("/invoices")
    public PageResult invoices(@RequestParam(defaultValue = "0") int page,
                               @RequestParam(defaultValue = "25") int size) {
        return db.page("""
                SELECT InvoiceId AS invoice_id, OrderId AS order_id, Waiter AS waiter, InvoiceDate AS invoice_date,
                       TotalAmount AS total_amount, TaxAmount AS tax_amount, NetAmount AS net_amount
                FROM vw_invoice_summary ORDER BY InvoiceId DESC
                """, Params.of(), page, size);
    }

    /** Everything the dashboard charts need for one date range. */
    @GetMapping("/dashboard")
    public Map<String, Object> dashboard(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "day") String bucket,
            @RequestParam(required = false) String stockProduct) {
        LocalDate end = to == null ? LocalDate.now() : to;
        LocalDate start = from == null ? end.minusDays(29) : from;
        String trunc = "week".equals(bucket) ? "week" : "day";
        Params range = Params.of("from", start).and("to", end);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("from", start);
        result.put("to", end);
        result.put("bucket", trunc);

        result.put("summary", db.one("""
                SELECT COALESCE(SUM(revenue), 0) AS revenue, COALESCE(SUM(tax), 0) AS tax,
                       COALESCE(SUM(invoices), 0)::INT4 AS invoices,
                       COALESCE(round(SUM(revenue) / NULLIF(SUM(invoices), 0), 2), 0) AS avg_order_value
                FROM mv_sales_daily WHERE""" + RANGE, range, "No data"));

        result.put("sales", db.list("""
                SELECT date_trunc('%s', day)::DATE AS bucket, SUM(revenue) AS revenue, SUM(invoices)::INT4 AS invoices
                FROM mv_sales_daily WHERE %s GROUP BY 1 ORDER BY 1
                """.formatted(trunc, RANGE), range));

        result.put("byOrderType", db.list("""
                SELECT order_type, SUM(revenue) AS revenue, SUM(invoices)::INT4 AS invoices
                FROM mv_sales_daily WHERE""" + RANGE + "GROUP BY order_type ORDER BY revenue DESC", range));

        result.put("topItems", db.list("""
                SELECT product, SUM(quantity)::INT4 AS quantity, SUM(revenue) AS revenue
                FROM mv_item_sales_daily WHERE""" + RANGE + "GROUP BY product ORDER BY quantity DESC, product LIMIT 10",
                range));

        result.put("busiestHours", db.list("""
                SELECT hour, SUM(orders)::INT4 AS orders
                FROM mv_order_activity WHERE""" + RANGE + "GROUP BY hour ORDER BY hour", range));

        result.put("busiestTables", db.list("""
                SELECT table_number, SUM(orders)::INT4 AS orders
                FROM mv_order_activity WHERE table_number > 0 AND""" + RANGE
                + "GROUP BY table_number ORDER BY orders DESC, table_number LIMIT 10", range));

        List<Map<String, Object>> usage = db.list("""
                SELECT product, unit, SUM(amount)::INT8 AS amount
                FROM mv_stock_usage_daily WHERE NOT positive AND""" + RANGE
                + "GROUP BY product, unit ORDER BY amount DESC, product LIMIT 10", range);
        result.put("stockUsage", usage);

        // amounts of different products are in different units, so the daily series is per product
        String product = stockProduct != null && !stockProduct.isBlank() ? stockProduct
                : usage.isEmpty() ? null : (String) usage.get(0).get("product");
        result.put("stockProduct", product);
        result.put("stockUsageDaily", product == null ? List.of() : db.list("""
                SELECT day, COALESCE(SUM(amount) FILTER (WHERE NOT positive), 0)::INT8 AS consumed,
                       COALESCE(SUM(amount) FILTER (WHERE positive), 0)::INT8 AS received
                FROM mv_stock_usage_daily WHERE product = :product AND""" + RANGE + "GROUP BY day ORDER BY day",
                Params.of("from", start).and("to", end).and("product", product)));

        return result;
    }
}
