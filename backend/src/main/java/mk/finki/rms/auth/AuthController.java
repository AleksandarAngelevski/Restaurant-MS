package mk.finki.rms.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import mk.finki.rms.common.CurrentUser;
import mk.finki.rms.common.Db;
import mk.finki.rms.common.Params;
import mk.finki.rms.common.Roles;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final Db db;
    private final PasswordEncoder passwordEncoder;
    private final JwtEncoder jwtEncoder;
    private final Duration ttl;

    public AuthController(Db db, PasswordEncoder passwordEncoder, JwtEncoder jwtEncoder,
                          @Value("${app.jwt.ttl-hours}") long ttlHours) {
        this.db = db;
        this.passwordEncoder = passwordEncoder;
        this.jwtEncoder = jwtEncoder;
        this.ttl = Duration.ofHours(ttlHours);
    }

    public record LoginRequest(@NotBlank String email, @NotBlank String password) {
    }

    @PostMapping("/login")
    public Map<String, Object> login(@Valid @RequestBody LoginRequest request) {
        Map<String, Object> employee = db.first("""
                SELECT e.Id AS id, e.PasswordHash AS password_hash,
                       (e.DateResignation IS NULL OR e.DateResignation > CURRENT_DATE) AS active
                FROM Employee e
                WHERE lower(e.Email) = lower(:email)
                """, Params.of("email", request.email().trim())).orElse(null);

        // same answer for unknown e-mail, wrong password and resigned staff
        if (employee == null
                || !Boolean.TRUE.equals(employee.get("active"))
                || !matches(request.password(), (String) employee.get("passwordHash"))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid e-mail or password");
        }

        Map<String, Object> user = loadUser((Integer) employee.get("id"));
        @SuppressWarnings("unchecked")
        List<String> roles = (List<String>) user.get("roles");

        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .subject(String.valueOf(user.get("id")))
                .issuedAt(now)
                .expiresAt(now.plus(ttl))
                .claim("roles", roles)
                .build();
        String token = jwtEncoder.encode(
                JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("token", token);
        response.put("user", user);
        return response;
    }

    @GetMapping("/me")
    public Map<String, Object> me() {
        return loadUser(CurrentUser.id());
    }

    private boolean matches(String raw, String hash) {
        try {
            return hash != null && passwordEncoder.matches(raw, hash);
        } catch (IllegalArgumentException notBcrypt) {
            return false;
        }
    }

    private Map<String, Object> loadUser(int id) {
        Map<String, Object> user = db.one("""
                SELECT e.Id AS id, e.FirstName || ' ' || e.LastName AS name, e.Email AS email
                FROM Employee e WHERE e.Id = :id
                """, Params.of("id", id), "Employee not found");
        List<String> roles = db.list("""
                SELECT et.Type AS type
                FROM EmployeeRole er JOIN EmployeeType et ON et.Id = er.EmployeeTypeid
                WHERE er.EmployeeId = :id ORDER BY et.Id
                """, Params.of("id", id)).stream()
                .map(r -> Roles.fromTypeName((String) r.get("type")))
                .distinct()
                .toList();
        user.put("roles", roles);
        return user;
    }
}
