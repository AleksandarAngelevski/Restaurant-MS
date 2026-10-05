package mk.finki.rms.inventory;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import mk.finki.rms.common.Db;
import mk.finki.rms.common.PageResult;
import mk.finki.rms.common.Params;
import mk.finki.rms.common.Roles;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Reading stock is open to management; changing it is an Admin task. */
@RestController
@RequestMapping("/api/inventory")
@PreAuthorize(Roles.MANAGEMENT)
public class InventoryController {

    private final Db db;
    private final int defaultThreshold;

    public InventoryController(Db db, @Value("${app.low-stock-threshold}") int defaultThreshold) {
        this.db = db;
        this.defaultThreshold = defaultThreshold;
    }

    public record QuantityRequest(@NotNull @Min(0) Integer quantity) {
    }

    @GetMapping
    public PageResult list(@RequestParam(defaultValue = "") String search,
                           @RequestParam(defaultValue = "false") boolean stockedOnly,
                           @RequestParam(defaultValue = "0") int page,
                           @RequestParam(defaultValue = "25") int size) {
        return db.page("""
                SELECT * FROM api_inventory
                WHERE product ILIKE :search AND (NOT :stocked OR stocked)
                ORDER BY product
                """, Params.of("search", "%" + search.trim() + "%").and("stocked", stockedOnly), page, size);
    }

    @PostMapping("/{productId}/restock")
    @PreAuthorize(Roles.ADMIN)
    @Transactional
    public void restock(@PathVariable int productId, @Valid @RequestBody QuantityRequest r) {
        db.call("CALL sp_restock_product(:product, :quantity)",
                Params.of("product", productId).and("quantity", r.quantity()));
    }

    /** Manual correction to an absolute quantity, logged as Manual Adjustment Up/Down. */
    @PostMapping("/{productId}/adjust")
    @PreAuthorize(Roles.ADMIN)
    @Transactional
    public void adjust(@PathVariable int productId, @Valid @RequestBody QuantityRequest r) {
        db.call("CALL sp_adjust_stock(:product, :quantity)",
                Params.of("product", productId).and("quantity", r.quantity()));
    }

    @GetMapping("/low-stock")
    public Map<String, Object> lowStock(@RequestParam(required = false) Integer threshold) {
        int effective = threshold == null ? defaultThreshold : threshold;
        List<Map<String, Object>> items = db.list("""
                SELECT Product AS product, ProductType AS product_type, Quantity AS quantity, BaseUnit AS base_unit
                FROM fn_low_stock_report(:threshold)
                """, Params.of("threshold", effective));
        return Map.of("threshold", effective, "items", items);
    }

    @GetMapping("/history")
    public PageResult history(@RequestParam(required = false) Integer productId,
                              @RequestParam(required = false) Integer changeTypeId,
                              @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                              @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                              @RequestParam(defaultValue = "0") int page,
                              @RequestParam(defaultValue = "25") int size) {
        return db.page("""
                SELECT * FROM api_stock_history
                WHERE (CAST(:product AS INT4) IS NULL OR product_id = CAST(:product AS INT4))
                  AND (CAST(:type AS INT4) IS NULL OR change_type_id = CAST(:type AS INT4))
                  AND (CAST(:from AS DATE) IS NULL OR logged_at >= CAST(:from AS DATE))
                  AND (CAST(:to AS DATE) IS NULL OR logged_at < CAST(:to AS DATE) + 1)
                ORDER BY logged_at DESC, log_id DESC
                """, Params.of("product", productId).and("type", changeTypeId).and("from", from).and("to", to),
                page, size);
    }
}
