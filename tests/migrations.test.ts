import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "drizzle");
const journal = JSON.parse(
  readFileSync(resolve(root, "meta/_journal.json"), "utf8"),
) as { entries: { tag: string }[] };
const files = journal.entries.map((entry) =>
  readFileSync(resolve(root, `${entry.tag}.sql`), "utf8"),
);
const sql = files.join("\n");
function declarations(pattern: RegExp) {
  return [...sql.matchAll(pattern)].map((match) => match[1]);
}
describe("committed migration chain static regression", () => {
  it("creates each application table once", () => {
    const tables = declarations(/CREATE TABLE\s+`([^`]+)`/g);
    expect(new Set(tables).size).toBe(tables.length);
    expect(new Set(tables)).toEqual(
      new Set([
        "users",
        "drivers",
        "offers",
        "pricing_settings",
        "ride_events",
        "rides",
        "ride_locations",
        "ride_payments",
        "payment_events",
      ]),
    );
  });
  it("creates each domain index once", () => {
    const indexes = declarations(/CREATE INDEX\s+`([^`]+)`/g);
    expect(new Set(indexes).size).toBe(indexes.length);
    expect(new Set(indexes)).toEqual(
      new Set([
        "drivers_verification_available_idx",
        "offers_driver_status_idx",
        "offers_ride_status_idx",
        "ride_events_ride_created_idx",
        "rides_customer_status_idx",
        "rides_driver_status_idx",
        "rides_scheduled_status_idx",
        "ride_locations_driver_idx",
        "ride_locations_received_idx",
      ]),
    );
  });
  it("keeps the repair marker additive and avoids unsupported TEXT defaults", () => {
    expect(
      readFileSync(resolve(root, "0002_parched_millenium_guard.sql"), "utf8"),
    ).toContain("SELECT 1;");
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/text\s+NOT NULL\s+DEFAULT/i);
    expect(sql).toContain("DEFAULT 0");
  });
});
