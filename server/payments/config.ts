import type { PaymentConfiguration } from "../../shared/payments";

export const VNPAY_PAYMENT_URL =
  "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";

export type PaymentRuntimeConfiguration = PaymentConfiguration & {
  tmnCode: string | null;
  hashSecret: string | null;
  returnOrigin: string | null;
  ipnUrl: string | null;
  allowedReturnOrigins?: string[];
};

function configuredOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getConfiguredReturnOrigins(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const names = [
    "EXPO_WEB_PREVIEW_URL",
    "EXPO_PUBLIC_WEB_URL",
    "PUBLIC_ORIGIN",
    "MANUS_PUBLIC_ORIGIN",
    "MANUS_APP_URL",
  ];
  return new Set(
    names
      .map((name) => configuredOrigin(env[name]))
      .filter((value): value is string => Boolean(value)),
  );
}

export function validateReturnOrigin(
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const origin = configuredOrigin(value);
  if (!origin || !getConfiguredReturnOrigins(env).has(origin))
    throw new Error("Nguồn quay lại thanh toán không được cho phép");
  return origin;
}

function configuredApiOrigin(env: NodeJS.ProcessEnv): string | null {
  return configuredOrigin(
    env.EXPO_PUBLIC_API_BASE_URL ??
      env.API_BASE_URL ??
      env.MANUS_PUBLIC_API_ORIGIN,
  );
}

export function getPaymentConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): PaymentRuntimeConfiguration {
  const tmnCode = env.VNPAY_TMN_CODE?.trim() || null;
  const hashSecret = env.VNPAY_HASH_SECRET?.trim() || null;
  const allowedReturnOrigins = [...getConfiguredReturnOrigins(env)];
  const returnOrigin = allowedReturnOrigins[0] ?? null;
  const apiOrigin = configuredApiOrigin(env);
  const ipnUrl = apiOrigin ? `${apiOrigin}/api/payments/vnpay/ipn` : null;
  const available = Boolean(tmnCode && hashSecret && returnOrigin && ipnUrl);
  let reason: string | null = null;
  if (!tmnCode || !hashSecret)
    reason =
      "Thanh toán VNPay sandbox chưa được cấu hình mã merchant và khóa bí mật";
  else if (!returnOrigin)
    reason =
      "Thanh toán VNPay sandbox chưa có địa chỉ quay lại HTTPS được cho phép";
  else if (!ipnUrl)
    reason = "Thanh toán VNPay sandbox chưa có địa chỉ API IPN công khai";
  return {
    available,
    provider: "vnpay",
    mode: available ? "test" : "unconfigured",
    reason,
    tmnCode,
    hashSecret,
    returnOrigin,
    ipnUrl,
    allowedReturnOrigins,
  };
}
