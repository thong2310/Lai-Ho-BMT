import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENV } from "../server/_core/env";
import {
  createNativeOAuthState,
  createWebOAuthState,
  decodeOAuthState,
  isAllowedNativeRedirectUri,
  verifyNativeOAuthState,
  verifyWebOAuthState,
} from "../server/_core/oauth-state";

const originalEnv = { appId: ENV.appId, cookieSecret: ENV.cookieSecret };

beforeEach(() => {
  ENV.appId = "test-app";
  ENV.cookieSecret = "test-cookie-secret";
});

afterEach(() => {
  ENV.appId = originalEnv.appId;
  ENV.cookieSecret = originalEnv.cookieSecret;
});

describe("OAuth state binding", () => {
  it("encodes the web redirect URI and nonce and rejects a different cookie nonce", () => {
    const state = createWebOAuthState(
      "https://api.example.test/api/oauth/callback",
      "nonce-a",
    );
    expect(decodeOAuthState(state)).toEqual({
      redirectUri: "https://api.example.test/api/oauth/callback",
      nonce: "nonce-a",
    });
    expect(
      verifyWebOAuthState(
        state,
        "https://api.example.test/api/oauth/callback",
        "nonce-a",
      ),
    ).toBe(true);
    expect(
      verifyWebOAuthState(
        state,
        "https://api.example.test/api/oauth/callback",
        "nonce-b",
      ),
    ).toBe(false);
    expect(
      verifyWebOAuthState(
        state,
        "https://evil.example.test/callback",
        "nonce-a",
      ),
    ).toBe(false);
  });

  it("signs native state and rejects tampering or expiry", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const state = createNativeOAuthState(
      "manus068804319053301:///oauth/callback",
      "native-nonce",
      now,
    );
    expect(verifyNativeOAuthState(state, now)).not.toBeNull();

    const parsed = decodeOAuthState(state);
    expect(parsed).not.toBeNull();
    const tampered = createNativeOAuthState(
      "manus068804319053301:///oauth/callback",
      "different-nonce",
      now,
    );
    expect(verifyNativeOAuthState(tampered, now)).not.toBeNull();
    expect(verifyNativeOAuthState(state.replace(/.$/, "A"), now)).toBeNull();
    expect(
      verifyNativeOAuthState(state, now + 5 * 60 * 1000 + 1000),
    ).toBeNull();
  });

  it("allows only the project deep link shape or Expo callback URLs", () => {
    expect(
      isAllowedNativeRedirectUri("manus068804319053301:///oauth/callback"),
    ).toBe(true);
    expect(
      isAllowedNativeRedirectUri("exp://192.168.1.10:8081/--/oauth/callback"),
    ).toBe(true);
    expect(
      isAllowedNativeRedirectUri("exps://u.expo.dev/abc/--/oauth/callback"),
    ).toBe(true);
    expect(
      isAllowedNativeRedirectUri("https://evil.example.test/callback"),
    ).toBe(false);
    expect(isAllowedNativeRedirectUri("manus-attacker:///oauth/callback")).toBe(
      false,
    );
  });
});
