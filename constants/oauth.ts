import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import * as ReactNative from "react-native";

// Extract scheme from bundle ID (last segment timestamp, prefixed with "manus")
const bundleId = "space.manus.laixeho.t068804319053301";
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const extra = (Constants.expoConfig?.extra ?? {}) as Record<
  string,
  string | undefined
>;

const env = {
  portal:
    extra.oauthPortalUrl ?? process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL ?? "",
  server:
    extra.oauthServerUrl ?? process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ?? "",
  appId: extra.appId ?? process.env.EXPO_PUBLIC_APP_ID ?? "",
  ownerId: process.env.EXPO_PUBLIC_OWNER_OPEN_ID ?? "",
  ownerName: process.env.EXPO_PUBLIC_OWNER_NAME ?? "",
  apiBaseUrl: extra.apiBaseUrl ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
  deepLinkScheme: schemeFromBundleId,
};

export const OAUTH_PORTAL_URL = env.portal;
export const OAUTH_SERVER_URL = env.server;
export const APP_ID = env.appId;
export const OWNER_OPEN_ID = env.ownerId;
export const OWNER_NAME = env.ownerName;
export const API_BASE_URL = env.apiBaseUrl;
export const PENDING_OAUTH_STATE_KEY = "manus_pending_oauth_state";

/**
 * Get the API base URL, deriving from current hostname if not set.
 * Metro runs on 8081, API server runs on 3000.
 */
export function getApiBaseUrl(): string {
  if (API_BASE_URL) return API_BASE_URL.replace(/\/$/, "");

  if (
    ReactNative.Platform.OS === "web" &&
    typeof window !== "undefined" &&
    window.location
  ) {
    const { protocol, hostname } = window.location;
    const apiHostname = hostname.replace(/^8081-/, "3000-");
    if (apiHostname !== hostname) return `${protocol}//${apiHostname}`;
  }

  return "";
}

export const SESSION_TOKEN_KEY = "app_session_token";
export const USER_INFO_KEY = "manus-runtime-user-info";

/**
 * Get the callback URI. Web uses the fixed API callback; native uses the configured app scheme.
 */
export const getRedirectUri = () => {
  if (ReactNative.Platform.OS === "web")
    return `${getApiBaseUrl()}/api/oauth/callback`;
  return Linking.createURL("/oauth/callback", { scheme: env.deepLinkScheme });
};

function apiEndpoint(path: string): string {
  const base = getApiBaseUrl();
  return base ? `${base}${path}` : path;
}

async function prepareNativeOAuthState(redirectUri: string): Promise<string> {
  const url = `${apiEndpoint("/api/oauth/prepare")}?${new URLSearchParams({ redirectUri })}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Unable to prepare OAuth login");
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { state?: unknown }).state !== "string" ||
    (body as { state: string }).state.length === 0
  ) {
    throw new Error("Invalid OAuth preparation response");
  }

  const state = (body as { state: string }).state;
  await SecureStore.setItemAsync(PENDING_OAUTH_STATE_KEY, state);
  return state;
}

/**
 * Build the Manus authorization URL. Web preparation happens on the server so the nonce cookie
 * is set on the API origin; native preparation stores the exact signed state for callback binding.
 */
export async function getLoginUrl(): Promise<string> {
  if (ReactNative.Platform.OS === "web") {
    return apiEndpoint("/api/oauth/start");
  }

  if (!OAUTH_PORTAL_URL || !APP_ID)
    throw new Error("Manus login configuration is unavailable");
  const redirectUri = getRedirectUri();
  const state = await prepareNativeOAuthState(redirectUri);
  const url = new URL(`${OAUTH_PORTAL_URL.replace(/\/$/, "")}/app-auth`);
  url.searchParams.set("appId", APP_ID);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("responseType", "code");
  return url.toString();
}

/**
 * Start OAuth login. Native callbacks return through the deep link; web navigation starts at the
 * server route so its httpOnly nonce cookie is created before leaving the browser.
 */
export async function startOAuthLogin(): Promise<string | null> {
  const loginUrl = await getLoginUrl();

  if (ReactNative.Platform.OS === "web") {
    if (typeof window !== "undefined") window.location.assign(loginUrl);
    return null;
  }

  if (!(await Linking.canOpenURL(loginUrl))) return null;
  await Linking.openURL(loginUrl);
  return null;
}
