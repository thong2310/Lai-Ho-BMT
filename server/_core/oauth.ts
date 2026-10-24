import { ONE_YEAR_MS } from "../../shared/const.js";
import type { Express, Request, Response } from "express";
import { randomBytes } from "node:crypto";
import { getUserByOpenId, upsertUser } from "../db";
import {
  currentOAuthStateNonce,
  getOAuthStateCookieName,
  getOAuthStateCookieOptions,
  getSessionCookieName,
  getSessionCookieOptions,
  OAUTH_STATE_COOKIE_MAX_AGE_MS,
} from "./cookies";
import {
  createNativeOAuthState,
  createWebOAuthState,
  decodeOAuthState,
  isAllowedNativeRedirectUri,
  verifyNativeOAuthState,
  verifyWebOAuthState,
} from "./oauth-state";
import { sdk } from "./sdk";
import { ENV } from "./env";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function configuredAbsoluteUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.search ||
      url.hash
    )
      return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function requestProtocol(req: Request): "http" | "https" {
  if (req.protocol === "https") return "https";
  const forwarded = req.headers["x-forwarded-proto"];
  const first = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(",")[0];
  return first?.trim().toLowerCase() === "https" ? "https" : "http";
}

function getFixedApiOrigin(req: Request): string {
  const configured = configuredAbsoluteUrl(
    process.env.EXPO_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL,
  );
  if (configured) return configured;

  const packager = configuredAbsoluteUrl(process.env.EXPO_PACKAGER_PROXY_URL);
  if (packager) {
    const url = new URL(packager);
    const apiHostname = url.hostname.replace(/^8081-/, "3000-");
    if (apiHostname !== url.hostname) {
      url.hostname = apiHostname;
      return url.toString().replace(/\/$/, "");
    }
  }

  const host = req.get("host");
  if (!host) throw new Error("OAuth callback origin is unavailable");
  return `${requestProtocol(req)}://${host}`;
}

function getFixedFrontendUrl(): string {
  return (
    configuredAbsoluteUrl(process.env.EXPO_WEB_PREVIEW_URL) ??
    configuredAbsoluteUrl(process.env.EXPO_PACKAGER_PROXY_URL) ??
    "http://localhost:8081"
  );
}

function getOAuthPortalUrl(): string {
  const portal = configuredAbsoluteUrl(
    process.env.MANUS_OAUTH_PORTAL_URL ?? process.env.OAUTH_PORTAL_URL,
  );
  if (!portal || !ENV.appId)
    throw new Error("Manus OAuth configuration is unavailable");
  return portal;
}

function buildAuthorizationUrl(redirectUri: string, state: string): string {
  const url = new URL(`${getOAuthPortalUrl()}/app-auth`);
  url.searchParams.set("appId", ENV.appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("responseType", "code");
  return url.toString();
}

async function syncUser(userInfo: {
  openId?: string | null;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  platform?: string | null;
}) {
  if (!userInfo.openId) throw new Error("openId missing from user info");

  const lastSignedIn = new Date();
  await upsertUser({
    openId: userInfo.openId,
    name: userInfo.name || null,
    email: userInfo.email ?? null,
    loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
    lastSignedIn,
  });
  const saved = await getUserByOpenId(userInfo.openId);
  return (
    saved ?? {
      openId: userInfo.openId,
      name: userInfo.name,
      email: userInfo.email,
      loginMethod: userInfo.loginMethod ?? null,
      lastSignedIn,
    }
  );
}

function buildUserResponse(
  user:
    | Awaited<ReturnType<typeof getUserByOpenId>>
    | {
        openId: string;
        name?: string | null;
        email?: string | null;
        loginMethod?: string | null;
        lastSignedIn?: Date | null;
      },
) {
  return {
    id: (user as any)?.id ?? null,
    openId: user?.openId ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    loginMethod: user?.loginMethod ?? null,
    lastSignedIn: (user?.lastSignedIn ?? new Date()).toISOString(),
  };
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/start", (req: Request, res: Response) => {
    try {
      const redirectUri = `${getFixedApiOrigin(req)}/api/oauth/callback`;
      const nonce = randomBytes(32).toString("base64url");
      const state = createWebOAuthState(redirectUri, nonce);
      res.cookie(getOAuthStateCookieName(req), nonce, {
        ...getOAuthStateCookieOptions(req),
        maxAge: OAUTH_STATE_COOKIE_MAX_AGE_MS,
      });
      res.redirect(302, buildAuthorizationUrl(redirectUri, state));
    } catch {
      res.status(503).json({ error: "OAuth is unavailable" });
    }
  });

  app.get("/api/oauth/prepare", (req: Request, res: Response) => {
    const redirectUri = getQueryParam(req, "redirectUri");
    if (!redirectUri || !isAllowedNativeRedirectUri(redirectUri)) {
      res.status(400).json({ error: "invalid native redirect URI" });
      return;
    }

    try {
      res.json({ state: createNativeOAuthState(redirectUri), redirectUri });
    } catch {
      res.status(503).json({ error: "OAuth is unavailable" });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    let redirectUri: string;
    try {
      redirectUri = `${getFixedApiOrigin(req)}/api/oauth/callback`;
    } catch {
      res.status(503).json({ error: "OAuth callback is unavailable" });
      return;
    }
    const stateData = state ? decodeOAuthState(state) : null;
    const nonce = currentOAuthStateNonce(req);

    if (
      !code ||
      !state ||
      !stateData ||
      !verifyWebOAuthState(state, redirectUri, nonce)
    ) {
      res.status(400).json({ error: "invalid OAuth callback state" });
      return;
    }

    // Consume the browser binding before exchanging the authorization code. A replay therefore
    // fails closed even if the provider exchange takes time or later fails.
    res.clearCookie(
      getOAuthStateCookieName(req),
      getOAuthStateCookieOptions(req),
    );

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      await syncUser(userInfo);
      const sessionToken = await sdk.createSessionToken(userInfo.openId!, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      res.cookie(getSessionCookieName(req), sessionToken, {
        ...getSessionCookieOptions(req),
        maxAge: ONE_YEAR_MS,
      });
      res.redirect(302, getFixedFrontendUrl());
    } catch {
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });

  app.get("/api/oauth/mobile", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state || !verifyNativeOAuthState(state)) {
      res.status(400).json({ error: "invalid OAuth mobile state" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      const user = await syncUser(userInfo);
      const sessionToken = await sdk.createSessionToken(userInfo.openId!, {
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      res.cookie(getSessionCookieName(req), sessionToken, {
        ...getSessionCookieOptions(req),
        maxAge: ONE_YEAR_MS,
      });
      res.json({
        app_session_id: sessionToken,
        user: buildUserResponse(user),
      });
    } catch {
      res.status(500).json({ error: "OAuth mobile exchange failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(getSessionCookieName(req), {
      ...cookieOptions,
      maxAge: -1,
    });
    res.json({ success: true });
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      res.json({ user: buildUserResponse(user) });
    } catch {
      res.status(401).json({ error: "Not authenticated", user: null });
    }
  });

  app.post("/api/auth/session", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const authHeader = req.headers.authorization || req.headers.Authorization;
      if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
        res.status(400).json({ error: "Bearer token required" });
        return;
      }
      const token = authHeader.slice("Bearer ".length).trim();
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(getSessionCookieName(req), token, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });
      res.json({ success: true, user: buildUserResponse(user) });
    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  });
}
