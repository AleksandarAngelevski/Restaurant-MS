package mk.finki.rms.common;

import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

import org.postgresql.util.PSQLException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

/**
 * The database owns the business rules, so its errors are client errors:
 * RAISE EXCEPTION (P0001) becomes 422 and constraint violations (class 23) become 409,
 * both carrying the Postgres message.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<Map<String, Object>> database(DataAccessException ex) {
        SQLException sql = findSqlException(ex);
        if (sql == null || sql.getSQLState() == null) {
            log.error("Database error", ex);
            return error(HttpStatus.INTERNAL_SERVER_ERROR, "Database error", null);
        }
        String state = sql.getSQLState();
        String message = serverMessage(sql);
        if ("P0001".equals(state) || state.startsWith("22")) {
            return error(HttpStatus.UNPROCESSABLE_ENTITY, message, state);
        }
        if (state.startsWith("23")) {
            return error(HttpStatus.CONFLICT, friendlyConstraintMessage(state, message), state);
        }
        log.error("Database error {}", state, ex);
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "Database error", state);
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<Map<String, Object>> notFound(NotFoundException ex) {
        return error(HttpStatus.NOT_FOUND, ex.getMessage(), null);
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> status(ResponseStatusException ex) {
        return error(HttpStatus.valueOf(ex.getStatusCode().value()), ex.getReason(), null);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> invalid(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(f -> f.getField() + " " + f.getDefaultMessage())
                .collect(Collectors.joining("; "));
        return error(HttpStatus.BAD_REQUEST, message, null);
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class,
            IllegalArgumentException.class})
    public ResponseEntity<Map<String, Object>> badRequest(Exception ex) {
        String message = ex instanceof IllegalArgumentException ? ex.getMessage() : "Malformed request";
        return error(HttpStatus.BAD_REQUEST, message, null);
    }

    private static String friendlyConstraintMessage(String state, String message) {
        return switch (state) {
            case "23P01" -> "That table is already reserved in the requested time slot";
            case "23503" -> message.contains("is still referenced")
                    ? "It is still used by other records and cannot be deleted"
                    : "A referenced record does not exist";
            case "23505" -> "A record with the same unique value already exists";
            default -> message;
        };
    }

    private static SQLException findSqlException(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause()) {
            if (t instanceof SQLException sql) {
                return sql;
            }
        }
        return null;
    }

    private static String serverMessage(SQLException ex) {
        if (ex instanceof PSQLException pg && pg.getServerErrorMessage() != null
                && pg.getServerErrorMessage().getMessage() != null) {
            return pg.getServerErrorMessage().getMessage();
        }
        return ex.getMessage();
    }

    private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String message, String sqlState) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", status.value());
        body.put("message", message);
        if (sqlState != null) {
            body.put("sqlState", sqlState);
        }
        return ResponseEntity.status(status).body(body);
    }
}
