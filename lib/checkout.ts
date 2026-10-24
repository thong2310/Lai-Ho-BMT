import Constants from "expo-constants";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";

export function checkoutReturnOrigin(): string {
  if (Platform.OS === "web" && typeof window !== "undefined")
    return window.location.origin;
  const origin = (
    Constants.expoConfig?.extra as { webPreviewUrl?: string } | undefined
  )?.webPreviewUrl;
  if (!origin)
    throw new Error("Chưa có địa chỉ website trở về từ cổng thanh toán.");
  return new URL(origin).origin;
}
export async function openCheckout(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:")
    throw new Error("Cổng thanh toán phải dùng HTTPS.");
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const tab = window.open(url, "_blank", "noopener,noreferrer");
    // Browsers may return null when noopener is set; do not infer checkout failure.
    if (tab) tab.opener = null;
    return;
  }
  await WebBrowser.openBrowserAsync(url);
}
