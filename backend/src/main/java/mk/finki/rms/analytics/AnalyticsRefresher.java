package mk.finki.rms.analytics;

import mk.finki.rms.common.Db;
import mk.finki.rms.common.Params;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Keeps the mv_* materialized views behind the dashboard fresh. */
@Component
public class AnalyticsRefresher {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsRefresher.class);

    private final Db db;

    public AnalyticsRefresher(Db db) {
        this.db = db;
    }

    @Scheduled(initialDelayString = "${app.analytics-refresh-ms}", fixedDelayString = "${app.analytics-refresh-ms}")
    public void refresh() {
        try {
            db.call("CALL sp_refresh_analytics()", Params.of());
        } catch (RuntimeException e) {
            log.warn("Analytics refresh failed: {}", e.getMessage());
        }
    }
}
