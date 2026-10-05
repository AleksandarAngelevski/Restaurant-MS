package mk.finki.rms.common;

import java.util.HashMap;

/** Named SQL parameters; unlike Map.of it accepts null values. */
public class Params extends HashMap<String, Object> {

    public static Params of() {
        return new Params();
    }

    public static Params of(String name, Object value) {
        return new Params().and(name, value);
    }

    public Params and(String name, Object value) {
        put(name, value);
        return this;
    }
}
