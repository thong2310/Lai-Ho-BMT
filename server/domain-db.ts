import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { Pricing, Driver, Offer, Quote, Ride, RideEvent, RideStatus, Verification, VehicleType, Workspace } from "../shared/domain";
import { DEFAULT_PRICING } from "../shared/domain";
import { drivers, offers, pricingSettings, rideEvents, rides, users, type DriverRow, type RideRow } from "../drizzle/schema";
import { getDb } from "./db";
import { calculateQuote } from "./services/quote";
import {
  ACTIVE_RIDE_STATUSES,
  canAdvanceRide,
  canCancelRide,
  isEligibleDriver,
  isValidPricing,
  maskPhone,
  nextRideStatus,
  RIDE_STATUS_LABELS,
  VERIFICATION_STATUS_LABELS,
} from "./services/rules";

export type DomainUser = { id: number; name: string | null; role: "user" | "driver" | "admin" };
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Executor = any;

function actorName(user: DomainUser): string {
  return user.name?.trim() || "Người dùng";
}

async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}

function insertedId(result: unknown): number {
  const id = Number((result as any)?.[0]?.insertId);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Database did not return an inserted id");
  return id;
}

function iso(value: Date | string | null): string {
  return new Date(value ?? 0).toISOString();
}

function mapPricing(row: typeof pricingSettings.$inferSelect): Pricing {
  return {
    baseFare: row.baseFare,
    perKm: row.perKm,
    minFare: row.minFare,
    nightFee: row.nightFee,
    peakFee: row.peakFee,
    commissionPercent: Number(row.commissionPercent),
  };
}

function mapDriver(row: DriverRow): Driver {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    phone: row.phone,
    zone: row.zone,
    experience: row.experience,
    licenseNumber: row.licenseNumber,
    documentNote: row.documentNote,
    vehiclePlate: row.vehiclePlate,
    verification: row.verification as Verification,
    rejectionReason: row.rejectionReason,
    available: Boolean(row.available),
    rating: Number(row.rating),
    trips: row.trips,
    createdAt: iso(row.createdAt),
  };
}

function mapRide(row: RideRow): Ride {
  return {
    id: row.id,
    code: row.code,
    customerId: row.customerId,
    driverId: row.driverId,
    pickup: row.pickup,
    dropoff: row.dropoff,
    zone: row.zone,
    distanceKm: Number(row.distanceKm),
    scheduledAt: iso(row.scheduledAt),
    vehicleType: row.vehicleType as VehicleType,
    phone: row.phone,
    note: row.note,
    price: row.price,
    driverIncome: row.driverIncome,
    status: row.status as RideStatus,
    customerName: row.customerName,
    driverName: row.driverName,
    createdAt: iso(row.createdAt),
  };
}

function mapEvent(row: typeof rideEvents.$inferSelect): RideEvent {
  return { id: row.id, rideId: row.rideId, message: row.message, actorName: row.actorName, createdAt: iso(row.createdAt) };
}

async function ensurePricing(db: Executor): Promise<void> {
  await db.insert(pricingSettings).values({ id: 1, ...DEFAULT_PRICING }).onDuplicateKeyUpdate({ set: { id: sql`id` } });
}

export async function getPricing(): Promise<Pricing> {
  const db = await requireDb();
  await ensurePricing(db);
  const [row] = await db.select().from(pricingSettings).where(eq(pricingSettings.id, 1)).limit(1);
  if (!row) throw new Error("Pricing settings are unavailable");
  return mapPricing(row);
}

export async function quoteBooking(input: { distanceKm: number; scheduledAt: string; vehicleType: VehicleType }): Promise<Quote> {
  return calculateQuote(await getPricing(), input);
}

async function addEvent(db: Executor, rideId: number | null, message: string, user: DomainUser): Promise<void> {
  await db.insert(rideEvents).values({ rideId, message, actorName: actorName(user) });
}

async function findRide(db: Executor, rideId: number, lock = false): Promise<RideRow> {
  let query = db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
  if (lock) query = query.for("update");
  const [row] = await query;
  if (!row) throw new Error("Ride not found");
  return row;
}

async function findDriverByUser(db: Executor, userId: number, lock = false): Promise<DriverRow> {
  let query = db.select().from(drivers).where(eq(drivers.userId, userId)).limit(1);
  if (lock) query = query.for("update");
  const [row] = await query;
  if (!row) throw new Error("Driver profile not found");
  return row;
}

async function findDriverByUserOrNull(db: Executor, userId: number): Promise<DriverRow | null> {
  const [row] = await db.select().from(drivers).where(eq(drivers.userId, userId)).limit(1);
  return row ?? null;
}

async function findDriver(db: Executor, driverId: number, lock = false): Promise<DriverRow> {
  let query = db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
  if (lock) query = query.for("update");
  const [row] = await query;
  if (!row) throw new Error("Driver not found");
  return row;
}

async function activeRideForDriver(db: Executor, driverId: number, excludeRideId?: number): Promise<boolean> {
  const conditions = [eq(rides.driverId, driverId), inArray(rides.status, ACTIVE_RIDE_STATUSES)];
  if (excludeRideId !== undefined) conditions.push(ne(rides.id, excludeRideId));
  const [row] = await db.select({ id: rides.id }).from(rides).where(and(...conditions)).limit(1);
  return Boolean(row);
}

export async function createBooking(
  user: DomainUser,
  input: { pickup: string; dropoff: string; zone: string; distanceKm: number; scheduledAt: string; vehicleType: VehicleType; phone: string; note: string },
): Promise<Ride> {
  const pickup = input.pickup.trim();
  const dropoff = input.dropoff.trim();
  if (pickup.localeCompare(dropoff, undefined, { sensitivity: "accent" }) === 0) throw new Error("Pickup and dropoff must be different");
  const db = await requireDb();
  const pricing = await getPricing();
  const quote = calculateQuote(pricing, input);
  const code = `LXH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  return db.transaction(async (tx) => {
    const result = await tx.insert(rides).values({
      code,
      customerId: user.id,
      pickup,
      dropoff,
      zone: input.zone.trim(),
      distanceKm: quote.distanceKm,
      scheduledAt: new Date(input.scheduledAt),
      vehicleType: input.vehicleType,
      phone: input.phone,
      note: input.note.trim(),
      price: quote.total,
      driverIncome: quote.driverIncome,
      customerName: actorName(user),
      status: "pending",
    });
    const ride = await findRide(tx, insertedId(result));
    await addEvent(tx, ride.id, "Khách đã tạo cuốc xe", user);
    return mapRide(ride);
  });
}

export async function cancelBooking(user: DomainUser, rideId: number): Promise<Ride> {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const ride = await findRide(tx, rideId, true);
    if (user.role !== "admin" && ride.customerId !== user.id) throw new Error("You cannot cancel this ride");
    if (!canCancelRide(ride.status as RideStatus)) throw new Error("This ride cannot be cancelled");
    await tx.update(rides).set({ status: "cancelled" }).where(eq(rides.id, rideId));
    await tx.update(offers).set({ status: "expired" }).where(and(eq(offers.rideId, rideId), eq(offers.status, "sent")));
    await addEvent(tx, rideId, "Cuốc đã được hủy", user);
    return mapRide({ ...ride, status: "cancelled" });
  });
}

export async function registerDriver(user: DomainUser, input: { name: string; phone: string; zone: string; experience: number; licenseNumber: string; documentNote: string; vehiclePlate: string }): Promise<Driver> {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(drivers).where(eq(drivers.userId, user.id)).limit(1).for("update");
    if (existing.length) {
      const current = existing[0];
      if (current.verification === "suspended") throw new Error("Suspended drivers cannot self-unlock");
      const changed = ["name", "phone", "zone", "experience", "licenseNumber", "documentNote", "vehiclePlate"]
        .some((field) => (current as any)[field] !== (input as any)[field]);
      if (changed && await activeRideForDriver(tx, current.id)) throw new Error("Cannot edit driver credentials during an active ride");
      const resubmitting = current.verification === "pending" || current.verification === "rejected";
      if (changed || current.verification === "rejected") {
        const nextVerification = "pending" as const;
        await tx.update(drivers).set({ ...input, verification: nextVerification, rejectionReason: null, available: false }).where(eq(drivers.id, current.id));
        await tx.update(offers).set({ status: "expired" }).where(and(eq(offers.driverId, current.id), eq(offers.status, "sent")));
      }
      if (changed || resubmitting) await addEvent(tx, null, "Tài xế đã gửi hồ sơ đăng ký", user);
      if (user.role !== "admin") await tx.update(users).set({ role: "driver" }).where(and(eq(users.id, user.id), ne(users.role, "admin")));
      return mapDriver(await findDriver(tx, current.id));
    }
    const result = await tx.insert(drivers).values({ ...input, userId: user.id, available: false, verification: "pending" });
    await addEvent(tx, null, "Tài xế đã gửi hồ sơ đăng ký", user);
    if (user.role !== "admin") await tx.update(users).set({ role: "driver" }).where(and(eq(users.id, user.id), ne(users.role, "admin")));
    return mapDriver(await findDriver(tx, insertedId(result)));
  });
}

export async function setOwnAvailability(user: DomainUser, available: boolean): Promise<Driver> {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const driver = await findDriverByUser(tx, user.id, true);
    if (available && !isEligibleDriver(driver.verification as Verification, true)) throw new Error("Driver must be verified before going online");
    await tx.update(drivers).set({ available }).where(eq(drivers.id, driver.id));
    return mapDriver({ ...driver, available });
  });
}

export async function acceptOffer(user: DomainUser, offerId: number): Promise<Ride> {
  const db = await requireDb();
  const driverHint = await findDriverByUser(db, user.id);
  const [offerHint] = await db.select().from(offers).where(and(eq(offers.id, offerId), eq(offers.driverId, driverHint.id))).limit(1);
  if (!offerHint) throw new Error("Offer not found");
  return db.transaction(async (tx) => {
    const ride = await findRide(tx, offerHint.rideId, true);
    const driver = await findDriverByUser(tx, user.id, true);
    const [offer] = await tx.select().from(offers).where(and(eq(offers.id, offerId), eq(offers.driverId, driver.id), eq(offers.rideId, ride.id))).limit(1).for("update");
    if (!offer) throw new Error("Offer not found");
    if (!isEligibleDriver(driver.verification as Verification, Boolean(driver.available))) throw new Error("Driver is not eligible to accept rides");
    if (await activeRideForDriver(tx, driver.id, ride.id)) throw new Error("Driver already has an active ride");
    if (offer.status !== "sent") throw new Error("Offer is no longer available");
    if (new Date(offer.expiresAt).getTime() <= Date.now()) throw new Error("Offer has expired");
    if (ride.status !== "pending" && ride.status !== "offered") throw new Error("Ride is no longer available");
    await tx.update(rides).set({ driverId: driver.id, driverName: driver.name, status: "accepted" }).where(eq(rides.id, ride.id));
    await tx.update(offers).set({ status: "accepted" }).where(eq(offers.id, offer.id));
    await tx.update(offers).set({ status: "expired" }).where(and(eq(offers.rideId, ride.id), eq(offers.status, "sent"), ne(offers.id, offer.id)));
    await addEvent(tx, ride.id, `Tài xế ${driver.name} đã nhận cuốc`, user);
    return mapRide({ ...ride, driverId: driver.id, driverName: driver.name, status: "accepted" });
  });
}

export async function rejectOffer(user: DomainUser, offerId: number): Promise<{ success: true }> {
  const db = await requireDb();
  const driverHint = await findDriverByUser(db, user.id);
  const [offerHint] = await db.select().from(offers).where(and(eq(offers.id, offerId), eq(offers.driverId, driverHint.id))).limit(1);
  if (!offerHint) throw new Error("Offer is no longer available");
  return db.transaction(async (tx) => {
    await findRide(tx, offerHint.rideId, true);
    const driver = await findDriverByUser(tx, user.id, true);
    const [offer] = await tx.select().from(offers).where(and(eq(offers.id, offerId), eq(offers.driverId, driver.id), eq(offers.rideId, offerHint.rideId))).limit(1).for("update");
    if (!offer || offer.status !== "sent") throw new Error("Offer is no longer available");
    if (new Date(offer.expiresAt).getTime() <= Date.now()) throw new Error("Offer has expired");
    await tx.update(offers).set({ status: "rejected" }).where(eq(offers.id, offerId));
    await addEvent(tx, offer.rideId, `Tài xế ${driver.name} đã từ chối lời mời`, user);
    return { success: true as const };
  });
}

export async function advanceRide(user: DomainUser, rideId: number): Promise<Ride> {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const ride = await findRide(tx, rideId, true);
    const driver = await findDriverByUser(tx, user.id, true);
    if (driver.verification !== "verified") throw new Error("Driver is not verified");
    if (ride.driverId !== driver.id) throw new Error("This ride is not assigned to you");
    const next = nextRideStatus(ride.status as RideStatus);
    if (!next || !canAdvanceRide(ride.status as RideStatus)) throw new Error("Invalid ride transition");
    await tx.update(rides).set({ status: next }).where(eq(rides.id, rideId));
    if (next === "completed") await tx.update(drivers).set({ trips: sql`${drivers.trips} + 1` }).where(eq(drivers.id, driver.id));
    await addEvent(tx, rideId, `Cuốc chuyển sang trạng thái ${RIDE_STATUS_LABELS[next]}`, user);
    return mapRide({ ...ride, status: next });
  });
}

export async function dispatchRide(user: DomainUser, rideId: number, driverIds: number[]): Promise<{ success: true; offerIds: number[] }> {
  const db = await requireDb();
  const uniqueIds = [...new Set(driverIds)];
  if (!uniqueIds.length) throw new Error("At least one driver is required");
  return db.transaction(async (tx) => {
    const ride = await findRide(tx, rideId, true);
    if (!["pending", "offered", "accepted", "arriving", "met"].includes(ride.status)) throw new Error("Ride cannot be dispatched in its current state");
    const lockedIds = [...new Set(ride.driverId ? [...uniqueIds, ride.driverId] : uniqueIds)].sort((a, b) => a - b);
    const lockedDrivers = new Map<number, DriverRow>();
    for (const driverId of lockedIds) lockedDrivers.set(driverId, await findDriver(tx, driverId, true));
    for (const driverId of uniqueIds) {
      const driver = lockedDrivers.get(driverId)!;
      if (!isEligibleDriver(driver.verification as Verification, Boolean(driver.available))) throw new Error(`Driver ${driverId} is not available`);
      if (await activeRideForDriver(tx, driver.id, rideId)) throw new Error(`Driver ${driverId} already has an active ride`);
    }
    if (ride.driverId) {
      const oldDriver = lockedDrivers.get(ride.driverId)!;
      await tx.update(offers).set({ status: "expired" }).where(and(eq(offers.rideId, rideId), eq(offers.status, "accepted")));
      await addEvent(tx, rideId, `Admin đã thu hồi tài xế ${oldDriver.name} để điều phối lại`, user);
    }
    await tx.update(offers).set({ status: "expired" }).where(and(eq(offers.rideId, rideId), inArray(offers.status, ["sent", "accepted"])));
    await tx.update(rides).set({ driverId: null, driverName: null, status: "offered" }).where(eq(rides.id, rideId));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const offerIds: number[] = [];
    for (const driverId of uniqueIds) {
      const result = await tx.insert(offers).values({ rideId, driverId, status: "sent", expiresAt });
      offerIds.push(insertedId(result));
    }
    await addEvent(tx, rideId, `Admin đã điều phối lại đến ${uniqueIds.length} tài xế`, user);
    return { success: true as const, offerIds };
  });
}

export async function verifyDriver(user: DomainUser, driverId: number, verification: Verification, reason: string): Promise<Driver> {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const driver = await findDriver(tx, driverId, true);
    if ((verification === "rejected" || verification === "suspended") && !reason.trim()) throw new Error("A reason is required");
    if ((verification === "rejected" || verification === "suspended") && await activeRideForDriver(tx, driver.id)) throw new Error("Driver has active rides that must be reassigned before this action");
    if (verification === "verified" && (!driver.licenseNumber.trim() || !driver.documentNote.trim() || !driver.vehiclePlate.trim())) throw new Error("Credential metadata is incomplete");
    const available = verification === "verified" ? Boolean(driver.available) : false;
    await tx.update(drivers).set({ verification, rejectionReason: reason.trim() || null, available }).where(eq(drivers.id, driverId));
    if (verification !== "verified") {
      await tx.update(offers).set({ status: "expired" }).where(and(eq(offers.driverId, driverId), eq(offers.status, "sent")));
    }
    await addEvent(tx, null, `Admin cập nhật xác minh tài xế ${driver.name}: ${VERIFICATION_STATUS_LABELS[verification]}`, user);
    return mapDriver({ ...driver, verification, rejectionReason: reason.trim() || null, available });
  });
}

export async function setDriverAvailability(user: DomainUser, driverId: number, available: boolean): Promise<Driver> {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const driver = await findDriver(tx, driverId, true);
    if (available && driver.verification !== "verified") throw new Error("Only verified drivers can be available");
    await tx.update(drivers).set({ available }).where(eq(drivers.id, driverId));
    await addEvent(tx, null, `Admin ${available ? "bật" : "tắt"} khả dụng tài xế ${driver.name}`, user);
    return mapDriver({ ...driver, available });
  });
}

export async function updatePricing(user: DomainUser, pricing: Pricing): Promise<Pricing> {
  if (!isValidPricing(pricing)) throw new Error("Pricing values are outside the allowed limits");
  const db = await requireDb();
  await db.transaction(async (tx) => {
    await tx.update(pricingSettings).set(pricing).where(eq(pricingSettings.id, 1));
    await addEvent(tx, null, "Admin đã cập nhật bảng giá", user);
  });
  return getPricing();
}

async function workspaceRides(db: Executor, user: DomainUser, profile: DriverRow | null): Promise<Ride[]> {
  const rows = user.role === "admin"
    ? await db.select().from(rides).orderBy(desc(rides.createdAt))
    : user.role === "driver" && profile
      ? await db.select().from(rides).where(or(eq(rides.customerId, user.id), eq(rides.driverId, profile.id))).orderBy(desc(rides.createdAt))
      : await db.select().from(rides).where(eq(rides.customerId, user.id)).orderBy(desc(rides.createdAt));
  return rows.map(mapRide);
}

export async function getWorkspace(user: DomainUser): Promise<Workspace> {
  const db = await requireDb();
  await ensurePricing(db);
  const profileRow = await findDriverByUserOrNull(db, user.id);
  const ridesForUser = await workspaceRides(db, user, profileRow);
  const rideIds = ridesForUser.map((ride) => ride.id);
  const driverRows = user.role === "admin" ? await db.select().from(drivers).orderBy(asc(drivers.id)) : [];
  const offerRows = user.role === "admin"
    ? await db.select().from(offers).orderBy(desc(offers.createdAt))
    : profileRow
      ? await db.select().from(offers).where(eq(offers.driverId, profileRow.id)).orderBy(desc(offers.createdAt))
      : [];
  const allOfferRideIds = [...new Set(offerRows.map((offer) => offer.rideId))];
  const offerRideRows = allOfferRideIds.length ? await db.select().from(rides).where(inArray(rides.id, allOfferRideIds)) : [];
  const rideMap = new Map([...ridesForUser, ...offerRideRows.map(mapRide)].map((ride) => [ride.id, ride]));
  const now = Date.now();
  const mappedOffers: Offer[] = offerRows.flatMap((row) => {
    const ride = rideMap.get(row.rideId);
    if (!ride) return [];
    const visibleRide = user.role === "driver" && row.status !== "accepted" && ride.driverId !== profileRow?.id ? { ...ride, phone: maskPhone(ride.phone) } : ride;
    const status = row.status === "sent" && new Date(row.expiresAt).getTime() <= now ? "expired" : row.status;
    return [{ id: row.id, rideId: row.rideId, driverId: row.driverId, status: status as Offer["status"], expiresAt: iso(row.expiresAt), ride: visibleRide }];
  });
  const visibleRideIds = user.role === "admin" ? undefined : [...new Set([...rideIds, ...allOfferRideIds])];
  const eventRows = visibleRideIds === undefined
    ? await db.select().from(rideEvents).orderBy(asc(rideEvents.createdAt))
    : visibleRideIds.length ? await db.select().from(rideEvents).where(inArray(rideEvents.rideId, visibleRideIds)).orderBy(asc(rideEvents.createdAt)) : [];
  const [pricingRow] = await db.select().from(pricingSettings).where(eq(pricingSettings.id, 1)).limit(1);
  if (!pricingRow) throw new Error("Pricing settings are unavailable");
  return {
    rides: ridesForUser,
    drivers: driverRows.map(mapDriver),
    offers: mappedOffers,
    events: eventRows.map(mapEvent),
    profile: profileRow ? mapDriver(profileRow) : null,
    pricing: mapPricing(pricingRow),
  };
}
