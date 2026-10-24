import { describe, expect, it, vi } from "vitest";

const routeInput = {
  pickup: { label: "Nhà hát Thành phố, Quận 1", lat: 10.7766, lng: 106.7033 },
  dropoff: { label: "Landmark 81, Bình Thạnh", lat: 10.7946, lng: 106.7218 },
  distanceKm: 4.664,
  durationSeconds: 785,
  polyline: "}_seA{`~dSg@w@",
};

describe("signed maps route tokens", () => {
  it("round-trips the bound endpoint and route payload", async () => {
    vi.stubEnv("MANUS_JWT_SECRET", "maps-test-secret");
    vi.stubEnv("JWT_SECRET", "");
    vi.resetModules();
    const { signRouteToken, verifyRouteToken } = await import("../server/maps/token");
    const signed = signRouteToken(routeInput, 1_800_000_000);
    expect(signed.expiresAt).toBe(new Date((1_800_000_000 + 900) * 1000).toISOString());
    expect(verifyRouteToken(signed.token, 1_800_000_001)).toMatchObject({
      type: "ride-route",
      pickup: routeInput.pickup,
      dropoff: routeInput.dropoff,
      distanceKm: routeInput.distanceKm,
      durationSeconds: routeInput.durationSeconds,
      polyline: routeInput.polyline,
    });
  });

  it("rejects tampering and expiry", async () => {
    vi.stubEnv("MANUS_JWT_SECRET", "maps-test-secret");
    vi.stubEnv("JWT_SECRET", "");
    vi.resetModules();
    const { signRouteToken, verifyRouteToken } = await import("../server/maps/token");
    const signed = signRouteToken(routeInput, 1_800_000_000);
    const [prefix, payload, signature] = signed.token.split(".");
    expect(() => verifyRouteToken(`${prefix}.${payload}.${signature.slice(0, -1)}x`, 1_800_000_001)).toThrow("Invalid route token");
    expect(() => verifyRouteToken(signed.token, 1_800_000_901)).toThrow("Invalid route token");
  });
});
