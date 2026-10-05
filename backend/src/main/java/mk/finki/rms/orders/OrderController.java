package mk.finki.rms.orders;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import mk.finki.rms.common.CurrentUser;
import mk.finki.rms.common.Db;
import mk.finki.rms.common.PageResult;
import mk.finki.rms.common.Params;
import mk.finki.rms.common.Roles;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Waiter flow. Every write goes through a stored procedure. */
@RestController
@RequestMapping("/api")
public class OrderController {

    private final Db db;
    private final BigDecimal taxRate;

    public OrderController(Db db, @Value("${app.tax-rate}") BigDecimal taxRate) {
        this.db = db;
        this.taxRate = taxRate;
    }

    public record CreateOrderRequest(@NotNull Integer orderTypeId, Integer tableNumber) {
    }

    public record AddItemRequest(@NotNull Integer menuMemberId, @NotNull Integer menuItemId,
                                 @NotNull @Min(1) Integer quantity) {
    }

    public record CancelRequest(String reason) {
    }

    @GetMapping("/tables")
    @PreAuthorize(Roles.FLOOR_OR_HOST)
    public List<Map<String, Object>> tables() {
        return db.list("SELECT * FROM api_tables ORDER BY table_number");
    }

    /** Active menus with the price a guest pays today (discounted_price is null when not discounted). */
    @GetMapping("/menu/active")
    @PreAuthorize(Roles.FLOOR)
    public List<Map<String, Object>> activeMenu() {
        return db.list("SELECT * FROM api_menu_members WHERE active ORDER BY menu_id, product");
    }

    @GetMapping("/orders")
    @PreAuthorize(Roles.FLOOR)
    public PageResult orders(@RequestParam(defaultValue = "false") boolean mine,
                             @RequestParam(defaultValue = "open") String state,
                             @RequestParam(defaultValue = "0") int page,
                             @RequestParam(defaultValue = "25") int size) {
        // waiters only ever see their own orders
        Integer waiterId = (mine || !seesAllOrders()) ? CurrentUser.id() : null;
        Boolean open = switch (state) {
            case "open" -> Boolean.TRUE;
            case "closed" -> Boolean.FALSE;
            default -> null;
        };
        // the total is only computed for the rows of the requested page
        return db.pageWithLimit("""
                SELECT o.*, fn_calculate_order_total(o.order_id) AS total
                FROM (SELECT * FROM api_orders
                      WHERE (CAST(:waiter AS INT4) IS NULL OR waiter_id = CAST(:waiter AS INT4))
                        AND (CAST(:open AS BOOL) IS NULL OR open = CAST(:open AS BOOL))
                      ORDER BY order_id DESC
                      LIMIT :_limit OFFSET :_offset) o
                ORDER BY o.order_id DESC
                """, Params.of("waiter", waiterId).and("open", open), page, size);
    }

    @PostMapping("/orders")
    @PreAuthorize(Roles.FLOOR)
    @Transactional
    public Map<String, Object> create(@Valid @RequestBody CreateOrderRequest request) {
        Integer orderId = db.scalar("CALL sp_create_order(:waiter, :type, :table, NULL)",
                Params.of("waiter", CurrentUser.id())
                        .and("type", request.orderTypeId())
                        .and("table", request.tableNumber()),
                Integer.class);
        return detail(orderId);
    }

    @GetMapping("/orders/{id}")
    @PreAuthorize(Roles.FLOOR)
    public Map<String, Object> get(@PathVariable int id) {
        return detail(id);
    }

    @PostMapping("/orders/{id}/items")
    @PreAuthorize(Roles.FLOOR)
    @Transactional
    public Map<String, Object> addItem(@PathVariable int id, @Valid @RequestBody AddItemRequest request) {
        requireAccess(id);
        db.call("CALL sp_add_order_item(:order, :member, :item, :quantity, NULL)",
                Params.of("order", id)
                        .and("member", request.menuMemberId())
                        .and("item", request.menuItemId())
                        .and("quantity", request.quantity()));
        return detail(id);
    }

    @PostMapping("/orders/{id}/serve")
    @PreAuthorize(Roles.FLOOR)
    @Transactional
    public Map<String, Object> serve(@PathVariable int id) {
        requireAccess(id);
        db.call("CALL sp_mark_order_served(:order)", Params.of("order", id));
        return detail(id);
    }

    @PostMapping("/orders/{id}/close")
    @PreAuthorize(Roles.FLOOR)
    @Transactional
    public Map<String, Object> close(@PathVariable int id) {
        requireAccess(id);
        db.call("CALL sp_close_order_and_invoice(:order, :rate)", Params.of("order", id).and("rate", taxRate));
        return detail(id);
    }

    @PostMapping("/orders/{id}/cancel")
    @PreAuthorize(Roles.FLOOR)
    @Transactional
    public Map<String, Object> cancel(@PathVariable int id, @RequestBody(required = false) CancelRequest request) {
        requireAccess(id);
        db.call("CALL sp_cancel_order(:order, :reason)",
                Params.of("order", id).and("reason", request == null ? null : request.reason()));
        return detail(id);
    }

    private Map<String, Object> detail(int id) {
        Map<String, Object> order = requireAccess(id);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("order", order);
        result.put("items", db.list("SELECT * FROM api_order_items WHERE order_id = :id ORDER BY id",
                Params.of("id", id)));
        result.put("total", db.scalar("SELECT fn_calculate_order_total(:id)", Params.of("id", id), BigDecimal.class));
        result.put("invoice", invoice(id));
        return result;
    }

    private Map<String, Object> invoice(int orderId) {
        Map<String, Object> invoice = db.first("""
                SELECT InvoiceId AS invoice_id, OrderId AS order_id, Waiter AS waiter, InvoiceDate AS invoice_date,
                       TotalAmount AS total_amount, TaxAmount AS tax_amount, NetAmount AS net_amount
                FROM vw_invoice_summary WHERE OrderId = :id ORDER BY InvoiceId DESC
                """, Params.of("id", orderId)).orElse(null);
        if (invoice != null) {
            invoice.put("items", db.list("SELECT * FROM api_invoice_items WHERE invoice_id = :id ORDER BY id",
                    Params.of("id", invoice.get("invoiceId"))));
        }
        return invoice;
    }

    /** Loads the order and rejects waiters looking at somebody else's order. */
    private Map<String, Object> requireAccess(int id) {
        Map<String, Object> order = db.one("SELECT * FROM api_orders WHERE order_id = :id",
                Params.of("id", id), "Order " + id + " does not exist");
        if (!seesAllOrders() && !Integer.valueOf(CurrentUser.id()).equals(order.get("waiterId"))) {
            throw new AccessDeniedException("This order belongs to another waiter");
        }
        return order;
    }

    private static boolean seesAllOrders() {
        return CurrentUser.hasAnyRole("MANAGER", "SUPERVISOR", "ADMIN");
    }
}
