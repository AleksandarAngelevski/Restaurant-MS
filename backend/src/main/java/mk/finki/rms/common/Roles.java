package mk.finki.rms.common;

/** Authorisation is by role name (EmployeeType.Type), not by the Permissions level. */
public final class Roles {

    /** Taking orders: waiters and everyone above them. */
    public static final String FLOOR = "hasAnyRole('WAITER','MANAGER','SUPERVISOR','ADMIN')";
    public static final String FLOOR_OR_HOST = "hasAnyRole('WAITER','HOST','MANAGER','SUPERVISOR','ADMIN')";
    public static final String KITCHEN = "hasAnyRole('KITCHEN','MANAGER','SUPERVISOR','ADMIN')";
    public static final String RESERVATIONS = "hasAnyRole('HOST','MANAGER','SUPERVISOR','ADMIN')";
    public static final String MANAGEMENT = "hasAnyRole('MANAGER','SUPERVISOR','ADMIN')";
    public static final String STAFF_OVERVIEW = "hasAnyRole('SUPERVISOR','ADMIN')";
    public static final String ADMIN = "hasRole('ADMIN')";

    private Roles() {
    }

    /** "Waiter" becomes WAITER; custom types such as "Head Chef" become HEAD_CHEF. */
    public static String fromTypeName(String type) {
        return type.trim().toUpperCase().replaceAll("[^A-Z0-9]+", "_");
    }
}
