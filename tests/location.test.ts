import { describe, expect, it } from "vitest";
import { isValidAccuracy, isValidCapturedAt, isValidCoordinate } from "../server/location-router";

describe("GPS input validation", () => {
  const now = Date.parse("2026-10-25T00:00:00.000Z");

  it("accepts only bounded coordinates", () => {
    expect(isValidCoordinate(10.7766, 106.7033)).toBe(true);
    expect(isValidCoordinate(-90, 180)).toBe(true);
    expect(isValidCoordinate(90.01, 0)).toBe(false);
    expect(isValidCoordinate(0, -180.01)).toBe(false);
    expect(isValidCoordinate(Number.NaN, 0)).toBe(false);
  });

  it("bounds nullable GPS accuracy in meters", () => {
    expect(isValidAccuracy(null)).toBe(true);
    expect(isValidAccuracy(0)).toBe(true);
    expect(isValidAccuracy(5000)).toBe(true);
    expect(isValidAccuracy(-1)).toBe(false);
    expect(isValidAccuracy(5000.1)).toBe(false);
  });

  it("accepts capturedAt only from two minutes ago through thirty seconds ahead", () => {
    expect(isValidCapturedAt("2026-10-24T23:58:00.000Z", now)).toBe(true);
    expect(isValidCapturedAt("2026-10-24T23:57:59.999Z", now)).toBe(false);
    expect(isValidCapturedAt("2026-10-25T00:00:30.000Z", now)).toBe(true);
    expect(isValidCapturedAt("2026-10-25T00:00:30.001Z", now)).toBe(false);
    expect(isValidCapturedAt("not-a-date", now)).toBe(false);
  });
});
