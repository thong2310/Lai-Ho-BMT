import type { Express, Request, Response } from "express";
import { mapsConfig } from "./client";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const VIEW_SCRIPT = String.raw`
<script>
(() => {
  const ALLOWED_ORIGINS = __ALLOWED_ORIGINS__;
  const status = document.getElementById('status');
  const canvas = document.getElementById('map');
  const script = document.getElementById('maps-script');
  let map = null;
  let markers = [];
  let polyline = null;
  let pendingState = null;

  function setStatus(message, error) {
    status.textContent = message;
    status.dataset.error = error ? 'true' : 'false';
    status.hidden = !message;
  }

  function validCoordinate(value) {
    return value && typeof value.lat === 'number' && Number.isFinite(value.lat) && value.lat >= -90 && value.lat <= 90
      && typeof value.lng === 'number' && Number.isFinite(value.lng) && value.lng >= -180 && value.lng <= 180;
  }

  function sanitizeState(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const state = {};
    ['pickup', 'dropoff', 'driver'].forEach((key) => {
      if (raw[key] == null) return;
      if (validCoordinate(raw[key])) state[key] = { lat: raw[key].lat, lng: raw[key].lng };
    });
    if (typeof raw.polyline === 'string' && raw.polyline.length <= 100000) state.polyline = raw.polyline;
    return state;
  }

  function decodePolyline(encoded) {
    const points = [];
    let index = 0;
    let lat = 0;
    let lng = 0;
    while (index < encoded.length) {
      let shift = 0;
      let result = 0;
      let byte;
      do {
        if (index >= encoded.length) return [];
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 31) << shift;
        shift += 5;
      } while (byte >= 32);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      shift = 0;
      result = 0;
      do {
        if (index >= encoded.length) return [];
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 31) << shift;
        shift += 5;
      } while (byte >= 32);
      lng += (result & 1) ? ~(result >> 1) : (result >> 1);
      const point = { lat: lat / 100000, lng: lng / 100000 };
      if (!validCoordinate(point)) return [];
      points.push(point);
    }
    return points;
  }

  function clearMap() {
    markers.forEach((marker) => marker.setMap(null));
    markers = [];
    if (polyline) polyline.setMap(null);
    polyline = null;
  }

  function render(raw) {
    const state = sanitizeState(raw && raw.type === 'LAIHO_MAP' ? raw.state : raw);
    if (!map || !window.google || !window.google.maps) {
      pendingState = state;
      return;
    }
    clearMap();
    const bounds = new google.maps.LatLngBounds();
    const markerDefinitions = [
      ['pickup', 'Điểm đón', '#15803d', 'A'],
      ['dropoff', 'Điểm trả', '#d97706', 'B'],
      ['driver', 'Tài xế', '#1d4ed8', 'D'],
    ];
    markerDefinitions.forEach(([key, title, color, glyph]) => {
      const point = state[key];
      if (!point) return;
      const marker = new google.maps.Marker({
        position: point,
        map,
        title,
        label: { text: glyph, color: '#fff', fontWeight: '700' },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 13, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
      });
      markers.push(marker);
      bounds.extend(point);
    });
    if (state.polyline) {
      const points = decodePolyline(state.polyline);
      if (points.length) {
        polyline = new google.maps.Polyline({ path: points, map, strokeColor: '#2563eb', strokeOpacity: 0.85, strokeWeight: 5 });
        points.forEach((point) => bounds.extend(point));
      }
    }
    const hasPoints = markerDefinitions.some(([key]) => state[key]) || Boolean(polyline);
    if (hasPoints) map.fitBounds(bounds, 48);
    else map.setCenter({ lat: 10.7766, lng: 106.7033 });
  }

  function initialize() {
    if (!window.google || !window.google.maps) {
      setStatus('Không thể tải bản đồ', true);
      return;
    }
    map = new google.maps.Map(canvas, { center: { lat: 10.7766, lng: 106.7033 }, zoom: 13, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
    setStatus('');
    if (pendingState) render(pendingState);
  }

  window.updateMap = (state) => render(state);
  window.gm_authFailure = () => setStatus('Khóa bản đồ không được chấp nhận', true);
  if (script) {
    script.addEventListener('load', initialize);
    script.addEventListener('error', () => setStatus('Không thể tải dịch vụ bản đồ', true));
    window.setTimeout(() => {
      if (!map && !window.google) setStatus('Dịch vụ bản đồ phản hồi quá lâu', true);
    }, 12000);
  }
  setStatus('Đang tải bản đồ…');
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || !ALLOWED_ORIGINS.includes(event.origin)) return;
    render(event.data);
  });
})();
</script>`;

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function configuredOrigins(): string[] {
  const origins = new Set<string>();
  for (const value of [
    process.env.EXPO_WEB_PREVIEW_URL,
    process.env.EXPO_PACKAGER_PROXY_URL,
    process.env.PUBLIC_ORIGIN,
    process.env.EXPO_PUBLIC_WEB_URL,
    process.env.MANUS_PUBLIC_ORIGIN,
    process.env.MANUS_APP_URL,
  ]) {
    if (!value) continue;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // Ignore malformed optional origin configuration.
    }
  }
  return [...origins];
}

export function mapDocument(): {
  html: string;
  baseUrl: string | null;
  available: boolean;
} {
  let baseUrl: string | null = null;
  try {
    const value = process.env.EXPO_WEB_PREVIEW_URL || process.env.PUBLIC_ORIGIN;
    const parsed = new URL(value ?? "");
    if (parsed.protocol === "https:") baseUrl = parsed.origin + "/";
  } catch {
    /* Missing frontend origin is an explicit unavailable state. */
  }
  const config = mapsConfig();
  const scriptTag = config.scriptUrl
    ? `<script id="maps-script" src="${escapeHtml(config.scriptUrl)}" defer></script>`
    : `<script id="maps-script" type="application/json">null</script>`;
  const initialStatus = config.available ? "" : "Bản đồ chưa được cấu hình";
  const viewScript = VIEW_SCRIPT.replace(
    "__ALLOWED_ORIGINS__",
    safeJson(configuredOrigins()),
  );
  const html = `<!doctype html>
<html lang="vi">
<head><meta charset="utf-8"><meta name="referrer" content="origin"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bản đồ</title>
<style>html,body,#map{width:100%;height:100%;margin:0}body{font-family:system-ui,sans-serif;background:#f8fafc;overflow:hidden}#map{min-height:180px}.status{position:absolute;z-index:2;left:12px;right:12px;top:12px;padding:10px 12px;border-radius:8px;background:#fff;color:#334155;box-shadow:0 1px 4px #0002;font-size:14px}.status[data-error="true"]{color:#991b1b} .status[hidden]{display:none}</style>
</head><body><div id="map"></div><div id="status" class="status" data-error="${config.available ? "false" : "true"}"${initialStatus ? "" : " hidden"}>${escapeHtml(initialStatus)}</div>${scriptTag}${viewScript}</body></html>`;
  return { html, baseUrl, available: config.available && !!baseUrl };
}

export function registerMapRoutes(app: Express): void {
  app.get("/api/maps/view", (_req: Request, res: Response) => {
    res.status(200).type("html").send(mapDocument().html);
  });
}
