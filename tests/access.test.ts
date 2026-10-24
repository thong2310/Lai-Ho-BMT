import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import { appRouter } from "../server/routers";
import * as domain from "../server/domain-db";
import { DEFAULT_PRICING } from "../shared/domain";

vi.mock("../server/domain-db", () => ({
  getWorkspace: vi.fn(),
  createBooking: vi.fn(),
  cancelBooking: vi.fn(),
  quoteBooking: vi.fn(),
  getPricing: vi.fn(),
  registerDriver: vi.fn(),
  setOwnAvailability: vi.fn(),
  acceptOffer: vi.fn(),
  rejectOffer: vi.fn(),
  advanceRide: vi.fn(),
  dispatchRide: vi.fn(),
  verifyDriver: vi.fn(),
  setDriverAvailability: vi.fn(),
  updatePricing: vi.fn(),
}));
function context(role: "user" | "driver" | "admin" | null): TrpcContext {
  const now = new Date("2026-01-01T00:00:00Z");
  return {
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    user: role
      ? {
          id: 42,
          openId: "unit-test-only",
          name: "Kiểm thử",
          email: null,
          loginMethod: "manus",
          role,
          createdAt: now,
          updatedAt: now,
          lastSignedIn: now,
        }
      : null,
  };
}
const input = () => ({
  pickup: "Điểm A",
  dropoff: "Điểm B",
  zone: "Quận 1",
  distanceKm: 8,
  scheduledAt: new Date(Date.now() + 3600000).toISOString(),
  vehicleType: "automatic" as const,
  phone: "0901234567",
  note: "",
});
beforeEach(() => vi.clearAllMocks());
describe("API access boundaries (mocked domain, no shared DB writes)", () => {
  it("requires login to read the workspace", async () => {
    await expect(
      appRouter.createCaller(context(null)).workspace.snapshot(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(domain.getWorkspace).not.toHaveBeenCalled();
  });
  it("requires login to create a booking", async () => {
    await expect(
      appRouter.createCaller(context(null)).booking.create(input()),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(domain.createBooking).not.toHaveBeenCalled();
  });
  it.each(["user", "driver"] as const)(
    "forbids %s from admin dispatch",
    async (role) => {
      await expect(
        appRouter
          .createCaller(context(role))
          .admin.dispatch({ rideId: 1, driverIds: [1] }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(domain.dispatchRide).not.toHaveBeenCalled();
    },
  );
  it.each(["user", "driver"] as const)(
    "forbids %s from verification",
    async (role) => {
      await expect(
        appRouter
          .createCaller(context(role))
          .admin.verify({ driverId: 1, verification: "verified", reason: "" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(domain.verifyDriver).not.toHaveBeenCalled();
    },
  );
  it("forbids a customer from updating prices", async () => {
    await expect(
      appRouter
        .createCaller(context("user"))
        .admin.updatePricing(DEFAULT_PRICING),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(domain.updatePricing).not.toHaveBeenCalled();
  });
  it("uses authenticated identity and strips supplied price/customerId", async () => {
    const body = {
      ...input(),
      price: 1,
      customerId: 999,
      driverIncome: 999999,
    };
    vi.mocked(domain.createBooking).mockResolvedValue({ id: 1 } as never);
    await appRouter.createCaller(context("user")).booking.create(body);
    expect(domain.createBooking).toHaveBeenCalledWith(
      { id: 42, name: "Kiểm thử", role: "user" },
      expect.not.objectContaining({ price: 1 }),
    );
    const payload = vi.mocked(domain.createBooking).mock.calls[0][1];
    expect(payload).not.toHaveProperty("customerId");
    expect(payload).not.toHaveProperty("price");
    expect(payload).not.toHaveProperty("driverIncome");
  });
  it("rejects an invalid distance before quote service", async () => {
    await expect(
      appRouter
        .createCaller(context(null))
        .booking.quote({
          distanceKm: -1,
          scheduledAt: input().scheduledAt,
          vehicleType: "automatic",
        }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(domain.quoteBooking).not.toHaveBeenCalled();
  });
  it("requires a reason to reject a driver", async () => {
    await expect(
      appRouter
        .createCaller(context("admin"))
        .admin.verify({ driverId: 1, verification: "rejected", reason: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(domain.verifyDriver).not.toHaveBeenCalled();
  });
  it("requires login for every financial read/write entry point", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.payments.history()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller.payments.overview({ rideId: 1 })).rejects.toMatchObject(
      { code: "UNAUTHORIZED" },
    );
    await expect(
      caller.payments.checkout({
        rideId: 1,
        returnOrigin: "https://example.invalid",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller.payments.reconcile({ rideId: 1 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("requires login for location reads and sharing sessions", async () => {
    const caller = appRouter.createCaller(context(null));
    const sessionId = "00000000-0000-4000-8000-000000000000";
    await expect(caller.location.snapshot({ rideId: 1 })).rejects.toMatchObject(
      { code: "UNAUTHORIZED" },
    );
    await expect(caller.location.begin({ rideId: 1 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      caller.location.stop({ rideId: 1, sessionId }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller.location.update({
        rideId: 1,
        sessionId,
        lat: 10,
        lng: 106,
        accuracy: null,
        capturedAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("public payment status never returns merchant signing credentials", async () => {
    const status = await appRouter
      .createCaller(context(null))
      .payments.status();
    expect(status.provider).toBe("vnpay");
    expect(status).not.toHaveProperty("hashSecret");
    expect(status).not.toHaveProperty("tmnCode");
    expect(status).not.toHaveProperty("checkoutUrl");
  });
});
