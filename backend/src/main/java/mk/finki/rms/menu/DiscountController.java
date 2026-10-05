package mk.finki.rms.menu;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import mk.finki.rms.common.Db;
import mk.finki.rms.common.NotFoundException;
import mk.finki.rms.common.PageResult;
import mk.finki.rms.common.Params;
import mk.finki.rms.common.Roles;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/discounts")
@PreAuthorize(Roles.MANAGEMENT)
public class DiscountController {

    private final Db db;

    public DiscountController(Db db) {
        this.db = db;
    }

    public record DiscountRequest(@NotNull Integer menuId, @NotBlank @Size(max = 30) String name,
                                  @NotNull BigDecimal percent, @NotNull LocalDate from, @NotNull LocalDate to) {
    }

    public record StatusRequest(@NotNull Boolean status) {
    }

    @GetMapping
    public PageResult list(@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
        return db.page("SELECT * FROM api_discounts ORDER BY id DESC", Params.of(), page, size);
    }

    @GetMapping("/{id}/items")
    public List<Map<String, Object>> items(@PathVariable int id) {
        return db.list("SELECT * FROM api_discount_items WHERE discount_id = :id ORDER BY product", Params.of("id", id));
    }

    @PostMapping
    @Transactional
    public void create(@Valid @RequestBody DiscountRequest r) {
        db.call("CALL sp_apply_discount_to_menu(:menu, :name, :pct, :from, :to)",
                Params.of("menu", r.menuId())
                        .and("name", r.name().trim())
                        .and("pct", r.percent())
                        .and("from", r.from())
                        .and("to", r.to()));
    }

    @PutMapping("/{id}/status")
    @Transactional
    public void toggle(@PathVariable int id, @Valid @RequestBody StatusRequest r) {
        if (db.update("UPDATE Discount SET Status = :status WHERE Id = :id",
                Params.of("id", id).and("status", r.status())) == 0) {
            throw new NotFoundException("Discount " + id + " does not exist");
        }
    }

    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable int id) {
        if (db.update("DELETE FROM Discount WHERE Id = :id", Params.of("id", id)) == 0) {
            throw new NotFoundException("Discount " + id + " does not exist");
        }
    }
}
