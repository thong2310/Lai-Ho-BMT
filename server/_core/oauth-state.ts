import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ENV } from "./env";

const WEB_STATE_KEYS = new Set(["redirectUri", "nonce"]);
const NATIVE_STATE_MAX_AGE_SECONDS = 5 * 60;

export type OAuthState = {
  redirectUri: string;
  nonce: string;
  exp?: number;
  appId?: string;
  signature?: string;
};

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function stateSecret(): string {
  const secret =
    ENV.cookieSecret ||
    process.env.MANUS_JWT_SECRET ||
    process.env.JWT_SECRET ||
    "";
  if (!secret) throw new Error("OAuth state signing secret is not configured");
  return secret;
}

function stateSigningInput(
  redirectUri: string,
  nonce: string,
  exp: number,
  appId: string,
): string {
  return `${appId}\n${redirectUri}\n${nonce}\n${exp}`;
}

function signatureFor(
  redirectUri: string,
  nonce: string,
  exp: number,
  appId: string,
): string {
  return createHmac("sha256", stateSecret())
    .update(stateSigningInput(redirectUri, nonce, exp, appId))
    .digest("base64url");
}

export function encodeOAuthState(state: OAuthState): string {
  return encodeBase64Url(JSON.stringify(state));
}

export function decodeOAuthState(value: string): OAuthState | null {
  if (!value || value.length > 4096) return null;
  const decoded = decodeBase64Url(value);
  if (!decoded) return null;

  try {
    const parsed: unknown = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate.redirectUri !== "string" || !candidate.redirectUri)
      return null;
    if (typeof candidate.nonce !== "string" || !candidate.nonce) return null;
    if (candidate.exp !== undefined && !Number.isInteger(candidate.exp))
      return null;
    if (candidate.appId !== undefined && typeof candidate.appId !== "string")
      return null;
    if (
      candidate.signature !== undefined ||
      candidate.appId !== undefined ||
      candidate.exp !== undefined
    ) {
      if (typeof candidate.signature !== "string" || !candidate.signature)
        return null;
    }
    return {
      redirectUri: candidate.redirectUri,
      nonce: candidate.nonce,
      ...(typeof candidate.exp === "number" ? { exp: candidate.exp } : {}),
      ...(typeof candidate.appId === "string"
        ? { appId: candidate.appId }
        : {}),
      ...(typeof candidate.signature === "string"
        ? { signature: candidate.signature }
        : {}),
    };
  } catch {
    return null;
  }
}

export function createWebOAuthState(
  redirectUri: string,
  nonce = randomBytes(32).toString("base64url"),
): string {
  return encodeOAuthState({ redirectUri, nonce });
}

export function createNativeOAuthState(
  redirectUri: string,
  nonce = randomBytes(32).toString("base64url"),
  nowMs = Date.now(),
): string {
  const exp = Math.floor(nowMs / 1000) + NATIVE_STATE_MAX_AGE_SECONDS;
  const appId = ENV.appId;
  if (!appId) throw new Error("OAuth app ID is not configured");
  return encodeOAuthState({
    redirectUri,
    nonce,
    exp,
    appId,
    signature: signatureFor(redirectUri, nonce, exp, appId),
  });
}

export function verifyWebOAuthState(
  value: string,
  expectedRedirectUri: string,
  expectedNonce: string | undefined,
): boolean {
  const parsed = decodeOAuthState(value);
  if (!parsed || !expectedNonce) return false;
  const decodedKeys = Object.keys(parsed);
  if (decodedKeys.some((key) => !WEB_STATE_KEYS.has(key))) return false;
  return (
    parsed.redirectUri === expectedRedirectUri && parsed.nonce === expectedNonce
  );
}

export function isAllowedNativeRedirectUri(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri);
    if (url.username || url.password || url.search || url.hash) return false;

    if (/^manus[a-z0-9]+:$/.test(url.protocol)) {
      return (
        (url.pathname === "/oauth/callback" && !url.hostname) ||
        (url.hostname === "oauth" && url.pathname === "/callback")
      );
    }

    if (url.protocol === "exp:" || url.protocol === "exps:") {
      return (
        Boolean(url.hostname) &&
        (url.pathname === "/oauth/callback" ||
          url.pathname === "/--/oauth/callback" ||
          url.pathname.endsWith("/--/oauth/callback"))
      );
    }

    return false;
  } catch {
    return false;
  }
}

export function verifyNativeOAuthState(
  value: string,
  nowMs = Date.now(),
): OAuthState | null {
  const parsed = decodeOAuthState(value);
  if (
    !parsed ||
    parsed.exp === undefined ||
    parsed.appId === undefined ||
    parsed.signature === undefined ||
    parsed.appId !== ENV.appId ||
    !isAllowedNativeRedirectUri(parsed.redirectUri)
  ) {
    return null;
  }

  const nowSeconds = Math.floor(nowMs / 1000);
  if (
    parsed.exp <= nowSeconds ||
    parsed.exp > nowSeconds + NATIVE_STATE_MAX_AGE_SECONDS + 1
  )
    return null;

  const expected = signatureFor(
    parsed.redirectUri,
    parsed.nonce,
    parsed.exp,
    parsed.appId,
  );
  const actualBuffer = Buffer.from(parsed.signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  return parsed;
}

export const OAUTH_STATE_MAX_AGE_MS = NATIVE_STATE_MAX_AGE_SECONDS * 1000;
