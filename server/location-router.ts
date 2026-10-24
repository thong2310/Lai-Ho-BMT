import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { DriverLocation, TrackingSnapshot } from "../shared/mobility";
import { drivers, rideLocations, rides, type RideLocationRow, type RideRow } from "../drizzle/schema";
import { getDb } from "./db";
import { mapRideRoute } from "./domain-db";
import { protectedProcedure, router } from "./_core/trpc";
import { ACTIVE_RIDE_STATUSES } from "./services/rules";

const activeStatuses = new Set(ACTIVE_RIDE_STATUSES);
const coordinate = z.number().finite();
const capturedAt = z.string().trim().min(1).max(80);
const sessionId = z.string().min(16).max(64);

type Executor = any;
type User = { id: number; role: "user" | "driver" | "admin" };

function locationError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  const raw = error instanceof Error ? error.message : "";
  const messages: Record<string, string> = {
    "Database is unavailable": "Dịch vụ dữ liệu hiện không khả dụng",
    "Ride not found": "Không tìm thấy cuốc xe",
    "Driver profile not found": "Bạn chưa có hồ sơ tài xế",
    "You cannot view this ride": "Bạn không có quyền xem vị trí cuốc xe này",
    "This ride is not assigned to you": "Cuốc xe này không được giao cho bạn",
    "Driver is not verified": "Tài xế chưa được xác minh",
    "Location updates require an active ride": "Chỉ được gửi vị trí khi cuốc đang hoạt động",
    "Location timestamp is outside the allowed window": "Thời điểm GPS không hợp lệ",
    "Location accuracy is invalid": "Độ chính xác GPS không hợp lệ",
  };
  const code = raw === "Database is unavailable"
    ? "INTERNAL_SERVER_ERROR"
    : raw === "You cannot view this ride" || raw === "This ride is not assigned to you" || raw === "Driver is not verified"
      ? "FORBIDDEN"
      : "BAD_REQUEST";
  throw new TRPCError({ code, message: messages[raw] ?? "Không thể cập nhật vị trí" });
}

function staleGpsSession(): never {
  throw new TRPCError({ code: "FORBIDDEN", message: "Phiên chia sẻ GPS đã dừng hoặc thay đổi" });
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}

async function findRide(db: Executor, rideId: number, lock = false): Promise<RideRow> {
  let query = db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
  if (lock) query = query.for("update");
  const [ride] = await query;
  if (!ride) throw new Error("Ride not found");
  return ride;
}

async function findDriver(db: Executor, userId: number, lock = false): Promise<{ id: number; userId: number; verification: string }> {
  let query = db.select({ id: drivers.id, userId: drivers.userId, verification: drivers.verification }).from(drivers).where(eq(drivers.userId, userId)).limit(1);
  if (lock) query = query.for("update");
  const [driver] = await query;
  if (!driver) throw new Error("Driver profile not found");
  return driver;
}

async function findDriverOrNull(db: Executor, userId: number): Promise<{ id: number; userId: number; verification: string } | null> {
  const [driver] = await db.select({ id: drivers.id, userId: drivers.userId, verification: drivers.verification }).from(drivers).where(eq(drivers.userId, userId)).limit(1);
  return driver ?? null;
}

function dateValue(value: Date | string): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

function mapLocation(row: RideLocationRow): DriverLocation {
  const receivedAt = new Date(dateValue(row.receivedAt)).toISOString();
  const captured = new Date(dateValue(row.capturedAt)).toISOString();
  return {
    lat: Number(row.lat),
    lng: Number(row.lng),
    accuracy: row.accuracy === null ? null : Number(row.accuracy),
    capturedAt: captured,
    receivedAt,
    driverId: row.driverId,
    sharing: Boolean(row.sharing),
    stale: Date.now() - dateValue(row.receivedAt) > 2 * 60 * 1000,
  };
}

function snapshotFor(ride: RideRow, row: RideLocationRow | undefined, canShare: boolean): TrackingSnapshot {
  const active = activeStatuses.has(ride.status as (typeof ACTIVE_RIDE_STATUSES)[number]);
  const receivedAt = row ? dateValue(row.receivedAt) : NaN;
  const usable = Boolean(
    active &&
      ride.gpsSessionId &&
      ride.driverId !== null &&
      row &&
      row.driverId === ride.driverId &&
      row.sharing &&
      Number.isFinite(receivedAt) &&
      receivedAt >= Date.now() - 15 * 60 * 1000 &&
      receivedAt <= Date.now(),
  );
  return {
    rideId: ride.id,
    driverId: ride.driverId,
    canShare,
    active,
    route: mapRideRoute(ride),
    location: usable && row ? mapLocation(row) : null,
  };
}

export function isValidCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function isValidAccuracy(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value >= 0 && value <= 5000);
}

export function isValidCapturedAt(value: string, now = Date.now()): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= now - 2 * 60 * 1000 && timestamp <= now + 30 * 1000;
}

function assertCoordinate(lat: number, lng: number): void {
  if (!isValidCoordinate(lat, lng)) throw new TRPCError({ code: "BAD_REQUEST", message: "Tọa độ GPS không hợp lệ" });
}

function assertCapturedAt(value: string): Date {
  if (!isValidCapturedAt(value)) throw new Error("Location timestamp is outside the allowed window");
  const timestamp = Date.parse(value);
  return new Date(timestamp);
}

async function readLocation(db: Executor, rideId: number, lock = false): Promise<RideLocationRow | undefined> {
  let query = db.select().from(rideLocations).where(eq(rideLocations.rideId, rideId)).limit(1);
  if (lock) query = query.for("update");
  const [row] = await query;
  return row;
}

async function authorizeSnapshot(db: Executor, user: User, ride: RideRow): Promise<boolean> {
  if (user.role === "admin") return false;
  const driver = await findDriverOrNull(db, user.id);
  if (driver && ride.driverId === driver.id) return driver.verification === "verified" && activeStatuses.has(ride.status as (typeof ACTIVE_RIDE_STATUSES)[number]);
  if (ride.customerId === user.id) return false;
  throw new Error("You cannot view this ride");
}

const rideIdInput = z.object({ rideId: z.number().int().positive("Mã cuốc xe không hợp lệ") });
const sessionInput = z.object({ rideId: z.number().int().positive("Mã cuốc xe không hợp lệ"), sessionId });

export const locationRouter = router({
  begin: protectedProcedure.input(rideIdInput).mutation(async ({ ctx, input }): Promise<{ sessionId: string }> => {
    try {
      const db = await requireDb();
      return await db.transaction(async (tx: Executor) => {
        const ride = await findRide(tx, input.rideId, true);
        const driver = await findDriver(tx, ctx.user.id, true);
        if (driver.verification !== "verified") throw new Error("Driver is not verified");
        if (ride.driverId !== driver.id) throw new Error("This ride is not assigned to you");
        if (!activeStatuses.has(ride.status as (typeof ACTIVE_RIDE_STATUSES)[number])) throw new Error("Location updates require an active ride");
        const nextSessionId = randomUUID();
        await tx.update(rides).set({ gpsSessionId: nextSessionId }).where(eq(rides.id, ride.id));
        await tx.update(rideLocations).set({ sharing: false }).where(eq(rideLocations.rideId, ride.id));
        return { sessionId: nextSessionId };
      });
    } catch (error) {
      return locationError(error);
    }
  }),

  snapshot: protectedProcedure.input(rideIdInput).query(async ({ ctx, input }): Promise<TrackingSnapshot> => {
    try {
      const db = await requireDb();
      return await db.transaction(async (tx: Executor) => {
        const ride = await findRide(tx, input.rideId, true);
        const canShare = await authorizeSnapshot(tx, ctx.user, ride);
        return snapshotFor(ride, await readLocation(tx, ride.id, true), canShare);
      });
    } catch (error) {
      return locationError(error);
    }
  }),

  update: protectedProcedure.input(z.object({
    rideId: z.number().int().positive("Mã cuốc xe không hợp lệ"),
    sessionId,
    lat: coordinate,
    lng: coordinate,
    accuracy: coordinate.nullable(),
    capturedAt,
  })).mutation(async ({ ctx, input }): Promise<TrackingSnapshot> => {
    try {
      assertCoordinate(input.lat, input.lng);
      if (input.accuracy !== null && (input.accuracy < 0 || input.accuracy > 5000)) throw new Error("Location accuracy is invalid");
      const captured = assertCapturedAt(input.capturedAt);
      const db = await requireDb();
      return await db.transaction(async (tx: Executor) => {
        const ride = await findRide(tx, input.rideId, true);
        const driver = await findDriver(tx, ctx.user.id, true);
        if (driver.verification !== "verified") throw new Error("Driver is not verified");
        if (ride.driverId !== driver.id) throw new Error("This ride is not assigned to you");
        if (!activeStatuses.has(ride.status as (typeof ACTIVE_RIDE_STATUSES)[number])) throw new Error("Location updates require an active ride");
        if (ride.gpsSessionId !== input.sessionId) staleGpsSession();
        const existing = await readLocation(tx, ride.id, true);
        if (existing && existing.driverId === driver.id && dateValue(existing.capturedAt) > captured.getTime()) return snapshotFor(ride, existing, true);
        await tx.insert(rideLocations).values({
          rideId: ride.id,
          driverId: driver.id,
          userId: ctx.user.id,
          lat: input.lat,
          lng: input.lng,
          accuracy: input.accuracy,
          capturedAt: captured,
          receivedAt: new Date(),
          sharing: true,
        }).onDuplicateKeyUpdate({ set: {
          driverId: driver.id,
          userId: ctx.user.id,
          lat: input.lat,
          lng: input.lng,
          accuracy: input.accuracy,
          capturedAt: captured,
          receivedAt: new Date(),
          sharing: true,
        } });
        return snapshotFor(ride, await readLocation(tx, ride.id, true), true);
      });
    } catch (error) {
      return locationError(error);
    }
  }),

  stop: protectedProcedure.input(sessionInput).mutation(async ({ ctx, input }): Promise<{ success: true }> => {
    try {
      const db = await requireDb();
      await db.transaction(async (tx: Executor) => {
        const ride = await findRide(tx, input.rideId, true);
        const driver = await findDriver(tx, ctx.user.id, true);
        if (ride.driverId !== driver.id) throw new Error("This ride is not assigned to you");
        if (ride.gpsSessionId !== input.sessionId) return;
        await tx.update(rides).set({ gpsSessionId: null }).where(eq(rides.id, ride.id));
        await tx.update(rideLocations).set({ sharing: false }).where(eq(rideLocations.rideId, ride.id));
      });
      return { success: true as const };
    } catch (error) {
      return locationError(error);
    }
  }),
});
