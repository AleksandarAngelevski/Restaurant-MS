package mk.finki.rms.kitchen;

import java.sql.PreparedStatement;
import java.sql.SQLWarning;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import mk.finki.rms.common.CurrentUser;
import mk.finki.rms.common.Db;
import mk.finki.rms.common.NotFoundException;
import mk.finki.rms.common.Roles;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/kitchen")
@PreAuthorize(Roles.KITCHEN)
public class KitchenController {

    private final Db db;
    private final JdbcTemplate jdbc;

    public KitchenController(Db db, JdbcTemplate jdbc) {
        this.db = db;
        this.jdbc = jdbc;
    }

    /** Unfinished items, oldest order first. The UI groups them by order. */
    @GetMapping("/queue")
    public List<Map<String, Object>> queue() {
        return db.list("SELECT * FROM api_kitchen_queue ORDER BY date_created, order_id, item_id LIMIT 500");
    }

    /**
     * Marks an item as prepared. trg_deduct_inventory_on_item_finish consumes the recipe;
     * its RAISE WARNING messages (insufficient stock) are returned to the kitchen screen.
     */
    @PostMapping("/items/{id}/finish")
    @Transactional
    public Map<String, Object> finish(@PathVariable int id) {
        int me = CurrentUser.id();
        List<String> warnings = new ArrayList<>();
        Integer updated = jdbc.execute(
                "UPDATE OrderItem SET Finished = TRUE, CreatedBy = ? WHERE Id = ? AND Finished = FALSE",
                (PreparedStatement ps) -> {
                    ps.setInt(1, me);
                    ps.setInt(2, id);
                    int rows = ps.executeUpdate();
                    for (SQLWarning w = ps.getWarnings(); w != null; w = w.getNextWarning()) {
                        warnings.add(w.getMessage());
                    }
                    return rows;
                });
        if (updated == null || updated == 0) {
            throw new NotFoundException("Order item " + id + " does not exist or is already finished");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("itemId", id);
        result.put("warnings", warnings);
        return result;
    }
}
