package mk.finki.rms.employees;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import mk.finki.rms.common.Db;
import mk.finki.rms.common.NotFoundException;
import mk.finki.rms.common.Params;
import mk.finki.rms.common.Roles;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Restaurant tables set-up (reading them is GET /api/tables in the orders package). */
@RestController
@RequestMapping("/api/tables")
@PreAuthorize(Roles.ADMIN)
public class TableAdminController {

    private final Db db;

    public TableAdminController(Db db) {
        this.db = db;
    }

    public record TableRequest(@NotNull @Min(1) Integer capacity, @NotNull Integer tableTypeId) {
    }

    @PostMapping
    @Transactional
    public void create(@Valid @RequestBody TableRequest r) {
        db.update("INSERT INTO RestaurantTable (Capacity, TableTypeId) VALUES (:capacity, :type)",
                Params.of("capacity", r.capacity()).and("type", r.tableTypeId()));
    }

    @PutMapping("/{tableNumber}")
    @Transactional
    public void update(@PathVariable int tableNumber, @Valid @RequestBody TableRequest r) {
        if (db.update("UPDATE RestaurantTable SET Capacity = :capacity, TableTypeId = :type WHERE TableNumber = :n",
                Params.of("capacity", r.capacity()).and("type", r.tableTypeId()).and("n", tableNumber)) == 0) {
            throw new NotFoundException("Table " + tableNumber + " does not exist");
        }
    }

    @DeleteMapping("/{tableNumber}")
    @Transactional
    public void delete(@PathVariable int tableNumber) {
        if (db.update("DELETE FROM RestaurantTable WHERE TableNumber = :n AND Status = TRUE",
                Params.of("n", tableNumber)) == 0) {
            throw new NotFoundException("Table " + tableNumber + " does not exist or is occupied");
        }
    }
}
