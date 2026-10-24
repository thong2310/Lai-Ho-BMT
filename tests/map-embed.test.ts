import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mapDocument } from "../server/maps/view";

afterEach(() => vi.unstubAllEnvs());
describe("Maps browser origin contract (no provider calls)", () => {
  it("uses public frontend base URL and contains only browser key", () => {
    vi.stubEnv("MANUS_API_URL", "https://services.example.invalid");
    vi.stubEnv("MANUS_API_BROWSER_KEY", "browser-key-unit-test");
    vi.stubEnv("MANUS_API_KEY", "private-key-never-render");
    vi.stubEnv("EXPO_WEB_PREVIEW_URL", "https://app.example.invalid");
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "https://api.example.invalid");
    const document = mapDocument();
    expect(document.available).toBe(true);
    expect(document.baseUrl).toBe("https://app.example.invalid/");
    expect(document.html).toContain("browser-key-unit-test");
    expect(document.html).not.toContain("private-key-never-render");
    expect(document.html).toContain("LAIHO_MAP");
    expect(document.html).toContain('name="referrer" content="origin"');
  });
  it("does not claim interactive availability without the frontend origin", () => {
    vi.stubEnv("MANUS_API_URL", "https://services.example.invalid");
    vi.stubEnv("MANUS_API_BROWSER_KEY", "browser-key-unit-test");
    vi.stubEnv("EXPO_WEB_PREVIEW_URL", "");
    vi.stubEnv("PUBLIC_ORIGIN", "");
    const document = mapDocument();
    expect(document.baseUrl).toBeNull();
    expect(document.available).toBe(false);
  });
  it("allows the selected public fallback origin to deliver route and marker messages", () => {
    vi.stubEnv("MANUS_API_URL", "https://services.example.invalid");
    vi.stubEnv("MANUS_API_BROWSER_KEY", "browser-key-unit-test");
    vi.stubEnv("EXPO_WEB_PREVIEW_URL", "");
    vi.stubEnv("PUBLIC_ORIGIN", "https://public.example.invalid");
    const document = mapDocument();
    expect(document.available).toBe(true);
    expect(document.baseUrl).toBe("https://public.example.invalid/");
    expect(document.html).toContain('"https://public.example.invalid"');
  });
  it("platform hosts keep the authorized frontend origin instead of API-frame origin", () => {
    const web = readFileSync(
      resolve("components/laiho/RideMap.web.tsx"),
      "utf8",
    );
    const native = readFileSync(
      resolve("components/laiho/RideMap.native.tsx"),
      "utf8",
    );
    expect(web).toContain("srcDoc={config.data.html}");
    expect(web).toContain("window.location.origin");
    expect(native).toMatch(/html:\s*config\.data\.html/);
    expect(native).toMatch(/baseUrl:\s*config\.data\.baseUrl/);
    expect(native).not.toContain("source={{ uri:");
  });
});
