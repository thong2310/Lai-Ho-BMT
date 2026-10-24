import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { VNPAY_PAYMENT_URL, type PaymentRuntimeConfiguration } from "./config";

export type VnpayCheckoutInput = {
  paymentId: number;
  rideId: number;
  amount: number;
  attempt: number;
  returnOrigin: string;
  ipAddress: string;
};

export type VnpayQuery = Record<string, string | string[] | undefined>;

function encode(value: string): string {
  // VNPay's Node sample uses encodeURIComponent and converts spaces to '+'.
  return encodeURIComponent(value).replace(/%20/g, "+");
}

export function sortedVnpayQuery(values: Record<string, string>): string {
  return Object.keys(values)
    .sort()
    .map((key) => `${encode(key)}=${encode(values[key])}`)
    .join("&");
}

export function signVnpayQuery(
  values: Record<string, string>,
  hashSecret: string,
): string {
  return createHmac("sha512", hashSecret)
    .update(sortedVnpayQuery(values), "utf8")
    .digest("hex")
    .toUpperCase();
}

export function generateTransactionRef(
  paymentId: number,
  attempt: number,
): string {
  return `LX${paymentId}${attempt}${randomBytes(10).toString("hex").toUpperCase()}`;
}

function vietnamTimestamp(date = new Date()): string {
  const local = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return local
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
}

function normalizeIp(value: string | undefined): string {
  const ip = (value || "127.0.0.1").trim().replace(/^::ffff:/i, "");
  return ip.length <= 45 ? ip : "127.0.0.1";
}

export function buildVnpayCheckoutUrl(
  input: VnpayCheckoutInput,
  configuration: PaymentRuntimeConfiguration,
  now = new Date(),
): { url: string; sessionRef: string; expiresAt: Date } {
  if (
    !configuration.tmnCode ||
    !configuration.hashSecret ||
    !configuration.ipnUrl
  )
    throw new Error(
      configuration.reason ?? "Thanh toán VNPay hiện chưa khả dụng",
    );
  const allowedOrigins =
    configuration.allowedReturnOrigins ??
    (configuration.returnOrigin ? [configuration.returnOrigin] : []);
  const origin = allowedOrigins.includes(input.returnOrigin)
    ? input.returnOrigin
    : null;
  if (!origin) throw new Error("Nguồn quay lại thanh toán không được cho phép");
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
    throw new Error("Cước thanh toán không hợp lệ");
  const sessionRef = generateTransactionRef(input.paymentId, input.attempt);
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
  const values: Record<string, string> = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: configuration.tmnCode,
    vnp_Amount: String(input.amount * 100),
    vnp_CurrCode: "VND",
    vnp_TxnRef: sessionRef,
    vnp_OrderInfo: `LAIXEHO_RIDE_${input.rideId}`,
    vnp_OrderType: "other",
    vnp_Locale: "vn",
    vnp_ReturnUrl: `${origin}/payments/return?rideId=${encodeURIComponent(String(input.rideId))}`,
    vnp_IpAddr: normalizeIp(input.ipAddress),
    vnp_CreateDate: vietnamTimestamp(now),
    vnp_ExpireDate: vietnamTimestamp(expiresAt),
  };
  const secureHash = signVnpayQuery(values, configuration.hashSecret);
  return {
    url: `${VNPAY_PAYMENT_URL}?${sortedVnpayQuery({ ...values, vnp_SecureHashType: "SHA512", vnp_SecureHash: secureHash })}`,
    sessionRef,
    expiresAt,
  };
}

function oneQueryValue(query: VnpayQuery, key: string): string | null {
  const value = query[key];
  if (typeof value !== "string" || !value || value.length > 2048) return null;
  return value;
}

export function verifyVnpaySignature(
  query: VnpayQuery,
  hashSecret: string,
): { valid: boolean; values: Record<string, string> } {
  const values: Record<string, string> = {};
  for (const [key, raw] of Object.entries(query)) {
    if (!key.startsWith("vnp_")) continue;
    if (key === "vnp_SecureHash" || key === "vnp_SecureHashType") continue;
    if (typeof raw !== "string" || raw.length > 2048)
      return { valid: false, values: {} };
    values[key] = raw;
  }
  const supplied = oneQueryValue(query, "vnp_SecureHash");
  const suppliedHashType =
    query.vnp_SecureHashType === undefined
      ? null
      : oneQueryValue(query, "vnp_SecureHashType");
  if (
    !supplied ||
    (suppliedHashType !== null && !/^SHA512$/i.test(suppliedHashType))
  )
    return { valid: false, values: {} };

  const expected = signVnpayQuery(values, hashSecret);
  const expectedBytes = Buffer.from(expected, "ascii");
  const suppliedBytes = Buffer.from(supplied.toUpperCase(), "ascii");
  const valid =
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes);
  return { valid, values };
}

export function responseAmountVnd(amount: number): number {
  return amount * 100;
}

const DEFINITIVE_FAILURE_CODES = new Set([
  "02",
  "09",
  "10",
  "11",
  "12",
  "13",
  "24",
  "51",
  "65",
  "75",
  "79",
]);

export function vnpayOutcome(
  responseCode: string,
  transactionStatus: string,
): "paid" | "failed" | "pending" {
  if (responseCode === "00" && transactionStatus === "00") return "paid";
  if (
    transactionStatus === "01" ||
    transactionStatus === "04" ||
    transactionStatus === "05" ||
    transactionStatus === "06" ||
    responseCode === "07" ||
    responseCode === "99"
  )
    return "pending";
  return DEFINITIVE_FAILURE_CODES.has(responseCode) ||
    transactionStatus === "02"
    ? "failed"
    : "pending";
}
