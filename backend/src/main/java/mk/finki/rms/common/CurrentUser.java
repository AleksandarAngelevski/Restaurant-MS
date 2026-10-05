package mk.finki.rms.common;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

public final class CurrentUser {

    private CurrentUser() {
    }

    /** Employee id of the logged-in user (the JWT subject). */
    public static int id() {
        return Integer.parseInt(auth().getName());
    }

    public static boolean hasAnyRole(String... roles) {
        for (String role : roles) {
            if (auth().getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_" + role))) {
                return true;
            }
        }
        return false;
    }

    private static Authentication auth() {
        return SecurityContextHolder.getContext().getAuthentication();
    }
}
