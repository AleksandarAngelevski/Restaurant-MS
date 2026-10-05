-- Lookup / Type Tables
CREATE TABLE EmployeeType (
    Id SERIAL PRIMARY KEY,
    Type VARCHAR(30) NOT NULL UNIQUE,
    Permissions INT4 NOT NULL DEFAULT 0
);
CREATE TABLE OrderType (Id SERIAL PRIMARY KEY, Type VARCHAR(20) NOT NULL UNIQUE);
CREATE TABLE OrderStatus (Id SERIAL PRIMARY KEY, Status VARCHAR(20) NOT NULL UNIQUE);
CREATE TABLE MenuType (Id SERIAL PRIMARY KEY, Type VARCHAR(30) NOT NULL UNIQUE);
CREATE TABLE ProductType (Id SERIAL PRIMARY KEY, Type VARCHAR(30) NOT NULL UNIQUE);
CREATE TABLE MenuMemberType (Id SERIAL PRIMARY KEY, Type VARCHAR(20) NOT NULL UNIQUE);
CREATE TABLE TableType (Id SERIAL PRIMARY KEY, Type VARCHAR(20) NOT NULL UNIQUE);
CREATE TABLE UnitType (Id SERIAL PRIMARY KEY, Type VARCHAR(20) NOT NULL UNIQUE);
CREATE TABLE ChangeType (
    Id SERIAL PRIMARY KEY,
    Type VARCHAR(30) NOT NULL UNIQUE,
    Sign BOOL NOT NULL
);
CREATE TABLE Location (Id SERIAL PRIMARY KEY, Name VARCHAR(30) NOT NULL UNIQUE);

-- Core Tables
CREATE TABLE Unit (
    Id SERIAL PRIMARY KEY,
    Name VARCHAR(20) NOT NULL,
    Conversion_to_base INT4 NOT NULL DEFAULT 1 CHECK (Conversion_to_base > 0),
    TypeId INT4 NOT NULL,
    CONSTRAINT FKUnit_UnitType FOREIGN KEY (TypeId) REFERENCES UnitType (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE RestaurantTable (
    TableNumber SERIAL PRIMARY KEY,
    Capacity INT4 NOT NULL DEFAULT 2 CHECK (Capacity > 0),
    Status BOOL NOT NULL DEFAULT TRUE,           -- TRUE = available
    TableTypeId INT4 NOT NULL,
    CONSTRAINT FKTable_TableType FOREIGN KEY (TableTypeId) REFERENCES TableType (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE Employee (
    Id SERIAL PRIMARY KEY,
    FirstName VARCHAR(50) NOT NULL DEFAULT 'Unknown',
    LastName VARCHAR(50) NOT NULL DEFAULT 'Unknown',
    SSN VARCHAR(13) NOT NULL UNIQUE,
    Sex CHAR(1) NOT NULL CHECK (Sex IN ('M', 'F', 'O')),
    Email VARCHAR(100) UNIQUE CHECK (Email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,4}$'),
    PasswordHash VARCHAR(255) NOT NULL,
    DateEmployment DATE NOT NULL DEFAULT CURRENT_DATE,
    DateResignation DATE,
    CHECK (DateResignation IS NULL OR DateResignation >= DateEmployment)
);

CREATE TABLE EmployeeRole (
    Id SERIAL PRIMARY KEY,
    EmployeeId INT4 NOT NULL,
    EmployeeTypeid INT4 NOT NULL,
    CONSTRAINT FKEmployeeRole_Employee FOREIGN KEY (EmployeeId) REFERENCES Employee (Id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT FKEmployeeRole_EmployeeType FOREIGN KEY (EmployeeTypeid) REFERENCES EmployeeType (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE Product (
    Id SERIAL PRIMARY KEY,
    Name VARCHAR(30) NOT NULL UNIQUE,
    Url VARCHAR(255),
    TypeId INT4 NOT NULL,
    BaseUnitId INT4 NOT NULL,
    CONSTRAINT FKProduct_ProductType FOREIGN KEY (TypeId) REFERENCES ProductType (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT FKProduct_Unit FOREIGN KEY (BaseUnitId) REFERENCES Unit (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Specialisation: a Product that can be sold
CREATE TABLE MenuItem (
    Id INT4 PRIMARY KEY,
    CONSTRAINT FKMenuItem_Product FOREIGN KEY (Id) REFERENCES Product (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE StoredProduct (
    Id SERIAL PRIMARY KEY,
    Quantity INT4 NOT NULL DEFAULT 0 CHECK (Quantity >= 0),   -- in product's base unit
    ProductId INT4 NOT NULL,
    CONSTRAINT FKStoredProduct_Product FOREIGN KEY (ProductId) REFERENCES Product (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Recipe / bill of materials (self-referencing Product)
CREATE TABLE ConsistsOf (
    Parent INT4 NOT NULL,    -- the recipe
    Component INT4 NOT NULL, -- the ingredient
    Amount INT4 NOT NULL CHECK (Amount > 0),
    UnitId INT4 NOT NULL,
    PRIMARY KEY (Parent, Component),
    CONSTRAINT FKConsistsOf_ParentProduct FOREIGN KEY (Parent) REFERENCES Product (Id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT FKConsistsOf_ComponentProduct FOREIGN KEY (Component) REFERENCES Product (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT FKConsistsOf_Unit FOREIGN KEY (UnitId) REFERENCES Unit (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE ProductUsageLog (
    Id SERIAL PRIMARY KEY,
    ProductId INT4 NOT NULL,
    ChangeAmount INT4 NOT NULL,
    InputAmount INT4 NOT NULL,
    Timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ChangeTypeId INT4 NOT NULL,
    BaseUnitId INT4 NOT NULL,
    InputUnitId INT4 NOT NULL,
    CONSTRAINT FKProductUsageLog_Product FOREIGN KEY (ProductId) REFERENCES Product (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT FKProductUsageLog_ChangeType FOREIGN KEY (ChangeTypeId) REFERENCES ChangeType (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT FKProductUsageLog_BaseUnit FOREIGN KEY (BaseUnitId) REFERENCES Unit (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT FKProductUsageLog_InputUnit FOREIGN KEY (InputUnitId) REFERENCES Unit (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE Menu (
    Id SERIAL PRIMARY KEY,
    Name VARCHAR(30) NOT NULL DEFAULT 'Standard Menu',
    Active BOOL NOT NULL DEFAULT TRUE,
    Wallpaper VARCHAR(255),
    TypeId INT4 NOT NULL,
    CONSTRAINT FKMenu_MenuType FOREIGN KEY (TypeId) REFERENCES MenuType (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE MenuMember (
    Id SERIAL NOT NULL,
    MenuItemId INT4 NOT NULL,
    Price NUMERIC(10,2) NOT NULL CHECK (Price >= 0),
    TypeId INT4 NOT NULL,
    MenuId INT4 NOT NULL,
    PRIMARY KEY (Id, MenuItemId),
    CONSTRAINT FKMenuMember_MenuItem FOREIGN KEY (MenuItemId) REFERENCES MenuItem (Id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT FKMenuMember_MenuMemberType FOREIGN KEY (TypeId) REFERENCES MenuMemberType (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT FKMenuMember_Menu FOREIGN KEY (MenuId) REFERENCES Menu (Id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE Discount (
    Id SERIAL PRIMARY KEY,
    Name VARCHAR(30) NOT NULL,
    "From" DATE NOT NULL,
    "To" DATE NOT NULL,
    MenuId INT4 NOT NULL,
    Status BOOL NOT NULL DEFAULT TRUE,
    CONSTRAINT FKDiscount_Menu FOREIGN KEY (MenuId) REFERENCES Menu (Id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CHECK ("To" >= "From")
);

CREATE TABLE DiscountItem (
    Id SERIAL PRIMARY KEY,
    NewPrice NUMERIC(10,2) NOT NULL CHECK (NewPrice >= 0),
    MenuMemberId INT4 NOT NULL,
    MenuMemberMenuItemId INT4 NOT NULL,
    DiscountId INT4 NOT NULL,
    CONSTRAINT FKDiscountItem_Discount FOREIGN KEY (DiscountId) REFERENCES Discount (Id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT FKDiscountItem_MenuMember FOREIGN KEY (MenuMemberId, MenuMemberMenuItemId)
        REFERENCES MenuMember (Id, MenuItemId) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Order" (
    Id SERIAL PRIMARY KEY,
    WaiterId INT4,
    DateCreated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    DateFinished TIMESTAMP,
    TypeId INT4 NOT NULL,
    StatusId INT4 NOT NULL,
    TableNumber INT4,
    CONSTRAINT FKOrder_OrderType FOREIGN KEY (TypeId) REFERENCES OrderType (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT FKOrder_OrderStatus FOREIGN KEY (StatusId) REFERENCES OrderStatus (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT FKOrder_Employee FOREIGN KEY (WaiterId) REFERENCES Employee (Id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT FKOrder_Table FOREIGN KEY (TableNumber) REFERENCES RestaurantTable (TableNumber)
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE OrderItem (
    Id SERIAL PRIMARY KEY,
    Quantity INT4 NOT NULL CHECK (Quantity > 0),
    OrderId INT4 NOT NULL,
    CreatedBy INT4,                        -- employee who prepared it
    Finished BOOL NOT NULL DEFAULT FALSE,
    MenuMemberId INT4 NOT NULL,
    MenuItemId INT4 NOT NULL,
    CONSTRAINT FKOrderItem_Order FOREIGN KEY (OrderId) REFERENCES "Order" (Id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT FKOrderItem_Employee FOREIGN KEY (CreatedBy) REFERENCES Employee (Id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT FKOrderItem_MenuMember FOREIGN KEY (MenuMemberId, MenuItemId)
        REFERENCES MenuMember (Id, MenuItemId) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE Reservation (
    Id SERIAL PRIMARY KEY,
    GuestName VARCHAR(50) NOT NULL,
    GuestPhone VARCHAR(50),
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    StartTime TIME NOT NULL,
    EndTime TIME NOT NULL,
    "Date" DATE NOT NULL,
    EmployeeId INT4,
    TableNumber INT4,
    CONSTRAINT FKReservation_Employee FOREIGN KEY (EmployeeId) REFERENCES Employee (Id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT FKReservation_Table FOREIGN KEY (TableNumber) REFERENCES RestaurantTable (TableNumber)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CHECK (EndTime > StartTime)
);

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE Reservation
ADD CONSTRAINT no_overlap EXCLUDE USING gist (
    TableNumber WITH =,
    "Date" WITH =,
    tsrange(("Date" + StartTime)::timestamp, ("Date" + EndTime)::timestamp) WITH &&
);

CREATE TABLE Invoice (
    Id SERIAL PRIMARY KEY,
    OrderId INT4 NOT NULL,
    InvoiceDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    TotalAmount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (TotalAmount >= 0),
    TaxAmount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (TaxAmount >= 0),
    CONSTRAINT FKInvoice_Order FOREIGN KEY (OrderId) REFERENCES "Order" (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE InvoiceItem (
    Id SERIAL PRIMARY KEY,
    InvoiceId INT4 NOT NULL,
    OrderItemId INT4 NOT NULL,
    OriginalPrice NUMERIC(10,2) NOT NULL CHECK (OriginalPrice >= 0),
    DiscountedPrice NUMERIC(10,2) CHECK (DiscountedPrice >= 0),
    Quantity INT4 NOT NULL CHECK (Quantity > 0),
    CONSTRAINT FKInvoiceItem_Invoice FOREIGN KEY (InvoiceId) REFERENCES Invoice (Id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT FKInvoiceItem_OrderItem FOREIGN KEY (OrderItemId) REFERENCES OrderItem (Id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);
