package mk.finki.rms.reservations;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import mk.finki.rms.common.CurrentUser;
import mk.finki.rms.common.Db;
import mk.finki.rms.common.NotFoundException;
import mk.finki.rms.common.PageResult;
import mk.finki.rms.common.Params;
import mk.finki.rms.common.Roles;
import org.springframework.format.annotation.DateTimeFormat;
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
@RequestMapping("/api/reservations")
@PreAuthorize(Roles.RESERVATIONS)
public class ReservationController {

    private final Db db;

    public ReservationController(Db db) {
        this.db = db;
    }

    public record ReservationRequest(@NotBlank @Size(max = 50) String guestName,
                                     @Size(max = 50) String guestPhone,
                                     @NotNull LocalDate date,
                                     @NotNull LocalTime startTime,
                                     @NotNull LocalTime endTime,
                                     @NotNull Integer tableNumber) {
    }

    @GetMapping("/availability")
    public List<Map<String, Object>> availability(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime start,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime end,
            @RequestParam(defaultValue = "1") int guests) {
        return db.list("""
                SELECT TableNumber AS table_number, Capacity AS capacity, TableType AS table_type
                FROM fn_get_available_tables(:date, :start, :end, :guests)
                """, Params.of("date", date).and("start", start).and("end", end).and("guests", guests));
    }

    @GetMapping("/today")
    @PreAuthorize(Roles.FLOOR_OR_HOST)
    public List<Map<String, Object>> today() {
        return db.list("""
                SELECT ReservationId AS id, GuestName AS guest_name, GuestPhone AS guest_phone,
                       StartTime AS start_time, EndTime AS end_time, TableNumber AS table_number,
                       Capacity AS capacity, HandledBy AS handled_by
                FROM vw_todays_reservations
                """);
    }

    /** Day view. */
    @GetMapping
    public PageResult byDate(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                             @RequestParam(defaultValue = "0") int page,
                             @RequestParam(defaultValue = "100") int size) {
        return db.page("SELECT * FROM api_reservations WHERE reservation_date = :date ORDER BY start_time, table_number",
                Params.of("date", date), page, size);
    }

    @PostMapping
    @Transactional
    public void create(@Valid @RequestBody ReservationRequest r) {
        db.call("CALL sp_create_reservation(:name, :phone, :date, :start, :end, :table, :employee)",
                Params.of("name", r.guestName().trim())
                        .and("phone", blankToNull(r.guestPhone()))
                        .and("date", r.date())
                        .and("start", r.startTime())
                        .and("end", r.endTime())
                        .and("table", r.tableNumber())
                        .and("employee", CurrentUser.id()));
    }

    /** No procedure exists for edits; the no_overlap exclusion constraint still rejects double bookings. */
    @PutMapping("/{id}")
    @Transactional
    public void update(@PathVariable int id, @Valid @RequestBody ReservationRequest r) {
        int rows = db.update("""
                UPDATE Reservation
                SET GuestName = :name, GuestPhone = :phone, "Date" = :date,
                    StartTime = :start, EndTime = :end, TableNumber = :table
                WHERE Id = :id
                """, Params.of("id", id)
                .and("name", r.guestName().trim())
                .and("phone", blankToNull(r.guestPhone()))
                .and("date", r.date())
                .and("start", r.startTime())
                .and("end", r.endTime())
                .and("table", r.tableNumber()));
        if (rows == 0) {
            throw new NotFoundException("Reservation " + id + " does not exist");
        }
    }

    @DeleteMapping("/{id}")
    @Transactional
    public void cancel(@PathVariable int id) {
        if (db.update("DELETE FROM Reservation WHERE Id = :id", Params.of("id", id)) == 0) {
            throw new NotFoundException("Reservation " + id + " does not exist");
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
