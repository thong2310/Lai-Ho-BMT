import assert from "node:assert/strict";

const root = "http://127.0.0.1:3000";
async function ready() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const result = await fetch(root + "/api/health");
      if (result.ok) return;
    } catch {
      /* watch restarts briefly close the port */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("API chưa sẵn sàng sau 20 giây");
}
async function rpc(name, input) {
  const suffix = input
    ? "?input=" + encodeURIComponent(JSON.stringify({ json: input }))
    : "";
  const response = await fetch(root + "/api/trpc/" + name + suffix);
  const result = await response.json();
  assert.equal(response.status, 200, name + " HTTP error");
  return result.result.data.json;
}
await ready();
const config = await rpc("maps.config");
assert.equal(config.available, true);
const origin = new URL(config.baseUrl).origin;
const script = await fetch(config.scriptUrl, {
  headers: {
    Origin: origin,
    Referer: origin + "/",
    "User-Agent": "Mozilla/5.0",
  },
});
assert.equal(script.status, 200, "Maps JavaScript tải được");
console.log("Maps JavaScript: HTTP 200");
const html = config.html;
assert.ok(
  !html.includes(process.env.MANUS_API_KEY),
  "Không nhúng server key vào map HTML",
);
assert.ok(html.includes("LAIHO_MAP"));
console.log("Map embed: không có server credential, có bridge");
const pickup = await rpc("maps.geocode", {
  address: "Nhà hát Thành phố Hồ Chí Minh",
});
const dropoff = await rpc("maps.geocode", {
  address: "Landmark 81, Bình Thạnh",
});
const route = await rpc("maps.route", { pickup, dropoff });
assert.ok(route.polyline && route.routeToken && route.distanceKm > 0);
console.log(
  "Directions:",
  route.distanceKm,
  "km;",
  route.durationSeconds,
  "giây",
);
const args = {
  distanceKm: 100,
  scheduledAt: new Date(Date.now() + 3600000).toISOString(),
  vehicleType: "automatic",
  routeToken: route.routeToken,
};
const quote = await rpc("booking.quote", args);
assert.equal(
  quote.distanceKm,
  Math.round(route.distanceKm * 10) / 10,
  "Báo giá lấy km đã ký, không tin 100km từ client",
);
console.log("Báo giá server:", quote.total, "VND; km từ tuyến đã ký");
const altered = await fetch(
  root +
    "/api/trpc/booking.quote?input=" +
    encodeURIComponent(
      JSON.stringify({
        json: { ...args, routeToken: route.routeToken + "tampered" },
      }),
    ),
);
assert.notEqual(altered.status, 200, "Từ chối route token bị sửa");
console.log("Token sửa bị từ chối:", altered.status);
const merchant = await rpc("payments.status");
assert.equal(merchant.provider, "vnpay");
assert.ok(!("hashSecret" in merchant));
console.log("VNPay:", merchant.mode, "khả dụng:", merchant.available);
const privateRequest = await fetch(
  root +
    "/api/trpc/location.snapshot?input=" +
    encodeURIComponent(JSON.stringify({ json: { rideId: 1 } })),
);
assert.equal(privateRequest.status, 401);
console.log("GPS chưa đăng nhập: HTTP 401");
