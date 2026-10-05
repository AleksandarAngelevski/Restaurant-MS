package mk.finki.rms.common;

import java.util.List;
import java.util.Map;

/** One page of a list. hasMore avoids a COUNT(*) over million-row tables. */
public record PageResult(List<Map<String, Object>> items, int page, int size, boolean hasMore) {
}
