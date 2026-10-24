import { int, mysqlEnum, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";

export const ridePaymentStatus = mysqlEnum("status", [
  "unpaid",
  "creating",
  "pending",
  "paid",
  "failed",
  "expired",
]);

export const ridePayments = mysqlTable("ride_payments", {
  id: int("id").autoincrement().primaryKey(),
  rideId: int("rideId").notNull().unique(),
  customerId: int("customerId").notNull(),
  provider: varchar("provider", { length: 32 }).notNull(),
  amount: int("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("VND"),
  status: ridePaymentStatus.notNull().default("unpaid"),
  attempt: int("attempt").notNull().default(1),
  sessionRef: varchar("sessionRef", { length: 100 }).unique(),
  providerTransactionId: varchar("providerTransactionId", { length: 255 }),
  checkoutUrl: varchar("checkoutUrl", { length: 2048 }),
  returnOrigin: varchar("returnOrigin", { length: 512 }),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  paidAt: timestamp("paidAt"),
});

export const paymentEvents = mysqlTable("payment_events", {
  eventId: varchar("eventId", { length: 255 }).primaryKey(),
  provider: varchar("provider", { length: 32 }).notNull(),
  type: varchar("type", { length: 128 }).notNull(),
  processedAt: timestamp("processedAt").defaultNow().notNull(),
});

export type RidePaymentRow = typeof ridePayments.$inferSelect;
export type InsertRidePayment = typeof ridePayments.$inferInsert;
export type PaymentEventRow = typeof paymentEvents.$inferSelect;
