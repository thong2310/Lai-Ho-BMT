import { describe, expect, it } from "vitest";
import { DEFAULT_PRICING } from "../shared/domain";
import { calculateQuote } from "../server/services/quote";
import { canAdvanceRide, canCancelRide, canDispatchRide, isValidDistance, isValidPricing, isValidScheduledAt, isValidVietnamPhone, nextRideStatus } from "../server/services/rules";

describe("domain quote rules", () => {
  it("uses the minimum fare and calculates driver income from the server pricing snapshot", () => {
    const quote = calculateQuote(DEFAULT_PRICING, {
      distanceKm: 0.5,
      scheduledAt: "2026-10-25T03:00:00.000Z",
      vehicleType: "automatic",
    });
    expect(quote.distanceKm).toBe(0.5);
    expect(quote.nightFee).toBe(0);
    expect(quote.minAdjustment).toBe(DEFAULT_PRICING.minFare - DEFAULT_PRICING.baseFare - 0.5 * DEFAULT_PRICING.perKm);
    expect(quote.total).toBe(DEFAULT_PRICING.minFare);
    expect(quote.driverIncome).toBe(Math.round(quote.total * 0.8));
  });

  it("adds luxury and peak components without trusting a client total", () => {
    const quote = calculateQuote(DEFAULT_PRICING, {
      distanceKm: 10,
      scheduledAt: "2026-10-25T11:00:00.000Z",
      vehicleType: "luxury",
    });
    expect(quote.peakFee).toBe(DEFAULT_PRICING.peakFee);
    expect(quote.vehicleFee).toBe(30_000);
    expect(quote.total).toBe(
      DEFAULT_PRICING.baseFare + 10 * DEFAULT_PRICING.perKm + DEFAULT_PRICING.peakFee + 30_000,
    );
  });

  it("uses Vietnam local time and half-open 07-09 and 17-19 peak windows", () => {
    const at07 = calculateQuote(DEFAULT_PRICING, { distanceKm: 10, scheduledAt: "2026-10-25T00:00:00.000Z", vehicleType: "automatic" });
    const at09 = calculateQuote(DEFAULT_PRICING, { distanceKm: 10, scheduledAt: "2026-10-25T02:00:00.000Z", vehicleType: "automatic" });
    const at17 = calculateQuote(DEFAULT_PRICING, { distanceKm: 10, scheduledAt: "2026-10-25T10:00:00.000Z", vehicleType: "automatic" });
    const at19 = calculateQuote(DEFAULT_PRICING, { distanceKm: 10, scheduledAt: "2026-10-25T12:00:00.000Z", vehicleType: "automatic" });
    expect(at07.peakFee).toBe(DEFAULT_PRICING.peakFee);
    expect(at09.peakFee).toBe(0);
    expect(at17.peakFee).toBe(DEFAULT_PRICING.peakFee);
    expect(at19.peakFee).toBe(0);
  });
});

describe("domain transition and input rules", () => {
  it("allows only the sequential driver ride transitions", () => {
    expect(nextRideStatus("accepted")).toBe("arriving");
    expect(nextRideStatus("arriving")).toBe("met");
    expect(nextRideStatus("met")).toBe("in_progress");
    expect(nextRideStatus("in_progress")).toBe("completed");
    expect(nextRideStatus("completed")).toBeNull();
    expect(canAdvanceRide("pending")).toBe(false);
  });

  it("allows reassignment only before a trip starts", () => {
    expect(canDispatchRide("pending")).toBe(true);
    expect(canDispatchRide("offered")).toBe(true);
    expect(canDispatchRide("accepted")).toBe(true);
    expect(canDispatchRide("arriving")).toBe(true);
    expect(canDispatchRide("met")).toBe(true);
    expect(canDispatchRide("in_progress")).toBe(false);
    expect(canDispatchRide("completed")).toBe(false);
    expect(canDispatchRide("cancelled")).toBe(false);
  });

  it("does not allow cancellation after a trip starts or completes", () => {
    expect(canCancelRide("accepted")).toBe(true);
    expect(canCancelRide("in_progress")).toBe(false);
    expect(canCancelRide("completed")).toBe(false);
    expect(canCancelRide("cancelled")).toBe(false);
  });

  it("bounds distance, date, and Vietnam phone inputs", () => {
    const now = Date.parse("2026-10-25T00:00:00.000Z");
    expect(isValidDistance(0.5)).toBe(true);
    expect(isValidDistance(300)).toBe(true);
    expect(isValidDistance(0.49)).toBe(false);
    expect(isValidDistance(300.1)).toBe(false);
    expect(isValidScheduledAt("2026-10-25T00:01:00.000Z", now)).toBe(true);
    expect(isValidScheduledAt("2027-01-24T00:01:00.000Z", now)).toBe(false);
    expect(isValidVietnamPhone("0901234567")).toBe(true);
    expect(isValidVietnamPhone("+84901234567")).toBe(true);
    expect(isValidVietnamPhone("123")).toBe(false);
    expect(isValidPricing(DEFAULT_PRICING)).toBe(true);
    expect(isValidPricing({ ...DEFAULT_PRICING, perKm: 5_000_001 })).toBe(false);
    expect(isValidPricing({ ...DEFAULT_PRICING, minFare: 0 })).toBe(false);
    expect(isValidPricing({ ...DEFAULT_PRICING, peakFee: 100_000_001 })).toBe(false);
    expect(isValidPricing({ ...DEFAULT_PRICING, commissionPercent: 100 })).toBe(true);
    expect(isValidPricing({ ...DEFAULT_PRICING, commissionPercent: 100.1 })).toBe(false);
  });
});
