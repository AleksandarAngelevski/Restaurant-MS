package mk.finki.rms;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Behaviour of the triggers, functions and procedures in V3__programming.sql,
 * run against a real PostgreSQL 16 with all Flyway migrations applied.
 */
@SpringBootTest
@Testcontainers
class DbRulesTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16");

    private static final AtomicInteger SEQ = new AtomicInteger();

    @Autowired
    JdbcTemplate jdbc;

    // ---- fixtures -------------------------------------------------------------------------

    private int employee(LocalDate resigned) {
        int n = SEQ.incrementAndGet();
        return jdbc.queryForObject("""
                INSERT INTO Employee (FirstName, LastName, SSN, Sex, Email, PasswordHash, DateEmployment, DateResignation)
                VALUES ('Test', 'Employee', ?, 'O', ?, 'x', DATE '2020-01-01', ?) RETURNING Id
                """, Integer.class, String.format("%013d", n), "e" + n + "@test.mk", resigned);
    }

    private int table() {
        return jdbc.queryForObject(
                "INSERT INTO RestaurantTable (Capacity, TableTypeId) VALUES (4, 1) RETURNING TableNumber", Integer.class);
    }

    private int product(String unit) {
        return jdbc.queryForObject("""
                INSERT INTO Product (Name, TypeId, BaseUnitId)
                VALUES (?, 1, (SELECT Id FROM Unit WHERE Name = ?)) RETURNING Id
                """, Integer.class, "Product " + SEQ.incrementAndGet(), unit);
    }

    private int menu() {
        return jdbc.queryForObject("INSERT INTO Menu (Name, TypeId) VALUES (?, 1) RETURNING Id",
                Integer.class, "Menu " + SEQ.incrementAndGet());
    }

    /** A sellable product on the given menu; returns {menuMemberId, menuItemId}. */
    private int[] menuMember(int menuId, String price) {
        int productId = product("piece");
        jdbc.update("INSERT INTO MenuItem (Id) VALUES (?)", productId);
        int memberId = jdbc.queryForObject("""
                INSERT INTO MenuMember (MenuItemId, Price, TypeId, MenuId) VALUES (?, ?, 1, ?) RETURNING Id
                """, Integer.class, productId, new BigDecimal(price), menuId);
        return new int[] {memberId, productId};
    }

    private int order(int waiterId, Integer tableNumber) {
        return jdbc.queryForObject("CALL sp_create_order(?, 1, ?, NULL)", Integer.class, waiterId, tableNumber);
    }

    private void addItem(int orderId, int[] member, int quantity) {
        jdbc.update("CALL sp_add_order_item(?, ?, ?, ?, NULL)", orderId, member[0], member[1], quantity);
    }

    private void finishAll(int orderId) {
        jdbc.update("UPDATE OrderItem SET Finished = TRUE WHERE OrderId = ?", orderId);
    }

    private String orderStatus(int orderId) {
        return jdbc.queryForObject(
                "SELECT os.Status FROM \"Order\" o JOIN OrderStatus os ON os.Id = o.StatusId WHERE o.Id = ?",
                String.class, orderId);
    }

    private boolean tableFree(int tableNumber) {
        return jdbc.queryForObject("SELECT Status FROM RestaurantTable WHERE TableNumber = ?", Boolean.class, tableNumber);
    }

    private int stock(int productId) {
        return jdbc.queryForObject("SELECT Quantity FROM StoredProduct WHERE ProductId = ?", Integer.class, productId);
    }

    // ---- tests ----------------------------------------------------------------------------

    @Test
    void createOrderStartsPendingAndOccupiesTheTable() {
        int table = table();
        int order = order(employee(null), table);

        assertThat(orderStatus(order)).isEqualTo("Pending");
        assertThat(tableFree(table)).isFalse();
        assertThatThrownBy(() -> order(employee(null), table))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("is occupied");
    }

    @Test
    void addingTheSameUnfinishedItemIncrementsItsQuantity() {
        int order = order(employee(null), null);
        int[] member = menuMember(menu(), "100.00");

        addItem(order, member, 2);
        addItem(order, member, 3);

        assertThat(jdbc.queryForList("SELECT Quantity FROM OrderItem WHERE OrderId = ?", Integer.class, order))
                .containsExactly(5);
        assertThatThrownBy(() -> addItem(order, member, 0))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("Quantity must be greater than 0");
    }

    @Test
    void closedOrderRejectsItemChanges() {
        int order = order(employee(null), null);
        int[] member = menuMember(menu(), "100.00");
        addItem(order, member, 1);
        finishAll(order);
        jdbc.update("CALL sp_close_order_and_invoice(?)", order);

        // through the procedure
        assertThatThrownBy(() -> addItem(order, member, 1))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("Completed");
        // and straight at the table: trg_prevent_closed_order_edit
        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO OrderItem (Quantity, OrderId, MenuMemberId, MenuItemId) VALUES (1, ?, ?, ?)",
                order, member[0], member[1]))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("Order " + order + " is Completed");
        assertThatThrownBy(() -> jdbc.update("UPDATE OrderItem SET Quantity = 9 WHERE OrderId = ?", order))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("Completed");
    }

    @Test
    void finishingAnItemDeductsItsRecipeAndLogsTheMovement() {
        int[] dish = menuMember(menu(), "300.00");
        int flour = product("gram");
        int cola = product("piece");
        jdbc.update("CALL sp_restock_product(?, 5000)", flour);
        jdbc.update("CALL sp_restock_product(?, 3)", cola);
        // 2 kilograms of flour and 1 bottle per dish
        jdbc.update("INSERT INTO ConsistsOf (Parent, Component, Amount, UnitId) "
                + "VALUES (?, ?, 2, (SELECT Id FROM Unit WHERE Name = 'kilogram'))", dish[1], flour);
        jdbc.update("INSERT INTO ConsistsOf (Parent, Component, Amount, UnitId) "
                + "VALUES (?, ?, 1, (SELECT Id FROM Unit WHERE Name = 'piece'))", dish[1], cola);

        int order = order(employee(null), null);
        addItem(order, dish, 2);
        assertThat(stock(flour)).as("nothing is deducted before the kitchen finishes").isEqualTo(5000);

        finishAll(order);

        // 2 kg x 1000 x 2 dishes = 4000 g
        assertThat(stock(flour)).isEqualTo(1000);
        assertThat(stock(cola)).isEqualTo(1);

        List<Map<String, Object>> log = jdbc.queryForList("""
                SELECT ct.Type AS type, pul.ChangeAmount AS amount
                FROM ProductUsageLog pul JOIN ChangeType ct ON ct.Id = pul.ChangeTypeId
                WHERE pul.ProductId = ? ORDER BY pul.Id
                """, flour);
        assertThat(log).extracting(r -> r.get("type") + ":" + r.get("amount"))
                .containsExactly("Purchase:5000", "Order:4000");
        assertThat(orderStatus(order)).isEqualTo("Ready");
    }

    @Test
    void insufficientStockIsFlooredAtZero() {
        int[] dish = menuMember(menu(), "300.00");
        int ingredient = product("gram");
        jdbc.update("CALL sp_restock_product(?, 50)", ingredient);
        jdbc.update("INSERT INTO ConsistsOf (Parent, Component, Amount, UnitId) "
                + "VALUES (?, ?, 80, (SELECT Id FROM Unit WHERE Name = 'gram'))", dish[1], ingredient);

        int order = order(employee(null), null);
        addItem(order, dish, 1);
        finishAll(order);

        assertThat(stock(ingredient)).isZero();
        assertThat(jdbc.queryForObject("""
                SELECT ChangeAmount FROM ProductUsageLog WHERE ProductId = ? ORDER BY Id DESC LIMIT 1
                """, Integer.class, ingredient)).isEqualTo(50);
    }

    @Test
    void restockCreatesTheStockRowAndRejectsNonPositiveQuantities() {
        int product = product("gram");

        jdbc.update("CALL sp_restock_product(?, 200)", product);
        jdbc.update("CALL sp_restock_product(?, 300)", product);

        assertThat(stock(product)).isEqualTo(500);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ProductUsageLog WHERE ProductId = ?", Integer.class, product))
                .isEqualTo(2);
        assertThatThrownBy(() -> jdbc.update("CALL sp_restock_product(?, 0)", product))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("greater than 0");
    }

    @Test
    void manualAdjustmentIsLoggedWithItsOwnChangeType() {
        int product = product("gram");
        jdbc.update("CALL sp_restock_product(?, 200)", product);

        jdbc.update("CALL sp_adjust_stock(?, 150)", product);
        jdbc.update("CALL sp_adjust_stock(?, 180)", product);

        assertThat(jdbc.queryForList("""
                SELECT ct.Type FROM ProductUsageLog pul JOIN ChangeType ct ON ct.Id = pul.ChangeTypeId
                WHERE pul.ProductId = ? ORDER BY pul.Id
                """, String.class, product))
                .containsExactly("Purchase", "Manual Adjustment Down", "Manual Adjustment Up");
    }

    @Test
    void discountLowersTheOrderTotal() {
        int menu = menu();
        int[] pizza = menuMember(menu, "400.00");
        int[] salad = menuMember(menu, "250.00");
        int order = order(employee(null), null);
        addItem(order, pizza, 2);
        addItem(order, salad, 1);

        assertThat(jdbc.queryForObject("SELECT fn_calculate_order_total(?)", BigDecimal.class, order))
                .isEqualByComparingTo("1050.00");

        jdbc.update("CALL sp_apply_discount_to_menu(?, 'Twenty off', 20, CURRENT_DATE, CURRENT_DATE + 7)", menu);

        // 2 x 320 + 1 x 200
        assertThat(jdbc.queryForObject("SELECT fn_calculate_order_total(?)", BigDecimal.class, order))
                .isEqualByComparingTo("840.00");
    }

    @Test
    void expiredOrDisabledDiscountsAreIgnored() {
        int menu = menu();
        int[] pizza = menuMember(menu, "400.00");
        int order = order(employee(null), null);
        addItem(order, pizza, 1);

        jdbc.update("CALL sp_apply_discount_to_menu(?, 'Last week', 50, CURRENT_DATE - 14, CURRENT_DATE - 7)", menu);
        jdbc.update("CALL sp_apply_discount_to_menu(?, 'Disabled', 50, CURRENT_DATE, CURRENT_DATE + 7)", menu);
        jdbc.update("UPDATE Discount SET Status = FALSE WHERE MenuId = ? AND Name = 'Disabled'", menu);

        assertThat(jdbc.queryForObject("SELECT fn_calculate_order_total(?)", BigDecimal.class, order))
                .isEqualByComparingTo("400.00");
        assertThatThrownBy(() -> jdbc.update(
                "CALL sp_apply_discount_to_menu(?, 'Too much', 100, CURRENT_DATE, CURRENT_DATE)", menu))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("between 0 and 100");
    }

    @Test
    void closingAnOrderCreatesTheInvoiceWithTaxAndFreesTheTable() {
        int menu = menu();
        int[] pizza = menuMember(menu, "400.00");
        int[] salad = menuMember(menu, "250.00");
        int table = table();
        int order = order(employee(null), table);
        addItem(order, pizza, 2);
        addItem(order, salad, 1);
        jdbc.update("CALL sp_apply_discount_to_menu(?, 'Twenty off', 20, CURRENT_DATE, CURRENT_DATE + 7)", menu);
        finishAll(order);

        jdbc.update("CALL sp_close_order_and_invoice(?)", order);

        Map<String, Object> invoice = jdbc.queryForMap("SELECT * FROM vw_invoice_summary WHERE OrderId = ?", order);
        assertThat((BigDecimal) invoice.get("totalamount")).isEqualByComparingTo("840.00");
        assertThat((BigDecimal) invoice.get("taxamount")).isEqualByComparingTo("151.20");   // 18%
        assertThat((BigDecimal) invoice.get("netamount")).isEqualByComparingTo("688.80");

        List<Map<String, Object>> lines = jdbc.queryForList("""
                SELECT ii.Quantity AS q, ii.OriginalPrice AS original, ii.DiscountedPrice AS discounted
                FROM InvoiceItem ii WHERE ii.InvoiceId = ? ORDER BY ii.Id
                """, invoice.get("invoiceid"));
        assertThat(lines).hasSize(2);
        assertThat((BigDecimal) lines.get(0).get("original")).isEqualByComparingTo("400.00");
        assertThat((BigDecimal) lines.get(0).get("discounted")).isEqualByComparingTo("320.00");

        assertThat(orderStatus(order)).isEqualTo("Completed");
        assertThat(tableFree(table)).isTrue();
        assertThatThrownBy(() -> jdbc.update("CALL sp_close_order_and_invoice(?)", order))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("already Completed");
    }

    @Test
    void invoiceWithoutDiscountKeepsDiscountedPriceNull() {
        int[] pizza = menuMember(menu(), "100.00");
        int order = order(employee(null), null);
        addItem(order, pizza, 1);
        finishAll(order);

        jdbc.update("CALL sp_close_order_and_invoice(?, 0.05)", order);

        Map<String, Object> row = jdbc.queryForMap("""
                SELECT i.TaxAmount AS tax, ii.DiscountedPrice AS discounted
                FROM Invoice i JOIN InvoiceItem ii ON ii.InvoiceId = i.Id WHERE i.OrderId = ?
                """, order);
        assertThat((BigDecimal) row.get("tax")).isEqualByComparingTo("5.00");
        assertThat(row.get("discounted")).isNull();
    }

    @Test
    void orderWithUnfinishedItemsCannotBeCompleted() {
        int order = order(employee(null), null);
        addItem(order, menuMember(menu(), "100.00"), 1);

        assertThatThrownBy(() -> jdbc.update("CALL sp_close_order_and_invoice(?)", order))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("not finished");
        // the trigger on "Order" guards direct status updates too
        assertThatThrownBy(() -> jdbc.update(
                "UPDATE \"Order\" SET StatusId = (SELECT Id FROM OrderStatus WHERE Status = 'Completed') WHERE Id = ?",
                order))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("not finished");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM Invoice WHERE OrderId = ?", Integer.class, order)).isZero();
    }

    @Test
    void overlappingReservationIsRejected() {
        int table = table();
        int host = employee(null);
        jdbc.update("CALL sp_create_reservation('Guest A', NULL, CURRENT_DATE + 1, '18:00', '20:00', ?, ?)", table, host);

        assertThatThrownBy(() -> jdbc.update(
                "CALL sp_create_reservation('Guest B', NULL, CURRENT_DATE + 1, '19:00', '21:00', ?, ?)", table, host))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("already reserved");
        // the exclusion constraint is the safety net below the procedure
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO Reservation (GuestName, StartTime, EndTime, "Date", TableNumber)
                VALUES ('Guest C', '19:30', '19:45', CURRENT_DATE + 1, ?)
                """, table))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("no_overlap");

        // back-to-back and other-day bookings are fine
        jdbc.update("CALL sp_create_reservation('Guest D', NULL, CURRENT_DATE + 1, '20:00', '22:00', ?, ?)", table, host);
        jdbc.update("CALL sp_create_reservation('Guest E', NULL, CURRENT_DATE + 2, '19:00', '21:00', ?, ?)", table, host);

        assertThatThrownBy(() -> jdbc.update(
                "CALL sp_create_reservation('Guest F', NULL, CURRENT_DATE - 1, '19:00', '21:00', ?, ?)", table, host))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("in the past");
    }

    @Test
    void availableTablesExcludeReservedAndTooSmallOnes() {
        int reserved = table();
        int free = table();
        jdbc.update("CALL sp_create_reservation('Guest', NULL, CURRENT_DATE + 3, '12:00', '14:00', ?, NULL)", reserved);

        List<Integer> available = jdbc.queryForList(
                "SELECT TableNumber FROM fn_get_available_tables(CURRENT_DATE + 3, '13:00', '15:00', 4)", Integer.class);
        assertThat(available).contains(free).doesNotContain(reserved);

        assertThat(jdbc.queryForList(
                "SELECT TableNumber FROM fn_get_available_tables(CURRENT_DATE + 3, '13:00', '15:00', 5)", Integer.class))
                .doesNotContain(free);
    }

    @Test
    void resignedWaiterCannotCreateOrders() {
        int resigned = employee(LocalDate.now().minusDays(1));

        assertThatThrownBy(() -> order(resigned, null))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("resigned");
        // trigger on "Order" for inserts that bypass the procedure
        assertThatThrownBy(() -> jdbc.update("INSERT INTO \"Order\" (WaiterId, TypeId, StatusId) VALUES (?, 1, 1)", resigned))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("resigned");

        // someone whose last day is still ahead may keep working
        assertThat(order(employee(LocalDate.now().plusDays(30)), null)).isPositive();
    }

    @Test
    void cancelFreesTheTableAndKeepsConsumedInventory() {
        int[] dish = menuMember(menu(), "100.00");
        int ingredient = product("gram");
        jdbc.update("CALL sp_restock_product(?, 100)", ingredient);
        jdbc.update("INSERT INTO ConsistsOf (Parent, Component, Amount, UnitId) "
                + "VALUES (?, ?, 30, (SELECT Id FROM Unit WHERE Name = 'gram'))", dish[1], ingredient);
        int table = table();
        int order = order(employee(null), table);
        addItem(order, dish, 1);
        finishAll(order);

        jdbc.update("CALL sp_cancel_order(?, 'guest left')", order);

        assertThat(orderStatus(order)).isEqualTo("Cancelled");
        assertThat(tableFree(table)).isTrue();
        assertThat(stock(ingredient)).as("inventory is not reverted").isEqualTo(70);
        assertThatThrownBy(() -> jdbc.update("CALL sp_cancel_order(?, 'again')", order))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("already Cancelled");
    }

    @Test
    void lowStockReportListsProductsBelowTheThreshold() {
        int low = product("gram");
        int plenty = product("gram");
        jdbc.update("CALL sp_restock_product(?, 5)", low);
        jdbc.update("CALL sp_restock_product(?, 5000)", plenty);
        String lowName = jdbc.queryForObject("SELECT Name FROM Product WHERE Id = ?", String.class, low);
        String plentyName = jdbc.queryForObject("SELECT Name FROM Product WHERE Id = ?", String.class, plenty);

        List<String> report = jdbc.queryForList("SELECT Product FROM fn_low_stock_report()", String.class);

        assertThat(report).contains(lowName).doesNotContain(plentyName);
    }
}
