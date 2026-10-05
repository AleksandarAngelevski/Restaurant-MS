package mk.finki.rms.menu;

import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import mk.finki.rms.common.Db;
import mk.finki.rms.common.NotFoundException;
import mk.finki.rms.common.PageResult;
import mk.finki.rms.common.Params;
import mk.finki.rms.common.Roles;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.server.ResponseStatusException;
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

/** Products, the MenuItem specialisation and recipes (ConsistsOf). */
@RestController
@RequestMapping("/api/products")
@PreAuthorize(Roles.MANAGEMENT)
public class ProductController {

    private final Db db;

    public ProductController(Db db) {
        this.db = db;
    }

    public record ProductRequest(@NotBlank @Size(max = 30) String name, @Size(max = 255) String url,
                                 @NotNull Integer typeId, @NotNull Integer baseUnitId, boolean menuItem) {
    }

    public record RecipeLineRequest(@NotNull @Min(1) Integer amount, @NotNull Integer unitId) {
    }

    @GetMapping
    public PageResult list(@RequestParam(defaultValue = "") String search,
                           @RequestParam(defaultValue = "0") int page,
                           @RequestParam(defaultValue = "25") int size) {
        return db.page("SELECT * FROM api_products WHERE name ILIKE :search ORDER BY name",
                Params.of("search", "%" + search.trim() + "%"), page, size);
    }

    @PostMapping
    @Transactional
    public void create(@Valid @RequestBody ProductRequest r) {
        Integer id = db.scalar("""
                INSERT INTO Product (Name, Url, TypeId, BaseUnitId) VALUES (:name, :url, :type, :unit) RETURNING Id
                """, params(r), Integer.class);
        setMenuItem(id, r.menuItem());
    }

    @PutMapping("/{id}")
    @Transactional
    public void update(@PathVariable int id, @Valid @RequestBody ProductRequest r) {
        if (db.update("UPDATE Product SET Name = :name, Url = :url, TypeId = :type, BaseUnitId = :unit WHERE Id = :id",
                params(r).and("id", id)) == 0) {
            throw new NotFoundException("Product " + id + " does not exist");
        }
        setMenuItem(id, r.menuItem());
    }

    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable int id) {
        requireNotOnMenu(id);
        db.update("DELETE FROM MenuItem WHERE Id = :id", Params.of("id", id));
        db.update("DELETE FROM StoredProduct WHERE ProductId = :id AND Quantity = 0", Params.of("id", id));
        if (db.update("DELETE FROM Product WHERE Id = :id", Params.of("id", id)) == 0) {
            throw new NotFoundException("Product " + id + " does not exist");
        }
    }

    @GetMapping("/{id}/recipe")
    public List<Map<String, Object>> recipe(@PathVariable int id) {
        return db.list("SELECT * FROM api_recipes WHERE parent_id = :id ORDER BY component", Params.of("id", id));
    }

    /** Adds the component to the recipe or changes its amount/unit. */
    @PutMapping("/{id}/recipe/{componentId}")
    @Transactional
    public void putRecipeLine(@PathVariable int id, @PathVariable int componentId,
                              @Valid @RequestBody RecipeLineRequest r) {
        if (id == componentId) {
            throw new IllegalArgumentException("A product cannot be a component of itself");
        }
        db.update("""
                INSERT INTO ConsistsOf (Parent, Component, Amount, UnitId) VALUES (:parent, :component, :amount, :unit)
                ON CONFLICT (Parent, Component) DO UPDATE SET Amount = EXCLUDED.Amount, UnitId = EXCLUDED.UnitId
                """, Params.of("parent", id).and("component", componentId)
                .and("amount", r.amount()).and("unit", r.unitId()));
    }

    @DeleteMapping("/{id}/recipe/{componentId}")
    @Transactional
    public void deleteRecipeLine(@PathVariable int id, @PathVariable int componentId) {
        db.update("DELETE FROM ConsistsOf WHERE Parent = :parent AND Component = :component",
                Params.of("parent", id).and("component", componentId));
    }

    private void setMenuItem(int id, boolean sellable) {
        if (sellable) {
            db.update("INSERT INTO MenuItem (Id) VALUES (:id) ON CONFLICT (Id) DO NOTHING", Params.of("id", id));
        } else {
            requireNotOnMenu(id);
            db.update("DELETE FROM MenuItem WHERE Id = :id", Params.of("id", id));
        }
    }

    /** MenuMember rows cascade from MenuItem, so never drop a MenuItem that is still on a menu. */
    private void requireNotOnMenu(int id) {
        if (db.scalar("SELECT EXISTS (SELECT 1 FROM MenuMember WHERE MenuItemId = :id)",
                Params.of("id", id), Boolean.class)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "The product is still on a menu; remove it from all menus first");
        }
    }

    private static Params params(ProductRequest r) {
        return Params.of("name", r.name().trim())
                .and("url", r.url() == null || r.url().isBlank() ? null : r.url().trim())
                .and("type", r.typeId())
                .and("unit", r.baseUnitId());
    }
}
