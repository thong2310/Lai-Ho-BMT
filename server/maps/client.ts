import type { GeoPlace } from "../../shared/mobility";

const REQUEST_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 60_000;
const THROTTLE_WINDOW_MS = 60_000;
const THROTTLE_LIMIT = 30;

type GoogleResponse = Record<string, any>;
type CacheEntry = { expiresAt: number; value: unknown };

const cache = new Map<string, CacheEntry>();
const requestsByKey = new Map<string, number[]>();

function serviceBase(): string {
  const value = process.env.MANUS_API_URL?.trim();
  if (!value) throw new Error("Maps service is not configured");
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new Error("Maps service is not configured");
  }
}

function serverKey(): string {
  const value = process.env.MANUS_API_KEY?.trim();
  if (!value) throw new Error("Maps server credential is not configured");
  return value;
}

function browserScriptUrl(): string | null {
  const base = process.env.MANUS_API_URL?.trim();
  const key = process.env.MANUS_API_BROWSER_KEY?.trim();
  if (!base || !key) return null;
  try {
    const url = new URL(`${new URL(base).toString().replace(/\/$/, "")}/v1/maps/proxy/maps/api/js`);
    url.searchParams.set("key", key);
    url.searchParams.set("libraries", "geometry");
    return url.toString();
  } catch {
    return null;
  }
}

export function mapsConfig(): { available: boolean; scriptUrl: string | null } {
  const scriptUrl = browserScriptUrl();
  return { available: Boolean(scriptUrl), scriptUrl };
}

function requestKey(path: string, params: URLSearchParams): string {
  return `${path}?${[...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("&")}`;
}

function allowRequest(key: string): void {
  const now = Date.now();
  const recent = (requestsByKey.get(key) ?? []).filter((value) => value > now - THROTTLE_WINDOW_MS);
  if (recent.length >= THROTTLE_LIMIT) throw new Error("Maps request rate limit exceeded");
  recent.push(now);
  requestsByKey.set(key, recent);
}

async function fetchGoogle(path: string, params: Record<string, string>): Promise<GoogleResponse> {
  const query = new URLSearchParams(params);
  query.set("key", serverKey());
  const key = requestKey(path, query);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as GoogleResponse;
  allowRequest(key);
  const url = `${serviceBase()}/v1/maps/proxy/${path}?${query.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  let body: GoogleResponse;
  try {
    response = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    body = await response.json() as GoogleResponse;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Maps request timed out");
    throw new Error("Maps service request failed");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const detail = typeof body?.error_message === "string" ? body.error_message : `HTTP ${response.status}`;
    throw new Error(`Maps service error: ${detail}`);
  }
  if (body?.error && typeof body.error === "object") throw new Error("Maps service returned an error");
  if (typeof body?.status === "string" && !["OK", "ZERO_RESULTS"].includes(body.status)) {
    throw new Error(typeof body.error_message === "string" ? `Maps service error: ${body.error_message}` : `Maps service status: ${body.status}`);
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: body });
  return body;
}

function coordinate(value: unknown): { lat: number; lng: number } | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.lat !== "number" || !Number.isFinite(row.lat) || row.lat < -90 || row.lat > 90) return null;
  if (typeof row.lng !== "number" || !Number.isFinite(row.lng) || row.lng < -180 || row.lng > 180) return null;
  return { lat: row.lat, lng: row.lng };
}

function placeFromResult(result: unknown): GeoPlace | null {
  if (!result || typeof result !== "object") return null;
  const row = result as Record<string, any>;
  const location = coordinate(row.geometry?.location);
  const label = typeof row.formatted_address === "string" ? row.formatted_address : typeof row.name === "string" ? row.name : "";
  if (!location || !label.trim()) return null;
  return {
    ...location,
    label: label.trim().slice(0, 500),
    ...(typeof row.place_id === "string" && row.place_id ? { placeId: row.place_id } : {}),
  };
}

export async function geocode(address: string): Promise<GeoPlace> {
  const body = await fetchGoogle("maps/api/geocode/json", { address });
  const result = Array.isArray(body.results) ? placeFromResult(body.results[0]) : null;
  if (!result) throw new Error("No geocoding result");
  return result;
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeoPlace> {
  const body = await fetchGoogle("maps/api/geocode/json", { latlng: `${lat},${lng}` });
  const result = Array.isArray(body.results) ? placeFromResult(body.results[0]) : null;
  if (!result) throw new Error("No geocoding result");
  return result;
}

export async function textSearch(query: string): Promise<GeoPlace[]> {
  const body = await fetchGoogle("maps/api/place/textsearch/json", { query });
  if (!Array.isArray(body.results)) return [];
  return body.results.map(placeFromResult).filter((value): value is GeoPlace => value !== null).slice(0, 20);
}

function routeDistanceAndDuration(legs: unknown[]): { distanceMeters: number; durationSeconds: number } | null {
  let distanceMeters = 0;
  let durationSeconds = 0;
  for (const leg of legs) {
    if (!leg || typeof leg !== "object") return null;
    const row = leg as Record<string, any>;
    const distance = row.distance?.value;
    const duration = row.duration?.value;
    if (!Number.isFinite(distance) || !Number.isFinite(duration) || distance < 0 || duration < 0) return null;
    distanceMeters += distance;
    durationSeconds += duration;
  }
  return legs.length > 0 && distanceMeters > 0 && durationSeconds > 0 ? { distanceMeters, durationSeconds } : null;
}

export async function directions(pickup: { lat: number; lng: number }, dropoff: { lat: number; lng: number }): Promise<{ distanceKm: number; durationSeconds: number; polyline: string }> {
  const body = await fetchGoogle("maps/api/directions/json", {
    origin: `${pickup.lat},${pickup.lng}`,
    destination: `${dropoff.lat},${dropoff.lng}`,
    mode: "driving",
    alternatives: "false",
  });
  const route = Array.isArray(body.routes) ? body.routes[0] : null;
  const polyline = typeof route?.overview_polyline?.points === "string" ? route.overview_polyline.points : "";
  const totals = routeDistanceAndDuration(Array.isArray(route?.legs) ? route.legs : []);
  if (!totals || !polyline) throw new Error("Maps route response is incomplete");
  return {
    distanceKm: totals.distanceMeters / 1000,
    durationSeconds: totals.durationSeconds,
    polyline,
  };
}
