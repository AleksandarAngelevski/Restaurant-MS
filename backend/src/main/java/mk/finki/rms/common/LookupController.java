package mk.finki.rms.common;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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

/**
 * The lookup tables each restaurant customises (table types, order types, menu types...).
 * Every table has an Id, one label column and at most a couple of extra columns.
 */
@RestController
@RequestMapping("/api/lookups")
public class LookupController {

    private enum Kind { INT, BOOL }

    private record Extra(String column, Kind kind) {
    }

    private record Lookup(String table, String labelColumn, List<Extra> extras) {
    }

    // table and column names come only from this whitelist, never from the request
    private static final Map<String, Lookup> LOOKUPS = new LinkedHashMap<>();

    static {
        LOOKUPS.put("table-types", new Lookup("TableType", "Type", List.of()));
        LOOKUPS.put("order-types", new Lookup("OrderType", "Type", List.of()));
        LOOKUPS.put("order-statuses", new Lookup("OrderStatus", "Status", List.of()));
        LOOKUPS.put("menu-types", new Lookup("MenuType", "Type", List.of()));
        LOOKUPS.put("menu-member-types", new Lookup("MenuMemberType", "Type", List.of()));
        LOOKUPS.put("product-types", new Lookup("ProductType", "Type", List.of()));
        LOOKUPS.put("employee-types", new Lookup("EmployeeType", "Type", List.of(new Extra("permissions", Kind.INT))));
        LOOKUPS.put("unit-types", new Lookup("UnitType", "Type", List.of()));
        LOOKUPS.put("units", new Lookup("Unit", "Name",
                List.of(new Extra("conversion_to_base", Kind.INT), new Extra("typeid", Kind.INT))));
        LOOKUPS.put("change-types", new Lookup("ChangeType", "Type", List.of(new Extra("sign", Kind.BOOL))));
        LOOKUPS.put("locations", new Lookup("Location", "Name", List.of()));
    }

    private final Db db;

    public LookupController(Db db) {
        this.db = db;
    }

    /** Readable by all staff: the screens need them for dropdowns. */
    @GetMapping("/{name}")
    public List<Map<String, Object>> list(@PathVariable String name) {
        Lookup lookup = lookup(name);
        StringBuilder sql = new StringBuilder("SELECT Id AS id, " + lookup.labelColumn() + " AS label");
        lookup.extras().forEach(e -> sql.append(", ").append(e.column()).append(" AS ").append(e.column()));
        sql.append(" FROM ").append(lookup.table()).append(" ORDER BY Id");
        return db.list(sql.toString());
    }

    @PostMapping("/{name}")
    @PreAuthorize(Roles.ADMIN)
    @Transactional
    public void create(@PathVariable String name, @RequestBody Map<String, Object> body) {
        Lookup lookup = lookup(name);
        Params params = Params.of("label", label(body));
        StringBuilder columns = new StringBuilder(lookup.labelColumn());
        StringBuilder values = new StringBuilder(":label");
        for (Extra extra : lookup.extras()) {
            Object value = extraValue(extra, body);
            if (value != null) {
                columns.append(", ").append(extra.column());
                values.append(", :").append(extra.column());
                params.and(extra.column(), value);
            }
        }
        db.update("INSERT INTO " + lookup.table() + " (" + columns + ") VALUES (" + values + ")", params);
    }

    @PutMapping("/{name}/{id}")
    @PreAuthorize(Roles.ADMIN)
    @Transactional
    public void update(@PathVariable String name, @PathVariable int id, @RequestBody Map<String, Object> body) {
        Lookup lookup = lookup(name);
        Params params = Params.of("label", label(body)).and("id", id);
        StringBuilder set = new StringBuilder(lookup.labelColumn() + " = :label");
        for (Extra extra : lookup.extras()) {
            Object value = extraValue(extra, body);
            if (value != null) {
                set.append(", ").append(extra.column()).append(" = :").append(extra.column());
                params.and(extra.column(), value);
            }
        }
        if (db.update("UPDATE " + lookup.table() + " SET " + set + " WHERE Id = :id", params) == 0) {
            throw new NotFoundException("Record " + id + " does not exist");
        }
    }

    /** Fails with 409 while the value is still referenced (all lookup FKs are ON DELETE RESTRICT). */
    @DeleteMapping("/{name}/{id}")
    @PreAuthorize(Roles.ADMIN)
    @Transactional
    public void delete(@PathVariable String name, @PathVariable int id) {
        if (db.update("DELETE FROM " + lookup(name).table() + " WHERE Id = :id", Params.of("id", id)) == 0) {
            throw new NotFoundException("Record " + id + " does not exist");
        }
    }

    private static Lookup lookup(String name) {
        Lookup lookup = LOOKUPS.get(name);
        if (lookup == null) {
            throw new NotFoundException("Unknown lookup table: " + name);
        }
        return lookup;
    }

    private static String label(Map<String, Object> body) {
        Object label = body.get("label");
        if (!(label instanceof String s) || s.isBlank()) {
            throw new IllegalArgumentException("label is required");
        }
        return s.trim();
    }

    private static Object extraValue(Extra extra, Map<String, Object> body) {
        Object value = body.get(Rows.camelCase(extra.column()));
        if (value == null || "".equals(value)) {
            return null;
        }
        try {
            return switch (extra.kind()) {
                case INT -> value instanceof Number n ? n.intValue() : Integer.parseInt(value.toString().trim());
                case BOOL -> value instanceof Boolean b ? b : Boolean.parseBoolean(value.toString().trim());
            };
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(extra.column() + " must be a number");
        }
    }
}
