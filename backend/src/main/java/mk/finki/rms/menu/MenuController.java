package mk.finki.rms.menu;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import mk.finki.rms.common.Db;
import mk.finki.rms.common.NotFoundException;
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
import org.springframework.web.bind.annotation.RestController;

/** Menus and their members (a MenuItem placed on a menu at a price). */
@RestController
@RequestMapping("/api")
@PreAuthorize(Roles.MANAGEMENT)
public class MenuController {

    private final Db db;

    public MenuController(Db db) {
        this.db = db;
    }

    public record MenuRequest(@NotBlank @Size(max = 30) String name, @NotNull Boolean active,
                              @Size(max = 255) String wallpaper, @NotNull Integer typeId) {
    }

    public record MemberRequest(@NotNull Integer menuItemId, @NotNull @DecimalMin("0") BigDecimal price,
                                @NotNull Integer typeId) {
    }

    public record MemberUpdateRequest(@NotNull @DecimalMin("0") BigDecimal price, @NotNull Integer typeId) {
    }

    @GetMapping("/menus")
    public List<Map<String, Object>> menus() {
        return db.list("""
                SELECT m.Id AS id, m.Name AS name, m.Active AS active, m.Wallpaper AS wallpaper,
                       m.TypeId AS type_id, mt.Type AS type,
                       (SELECT COUNT(*) FROM MenuMember mm WHERE mm.MenuId = m.Id)::INT4 AS items
                FROM Menu m JOIN MenuType mt ON mt.Id = m.TypeId
                ORDER BY m.Id
                """);
    }

    @PostMapping("/menus")
    @Transactional
    public void createMenu(@Valid @RequestBody MenuRequest r) {
        db.update("INSERT INTO Menu (Name, Active, Wallpaper, TypeId) VALUES (:name, :active, :wallpaper, :type)",
                menuParams(r));
    }

    @PutMapping("/menus/{id}")
    @Transactional
    public void updateMenu(@PathVariable int id, @Valid @RequestBody MenuRequest r) {
        requireRow(db.update("""
                UPDATE Menu SET Name = :name, Active = :active, Wallpaper = :wallpaper, TypeId = :type
                WHERE Id = :id
                """, menuParams(r).and("id", id)), "Menu " + id);
    }

    @DeleteMapping("/menus/{id}")
    @Transactional
    public void deleteMenu(@PathVariable int id) {
        requireRow(db.update("DELETE FROM Menu WHERE Id = :id", Params.of("id", id)), "Menu " + id);
    }

    @GetMapping("/menus/{id}/members")
    public List<Map<String, Object>> members(@PathVariable int id) {
        return db.list("SELECT * FROM api_menu_members WHERE menu_id = :id ORDER BY product", Params.of("id", id));
    }

    /** Products that can be sold (MenuItem specialisation). */
    @GetMapping("/menu-items")
    public List<Map<String, Object>> menuItems() {
        return db.list("SELECT id, name, type FROM api_products WHERE menu_item ORDER BY name");
    }

    @PostMapping("/menus/{id}/members")
    @Transactional
    public void addMember(@PathVariable int id, @Valid @RequestBody MemberRequest r) {
        db.update("INSERT INTO MenuMember (MenuItemId, Price, TypeId, MenuId) VALUES (:item, :price, :type, :menu)",
                Params.of("item", r.menuItemId()).and("price", r.price()).and("type", r.typeId()).and("menu", id));
    }

    @PutMapping("/menu-members/{id}/{menuItemId}")
    @Transactional
    public void updateMember(@PathVariable int id, @PathVariable int menuItemId,
                             @Valid @RequestBody MemberUpdateRequest r) {
        requireRow(db.update("""
                UPDATE MenuMember SET Price = :price, TypeId = :type
                WHERE Id = :id AND MenuItemId = :item
                """, Params.of("id", id).and("item", menuItemId).and("price", r.price()).and("type", r.typeId())),
                "Menu member");
    }

    @DeleteMapping("/menu-members/{id}/{menuItemId}")
    @Transactional
    public void deleteMember(@PathVariable int id, @PathVariable int menuItemId) {
        requireRow(db.update("DELETE FROM MenuMember WHERE Id = :id AND MenuItemId = :item",
                Params.of("id", id).and("item", menuItemId)), "Menu member");
    }

    private static Params menuParams(MenuRequest r) {
        return Params.of("name", r.name().trim())
                .and("active", r.active())
                .and("wallpaper", r.wallpaper() == null || r.wallpaper().isBlank() ? null : r.wallpaper().trim())
                .and("type", r.typeId());
    }

    private static void requireRow(int rows, String what) {
        if (rows == 0) {
            throw new NotFoundException(what + " does not exist");
        }
    }
}
