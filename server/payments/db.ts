import { desc, eq, or } from "drizzle-orm";
import { drivers, rides } from "../../drizzle/schema";
import { ridePayments } from "../../drizzle/payment-schema";
import { getDb } from "../db";
import type { PaymentActor, PaymentWithRide } from "./types";

export type PaymentDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type PaymentExecutor = any;

type RideAccess = {
  ride: typeof rides.$inferSelect;
  driverUserId: number | null;
};

export async function requirePaymentDb(): Promise<PaymentDb> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}

export async function findRideAccess(
  db: PaymentExecutor,
  rideId: number,
): Promise<RideAccess | null> {
  const rows = await db
    .select({ ride: rides, driverUserId: drivers.userId })
    .from(rides)
    .leftJoin(drivers, eq(rides.driverId, drivers.id))
    .where(eq(rides.id, rideId))
    .limit(1);
  return rows[0] ?? null;
}

export function canViewRide(actor: PaymentActor, access: RideAccess): boolean {
  return (
    actor.role === "admin" ||
    access.ride.customerId === actor.id ||
    access.driverUserId === actor.id
  );
}

export function isCustomer(actor: PaymentActor, access: RideAccess): boolean {
  return actor.role !== "admin" && access.ride.customerId === actor.id;
}

export function canStartCheckout(
  actor: PaymentActor,
  access: RideAccess,
): boolean {
  return isCustomer(actor, access) && access.ride.status === "completed";
}

async function mapRows(
  rows: { payment: typeof ridePayments.$inferSelect; rideCode: string }[],
): Promise<PaymentWithRide[]> {
  return rows.map((row) => ({ ...row.payment, rideCode: row.rideCode }));
}

export async function findPaymentByRide(
  db: PaymentExecutor,
  rideId: number,
): Promise<PaymentWithRide | null> {
  const rows = await db
    .select({ payment: ridePayments, rideCode: rides.code })
    .from(ridePayments)
    .innerJoin(rides, eq(ridePayments.rideId, rides.id))
    .where(eq(ridePayments.rideId, rideId))
    .limit(1);
  return rows[0] ? { ...rows[0].payment, rideCode: rows[0].rideCode } : null;
}

export async function listPaymentsForActor(
  db: PaymentExecutor,
  actor: PaymentActor,
): Promise<PaymentWithRide[]> {
  const condition =
    actor.role === "admin"
      ? undefined
      : actor.role === "driver"
        ? or(eq(rides.customerId, actor.id), eq(drivers.userId, actor.id))
        : eq(rides.customerId, actor.id);
  const query = db
    .select({ payment: ridePayments, rideCode: rides.code })
    .from(ridePayments)
    .innerJoin(rides, eq(ridePayments.rideId, rides.id))
    .leftJoin(drivers, eq(rides.driverId, drivers.id))
    .orderBy(desc(ridePayments.createdAt));
  return mapRows(condition ? await query.where(condition) : await query);
}

export async function findPaymentById(
  db: PaymentExecutor,
  paymentId: number,
): Promise<PaymentWithRide | null> {
  const rows = await db
    .select({ payment: ridePayments, rideCode: rides.code })
    .from(ridePayments)
    .innerJoin(rides, eq(ridePayments.rideId, rides.id))
    .where(eq(ridePayments.id, paymentId))
    .limit(1);
  return rows[0] ? { ...rows[0].payment, rideCode: rows[0].rideCode } : null;
}

export async function findPaymentBySession(
  db: PaymentExecutor,
  sessionRef: string,
): Promise<PaymentWithRide | null> {
  const rows = await db
    .select({ payment: ridePayments, rideCode: rides.code })
    .from(ridePayments)
    .innerJoin(rides, eq(ridePayments.rideId, rides.id))
    .where(eq(ridePayments.sessionRef, sessionRef))
    .limit(1);
  return rows[0] ? { ...rows[0].payment, rideCode: rows[0].rideCode } : null;
}

export function paymentActor(user: PaymentActor): PaymentActor {
  return user;
}
