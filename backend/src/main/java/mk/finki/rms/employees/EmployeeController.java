package mk.finki.rms.employees;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import mk.finki.rms.common.Db;
import mk.finki.rms.common.NotFoundException;
import mk.finki.rms.common.PageResult;
import mk.finki.rms.common.Params;
import mk.finki.rms.common.Roles;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
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
@RequestMapping("/api")
@PreAuthorize(Roles.ADMIN)
public class EmployeeController {

    private final Db db;
    private final PasswordEncoder passwordEncoder;

    public EmployeeController(Db db, PasswordEncoder passwordEncoder) {
        this.db = db;
        this.passwordEncoder = passwordEncoder;
    }

    public record EmployeeRequest(@NotBlank @Size(max = 50) String firstName,
                                  @NotBlank @Size(max = 50) String lastName,
                                  @NotBlank @Size(max = 13) String ssn,
                                  @NotBlank @Pattern(regexp = "[MFO]") String sex,
                                  @NotBlank @Email @Size(max = 100) String email,
                                  @Size(min = 6, max = 72) String password,
                                  @NotNull LocalDate dateEmployment,
                                  LocalDate dateResignation,
                                  @NotNull List<Integer> roleIds) {
    }

    /** Staff overview for supervisors: the graded vw_active_staff view (one row per role). */
    @GetMapping("/staff")
    @PreAuthorize(Roles.STAFF_OVERVIEW)
    public List<Map<String, Object>> activeStaff() {
        return db.list("""
                SELECT Id AS id, FullName AS full_name, Role AS role, Permissions AS permissions,
                       Email AS email, DateEmployment AS date_employment
                FROM vw_active_staff ORDER BY FullName, Role
                """);
    }

    @GetMapping("/employees")
    public PageResult list(@RequestParam(defaultValue = "") String search,
                           @RequestParam(defaultValue = "false") boolean activeOnly,
                           @RequestParam(defaultValue = "0") int page,
                           @RequestParam(defaultValue = "25") int size) {
        return db.page("""
                SELECT * FROM api_employees
                WHERE (first_name || ' ' || last_name || ' ' || COALESCE(email, '')) ILIKE :search
                  AND (NOT :active OR active)
                ORDER BY last_name, first_name, id
                """, Params.of("search", "%" + search.trim() + "%").and("active", activeOnly), page, size);
    }

    @PostMapping("/employees")
    @Transactional
    public void create(@Valid @RequestBody EmployeeRequest r) {
        if (r.password() == null || r.password().isBlank()) {
            throw new IllegalArgumentException("password is required for a new employee");
        }
        Integer id = db.scalar("""
                INSERT INTO Employee (FirstName, LastName, SSN, Sex, Email, PasswordHash, DateEmployment, DateResignation)
                VALUES (:first, :last, :ssn, :sex, :email, :hash, :employed, :resigned)
                RETURNING Id
                """, params(r).and("hash", passwordEncoder.encode(r.password())), Integer.class);
        replaceRoles(id, r.roleIds());
    }

    @PutMapping("/employees/{id}")
    @Transactional
    public void update(@PathVariable int id, @Valid @RequestBody EmployeeRequest r) {
        int rows = db.update("""
                UPDATE Employee
                SET FirstName = :first, LastName = :last, SSN = :ssn, Sex = :sex, Email = :email,
                    DateEmployment = :employed, DateResignation = :resigned
                WHERE Id = :id
                """, params(r).and("id", id));
        if (rows == 0) {
            throw new NotFoundException("Employee " + id + " does not exist");
        }
        if (r.password() != null && !r.password().isBlank()) {
            db.update("UPDATE Employee SET PasswordHash = :hash WHERE Id = :id",
                    Params.of("id", id).and("hash", passwordEncoder.encode(r.password())));
        }
        replaceRoles(id, r.roleIds());
    }

    /** Prefer setting a resignation date; deleting detaches the employee from past orders. */
    @DeleteMapping("/employees/{id}")
    @Transactional
    public void delete(@PathVariable int id) {
        if (db.update("DELETE FROM Employee WHERE Id = :id", Params.of("id", id)) == 0) {
            throw new NotFoundException("Employee " + id + " does not exist");
        }
    }

    private void replaceRoles(int employeeId, List<Integer> roleIds) {
        db.update("DELETE FROM EmployeeRole WHERE EmployeeId = :id", Params.of("id", employeeId));
        for (Integer roleId : roleIds.stream().distinct().toList()) {
            db.update("INSERT INTO EmployeeRole (EmployeeId, EmployeeTypeid) VALUES (:id, :role)",
                    Params.of("id", employeeId).and("role", roleId));
        }
    }

    private static Params params(EmployeeRequest r) {
        return Params.of("first", r.firstName().trim())
                .and("last", r.lastName().trim())
                .and("ssn", r.ssn().trim())
                .and("sex", r.sex())
                .and("email", r.email().trim())
                .and("employed", r.dateEmployment())
                .and("resigned", r.dateResignation());
    }
}
