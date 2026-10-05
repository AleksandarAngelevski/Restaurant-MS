-- Lookup values. Inserted in a fixed order so ids are stable, and idempotent.
-- Fixes the quirks of the original seeder: OrderStatus has Cancelled (and no
-- Packaging/Cleaning), ChangeType has a single 'Order', UnitType is idempotent.

INSERT INTO EmployeeType (Type, Permissions) VALUES
    ('Waiter', 0),
    ('Manager', 1),
    ('Supervisor', 2),
    ('Admin', 4),
    ('Host', 3),
    ('Kitchen', 0)
ON CONFLICT (Type) DO NOTHING;

INSERT INTO OrderType (Type) VALUES
    ('Dine-in'), ('Takeaway'), ('Delivery'), ('Bar')
ON CONFLICT (Type) DO NOTHING;

INSERT INTO OrderStatus (Status) VALUES
    ('Pending'), ('In Progress'), ('Ready'), ('Served'), ('Completed'), ('Cancelled')
ON CONFLICT (Status) DO NOTHING;

INSERT INTO MenuType (Type) VALUES
    ('Breakfast'), ('Lunch'), ('Dinner'), ('Drinks'), ('Desserts'), ('Specials'), ('Kids'), ('Seasonal')
ON CONFLICT (Type) DO NOTHING;

INSERT INTO MenuMemberType (Type) VALUES
    ('Regular'), ('Special'), ('Seasonal'), ('Chef''s Pick')
ON CONFLICT (Type) DO NOTHING;

INSERT INTO ProductType (Type) VALUES
    ('Ingredient'), ('Beverage'), ('Dish'), ('Dessert'), ('Condiment'), ('Packaging'), ('Cleaning')
ON CONFLICT (Type) DO NOTHING;

INSERT INTO TableType (Type) VALUES
    ('Indoor'), ('Outdoor'), ('Bar'), ('Private Room'), ('Terrace')
ON CONFLICT (Type) DO NOTHING;

INSERT INTO UnitType (Type) VALUES
    ('Weight'), ('Volume'), ('Count'), ('Length')
ON CONFLICT (Type) DO NOTHING;

INSERT INTO Unit (Name, Conversion_to_base, TypeId)
SELECT v.Name, v.Conversion, ut.Id
FROM (VALUES
    (1, 'gram', 1, 'Weight'),
    (2, 'kilogram', 1000, 'Weight'),
    (3, 'milligram', 1, 'Weight'),
    (4, 'milliliter', 1, 'Volume'),
    (5, 'liter', 1000, 'Volume'),
    (6, 'centiliter', 10, 'Volume'),
    (7, 'piece', 1, 'Count'),
    (8, 'dozen', 12, 'Count'),
    (9, 'slice', 1, 'Count')
) AS v (Ord, Name, Conversion, UnitType)
JOIN UnitType ut ON ut.Type = v.UnitType
WHERE NOT EXISTS (SELECT 1 FROM Unit u WHERE u.Name = v.Name)
ORDER BY v.Ord;

INSERT INTO ChangeType (Type, Sign) VALUES
    ('Purchase', TRUE),
    ('Order', FALSE),
    ('Manual Adjustment Down', FALSE),
    ('Manual Adjustment Up', TRUE),
    ('Return to Supplier', FALSE)
ON CONFLICT (Type) DO NOTHING;
