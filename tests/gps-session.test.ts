import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import { appRouter } from "../server/routers";
import { getDb } from "../server/db";

vi.mock("../server/db", () => ({ getDb: vi.fn() }));

const sessionId = "00000000-0000-4000-8000-000000000001";
const otherSessionId = "00000000-0000-4000-8000-000000000002";

function ride(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    code: "LXH-TEST",
    customerId: 9,
    driverId: 7,
    gpsSessionId: sessionId,
    pickup: "A",
    dropoff: "B",
    pickupLat: null,
    pickupLng: null,
    dropoffLat: null,
    dropoffLng: null,
    routePolyline: null,
    routeDurationSeconds: null,
    routeSource: "manual",
    zone: "Q1",
    distanceKm: 5,
    scheduledAt: new Date(),
    vehicleType: "automatic",
    phone: "0900000000",
    note: "",
    price: 100,
    driverIncome: 80,
    status: "accepted",
    customerName: "Customer",
    driverName: "Driver",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as any;
}

function driver(overrides: Record<string, unknown> = {}) {
  return { id: 7, userId: 42, verification: "verified", ...overrides } as any;
}

function mockedDb(rows: unknown[][]) {
  const updates: unknown[] = [];
  const queue = [...rows];
  const select = vi.fn(() => {
    const result: any = Promise.resolve(queue.shift() ?? []);
    result.for = () => result;
    return { from: () => ({ where: () => ({ limit: () => result }) }) };
  });
  const update = vi.fn(() => ({
    set: (values: unknown) => {
      updates.push(values);
      return { where: () => Promise.resolve() };
    },
  }));
  const tx = { select, update } as any;
  const db = {
    select,
    update,
    transaction: (callback: (executor: any) => unknown) => callback(tx),
  } as any;
  return { db, updates };
}

function context(): TrpcContext {
  const now = new Date("2026-10-25T00:00:00.000Z");
  return {
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: { id: 42, openId: "gps-test", name: "Driver", email: null, loginMethod: "test", role: "driver", createdAt: now, updatedAt: now, lastSignedIn: now },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("GPS server session hardening", () => {
  it("requires a verified assigned driver on an active ride to begin", async () => {
    const unverified = mockedDb([[ride({ gpsSessionId: null })], [driver({ verification: "pending" })]]);
    vi.mocked(getDb).mockResolvedValue(unverified.db);
    await expect(appRouter.createCaller(context()).location.begin({ rideId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const inactive = mockedDb([[ride({ gpsSessionId: null, status: "completed" })], [driver()]]);
    vi.mocked(getDb).mockResolvedValue(inactive.db);
    await expect(appRouter.createCaller(context()).location.begin({ rideId: 1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("creates a server session and disables any stale marker before sharing", async () => {
    const fake = mockedDb([[ride({ gpsSessionId: null })], [driver()]]);
    vi.mocked(getDb).mockResolvedValue(fake.db);
    const result = await appRouter.createCaller(context()).location.begin({ rideId: 1 });
    expect(result.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(fake.updates).toEqual([{ gpsSessionId: result.sessionId }, { sharing: false }]);
  });

  it("rejects an out-of-order update before reading or writing the location row", async () => {
    const fake = mockedDb([[ride({ gpsSessionId: sessionId })], [driver()]]);
    vi.mocked(getDb).mockResolvedValue(fake.db);
    await expect(appRouter.createCaller(context()).location.update({
      rideId: 1,
      sessionId: otherSessionId,
      lat: 10,
      lng: 106,
      accuracy: null,
      capturedAt: new Date().toISOString(),
    })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Phiên chia sẻ GPS đã dừng hoặc thay đổi" });
    expect(fake.db.select).toHaveBeenCalledTimes(2);
    expect(fake.updates).toHaveLength(0);
  });

  it("makes an old stop a no-op and only the current session invalidates sharing", async () => {
    const oldStop = mockedDb([[ride({ gpsSessionId: sessionId })], [driver()]]);
    vi.mocked(getDb).mockResolvedValue(oldStop.db);
    await appRouter.createCaller(context()).location.stop({ rideId: 1, sessionId: otherSessionId });
    expect(oldStop.updates).toHaveLength(0);

    const currentStop = mockedDb([[ride({ gpsSessionId: sessionId })], [driver()]]);
    vi.mocked(getDb).mockResolvedValue(currentStop.db);
    await appRouter.createCaller(context()).location.stop({ rideId: 1, sessionId });
    expect(currentStop.updates).toEqual([{ gpsSessionId: null }, { sharing: false }]);
  });
});
