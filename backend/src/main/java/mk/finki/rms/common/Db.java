package mk.finki.rms.common;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** Thin wrapper over JdbcClient for the views, functions and procedures the app calls. */
@Component
public class Db {

    public static final int MAX_PAGE_SIZE = 200;

    private final JdbcClient jdbc;

    public Db(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<Map<String, Object>> list(String sql, Map<String, Object> params) {
        return jdbc.sql(sql).params(params).query(Rows.MAPPER).list();
    }

    public List<Map<String, Object>> list(String sql) {
        return list(sql, Params.of());
    }

    public Optional<Map<String, Object>> first(String sql, Map<String, Object> params) {
        return list(sql, params).stream().findFirst();
    }

    public Map<String, Object> one(String sql, Map<String, Object> params, String notFoundMessage) {
        return first(sql, params).orElseThrow(() -> new NotFoundException(notFoundMessage));
    }

    public <T> T scalar(String sql, Map<String, Object> params, Class<T> type) {
        return jdbc.sql(sql).params(params).query(type).single();
    }

    public int update(String sql, Map<String, Object> params) {
        return jdbc.sql(sql).params(params).update();
    }

    /** Runs CALL sp_...(...); a RAISE EXCEPTION surfaces as a DataAccessException. */
    public void call(String sql, Map<String, Object> params) {
        jdbc.sql(sql).params(params).update();
    }

    /** The SQL must carry its own ORDER BY; LIMIT/OFFSET are appended here. */
    public PageResult page(String sql, Map<String, Object> params, int page, int size) {
        return pageWithLimit(sql + " LIMIT :_limit OFFSET :_offset", params, page, size);
    }

    /** For SQL that places LIMIT :_limit OFFSET :_offset itself (e.g. inside a subquery). */
    public PageResult pageWithLimit(String sql, Map<String, Object> params, int page, int size) {
        int safeSize = Math.max(1, Math.min(size, MAX_PAGE_SIZE));
        int safePage = Math.max(0, page);
        Params all = Params.of();
        all.putAll(params);
        all.and("_limit", safeSize + 1).and("_offset", (long) safePage * safeSize);
        List<Map<String, Object>> rows = list(sql, all);
        boolean hasMore = rows.size() > safeSize;
        return new PageResult(hasMore ? rows.subList(0, safeSize) : rows, safePage, safeSize, hasMore);
    }
}
