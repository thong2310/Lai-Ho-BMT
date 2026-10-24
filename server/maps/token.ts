import { createHmac, timingSafeEqual } from "node:crypto";
import { ENV } from "../_core/env";

export type SignedRouteEndpoint = {
  label: string;
  lat: number;
  lng: number;
};

export type SignedRoutePayload = {
  type: "ride-route";
  pickup: SignedRouteEndpoint;
  dropoff: SignedRouteEndpoint;
  distanceKm: number;
  durationSeconds: number;
  polyline: string;
  iat: number;
  exp: number;
};

const MAX_TOKEN_LENGTH = 16_384;
const ROUTE_TOKEN_TTL_SECONDS = 15 * 60;

function secret(): string {
  const value = ENV.cookieSecret || process.env.MANUS_JWT_SECRET || process.env.JWT_SECRET || "";
  if (!value) throw new Error("Route token signing secret is not configured");
  return value;
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function signature(input: string): string {
  return createHmac("sha256", secret()).update(input).digest("base64url");
}

function isEndpoint(value: unknown): value is SignedRouteEndpoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const endpoint = value as Record<string, unknown>;
  return typeof endpoint.label === "string" && endpoint.label.length > 0 && endpoint.label.length <= 500
    && typeof endpoint.lat === "number" && Number.isFinite(endpoint.lat) && endpoint.lat >= -90 && endpoint.lat <= 90
    && typeof endpoint.lng === "number" && Number.isFinite(endpoint.lng) && endpoint.lng >= -180 && endpoint.lng <= 180;
}

function parsePayload(value: unknown): SignedRoutePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.type !== "ride-route" || !isEndpoint(candidate.pickup) || !isEndpoint(candidate.dropoff)) return null;
  if (typeof candidate.distanceKm !== "number" || !Number.isFinite(candidate.distanceKm) || candidate.distanceKm <= 0 || candidate.distanceKm > 300) return null;
  if (typeof candidate.durationSeconds !== "number" || !Number.isInteger(candidate.durationSeconds) || candidate.durationSeconds <= 0 || candidate.durationSeconds > 48 * 60 * 60) return null;
  if (typeof candidate.polyline !== "string" || candidate.polyline.length === 0 || candidate.polyline.length > 100_000) return null;
  if (typeof candidate.iat !== "number" || !Number.isInteger(candidate.iat) || typeof candidate.exp !== "number" || !Number.isInteger(candidate.exp)) return null;
  return {
    type: "ride-route",
    pickup: candidate.pickup,
    dropoff: candidate.dropoff,
    distanceKm: candidate.distanceKm,
    durationSeconds: candidate.durationSeconds,
    polyline: candidate.polyline,
    iat: candidate.iat,
    exp: candidate.exp,
  };
}

export function signRouteToken(input: Omit<SignedRoutePayload, "type" | "iat" | "exp">, nowSeconds = Math.floor(Date.now() / 1000)): { token: string; expiresAt: string } {
  if (!isEndpoint(input.pickup) || !isEndpoint(input.dropoff)) throw new Error("Invalid route endpoint");
  const payload: SignedRoutePayload = {
    type: "ride-route",
    pickup: input.pickup,
    dropoff: input.dropoff,
    distanceKm: input.distanceKm,
    durationSeconds: input.durationSeconds,
    polyline: input.polyline,
    iat: nowSeconds,
    exp: nowSeconds + ROUTE_TOKEN_TTL_SECONDS,
  };
  const encodedPayload = encode(JSON.stringify(payload));
  const signingInput = `route.${encodedPayload}`;
  const token = `${signingInput}.${signature(signingInput)}`;
  return { token, expiresAt: new Date(payload.exp * 1000).toISOString() };
}

export function verifyRouteToken(token: string, nowSeconds = Math.floor(Date.now() / 1000)): SignedRoutePayload {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) throw new Error("Invalid route token");
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "route" || !parts[1] || !parts[2]) throw new Error("Invalid route token");
  const expected = signature(`${parts[0]}.${parts[1]}`);
  const actualBuffer = Buffer.from(parts[2]);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) throw new Error("Invalid route token");
  const decoded = decode(parts[1]);
  if (!decoded) throw new Error("Invalid route token");
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error("Invalid route token");
  }
  const payload = parsePayload(parsed);
  if (!payload || payload.exp <= nowSeconds || payload.iat > nowSeconds + 30 || payload.exp - payload.iat > ROUTE_TOKEN_TTL_SECONDS) throw new Error("Invalid route token");
  return payload;
}

export { ROUTE_TOKEN_TTL_SECONDS };
