package mk.finki.rms.common;

import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.jdbc.core.RowMapper;

/**
 * Maps a row to a JSON-friendly map: snake_case column labels become camelCase
 * keys and JDBC date/time types become java.time values.
 */
public final class Rows implements RowMapper<Map<String, Object>> {

    public static final Rows MAPPER = new Rows();

    private Rows() {
    }

    @Override
    public Map<String, Object> mapRow(ResultSet rs, int rowNum) throws SQLException {
        ResultSetMetaData meta = rs.getMetaData();
        Map<String, Object> row = new LinkedHashMap<>();
        for (int i = 1; i <= meta.getColumnCount(); i++) {
            row.put(camelCase(meta.getColumnLabel(i)), convert(rs.getObject(i)));
        }
        return row;
    }

    private static Object convert(Object value) {
        if (value instanceof java.sql.Timestamp ts) {
            return ts.toLocalDateTime();
        }
        if (value instanceof java.sql.Date d) {
            return d.toLocalDate();
        }
        if (value instanceof java.sql.Time t) {
            return t.toLocalTime();
        }
        return value;
    }

    static String camelCase(String label) {
        StringBuilder sb = new StringBuilder(label.length());
        boolean upper = false;
        for (char c : label.toCharArray()) {
            if (c == '_') {
                upper = true;
            } else {
                sb.append(upper ? Character.toUpperCase(c) : c);
                upper = false;
            }
        }
        return sb.toString();
    }
}
