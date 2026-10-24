import {
  boolean,
  double,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core user table backing the existing Manus OAuth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "driver", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const drivers = mysqlTable(
  "drivers",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().unique(),
    name: text("name").notNull(),
    phone: varchar("phone", { length: 32 }).notNull(),
    zone: varchar("zone", { length: 120 }).notNull(),
    experience: int("experience").notNull().default(0),
    licenseNumber: varchar("licenseNumber", { length: 120 }).notNull(),
    documentNote: text("documentNote").notNull(),
    vehiclePlate: varchar("vehiclePlate", { length: 32 }).notNull(),
    verification: mysqlEnum("verification", ["pending", "verified", "rejected", "suspended"])
      .notNull()
      .default("pending"),
    rejectionReason: text("rejectionReason"),
    available: boolean("available").notNull().default(false),
    rating: double("rating").notNull().default(0),
    trips: int("trips").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [index("drivers_verification_available_idx").on(table.verification, table.available)],
);

export type DriverRow = typeof drivers.$inferSelect;
export type InsertDriver = typeof drivers.$inferInsert;

export const rides = mysqlTable(
  "rides",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 40 }).notNull().unique(),
    customerId: int("customerId").notNull(),
    driverId: int("driverId"),
    gpsSessionId: varchar("gpsSessionId", { length: 64 }),
    pickup: text("pickup").notNull(),
    dropoff: text("dropoff").notNull(),
    pickupLat: double("pickupLat"),
    pickupLng: double("pickupLng"),
    dropoffLat: double("dropoffLat"),
    dropoffLng: double("dropoffLng"),
    routePolyline: text("routePolyline"),
    routeDurationSeconds: int("routeDurationSeconds"),
    routeSource: mysqlEnum("routeSource", ["manual", "google_maps"]).notNull().default("manual"),
    zone: varchar("zone", { length: 120 }).notNull(),
    distanceKm: double("distanceKm").notNull(),
    scheduledAt: timestamp("scheduledAt").notNull(),
    vehicleType: mysqlEnum("vehicleType", ["automatic", "manual", "luxury"]).notNull(),
    phone: varchar("phone", { length: 32 }).notNull(),
    note: text("note").notNull(),
    price: int("price").notNull(),
    driverIncome: int("driverIncome").notNull(),
    status: mysqlEnum("status", [
      "pending",
      "offered",
      "accepted",
      "arriving",
      "met",
      "in_progress",
      "completed",
      "cancelled",
    ])
      .notNull()
      .default("pending"),
    customerName: text("customerName").notNull(),
    driverName: text("driverName"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("rides_customer_status_idx").on(table.customerId, table.status),
    index("rides_driver_status_idx").on(table.driverId, table.status),
    index("rides_scheduled_status_idx").on(table.scheduledAt, table.status),
  ],
);

export type RideRow = typeof rides.$inferSelect;
export type InsertRide = typeof rides.$inferInsert;

export const rideLocations = mysqlTable(
  "ride_locations",
  {
    rideId: int("rideId").primaryKey(),
    driverId: int("driverId").notNull(),
    userId: int("userId").notNull(),
    lat: double("lat").notNull(),
    lng: double("lng").notNull(),
    accuracy: double("accuracy"),
    capturedAt: timestamp("capturedAt").notNull(),
    receivedAt: timestamp("receivedAt").defaultNow().notNull(),
    sharing: boolean("sharing").notNull().default(true),
  },
  (table) => [
    index("ride_locations_driver_idx").on(table.driverId),
    index("ride_locations_received_idx").on(table.receivedAt),
  ],
);

export type RideLocationRow = typeof rideLocations.$inferSelect;
export type InsertRideLocation = typeof rideLocations.$inferInsert;

export const offers = mysqlTable(
  "offers",
  {
    id: int("id").autoincrement().primaryKey(),
    rideId: int("rideId").notNull(),
    driverId: int("driverId").notNull(),
    status: mysqlEnum("status", ["sent", "accepted", "rejected", "expired"])
      .notNull()
      .default("sent"),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("offers_driver_status_idx").on(table.driverId, table.status),
    index("offers_ride_status_idx").on(table.rideId, table.status),
  ],
);

export type OfferRow = typeof offers.$inferSelect;
export type InsertOffer = typeof offers.$inferInsert;

export const rideEvents = mysqlTable(
  "ride_events",
  {
    id: int("id").autoincrement().primaryKey(),
    rideId: int("rideId"),
    message: text("message").notNull(),
    actorName: text("actorName").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("ride_events_ride_created_idx").on(table.rideId, table.createdAt)],
);

export type RideEventRow = typeof rideEvents.$inferSelect;

export const pricingSettings = mysqlTable("pricing_settings", {
  id: int("id").primaryKey(),
  baseFare: int("baseFare").notNull(),
  perKm: int("perKm").notNull(),
  minFare: int("minFare").notNull(),
  nightFee: int("nightFee").notNull(),
  peakFee: int("peakFee").notNull(),
  commissionPercent: double("commissionPercent").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PricingRow = typeof pricingSettings.$inferSelect;
