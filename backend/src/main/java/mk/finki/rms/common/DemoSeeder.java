package mk.finki.rms.common;

import java.nio.charset.StandardCharsets;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Loads db/dev/demo_seed.sql once, when asked to and the database has no employees. */
@Component
public class DemoSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoSeeder.class);

    private final JdbcTemplate jdbc;
    private final boolean enabled;

    public DemoSeeder(JdbcTemplate jdbc, @Value("${app.demo-seed}") boolean enabled) {
        this.jdbc = jdbc;
        this.enabled = enabled;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        if (!enabled) {
            return;
        }
        Integer employees = jdbc.queryForObject("SELECT COUNT(*) FROM Employee", Integer.class);
        if (employees != null && employees > 0) {
            log.info("Demo seed skipped: the database already has {} employees", employees);
            return;
        }
        String sql = new ClassPathResource("db/dev/demo_seed.sql").getContentAsString(StandardCharsets.UTF_8);
        jdbc.execute(sql);
        log.info("Demo seed loaded (admin@demo.mk / admin123)");
    }
}
