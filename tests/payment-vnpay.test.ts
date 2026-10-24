import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  getPaymentConfiguration,
  validateReturnOrigin,
} from "../server/payments/config";
import {
  buildVnpayCheckoutUrl,
  generateTransactionRef,
  signVnpayQuery,
  sortedVnpayQuery,
  verifyVnpaySignature,
  vnpayOutcome,
} from "../server/payments/vnpay-provider";

describe("VNPay sandbox payment signing", () => {
  const env = {
    VNPAY_TMN_CODE: "TESTMERCHANT",
    VNPAY_HASH_SECRET: "secret",
    EXPO_WEB_PREVIEW_URL: "https://preview.example.test",
    EXPO_PUBLIC_API_BASE_URL: "https://api.example.test",
  } as unknown as NodeJS.ProcessEnv;

  it("uses VNPay sorted encoding with plus spaces and HMAC-SHA512", () => {
    const values = { vnp_B: "a b", vnp_A: "ký tự" };
    expect(sortedVnpayQuery(values)).toBe("vnp_A=k%C3%BD+t%E1%BB%B1&vnp_B=a+b");
    const signature = signVnpayQuery(values, "secret");
    expect(signature).toMatch(/^[A-F0-9]{128}$/);
    expect(
      verifyVnpaySignature(
        { ...values, vnp_SecureHashType: "SHA512", vnp_SecureHash: signature },
        "secret",
      ).valid,
    ).toBe(true);
  });

  it("verifies an official-style query with no SecureHashType using an independent HMAC", () => {
    const values = {
      vnp_Amount: "1000000",
      vnp_OrderInfo: "Thanh toan don hang",
      vnp_TmnCode: "TESTMERCHANT",
      vnp_TxnRef: "LX11ABC",
    };
    const canonical =
      "vnp_Amount=1000000&vnp_OrderInfo=Thanh+toan+don+hang&vnp_TmnCode=TESTMERCHANT&vnp_TxnRef=LX11ABC";
    const hash = createHmac("sha512", "secret")
      .update(canonical, "utf8")
      .digest("hex")
      .toUpperCase();
    expect(
      verifyVnpaySignature({ ...values, vnp_SecureHash: hash }, "secret").valid,
    ).toBe(true);
    expect(
      verifyVnpaySignature(
        { ...values, vnp_SecureHashType: "sha512", vnp_SecureHash: hash },
        "secret",
      ).valid,
    ).toBe(true);
    expect(
      verifyVnpaySignature(
        { ...values, vnp_SecureHashType: "MD5", vnp_SecureHash: hash },
        "secret",
      ).valid,
    ).toBe(false);
    expect(
      verifyVnpaySignature(
        { ...values, vnp_SecureHash: [hash, hash] },
        "secret",
      ).valid,
    ).toBe(false);
  });

  it("uses VND minor-unit scaling and no client-secret behavior", () => {
    const config = getPaymentConfiguration(env);
    const built = buildVnpayCheckoutUrl(
      {
        paymentId: 7,
        rideId: 12,
        amount: 125000,
        attempt: 1,
        returnOrigin: "https://preview.example.test",
        ipAddress: "::ffff:192.0.2.4",
      },
      config,
      new Date("2026-10-25T00:00:00.000Z"),
    );
    expect(built.url).toContain("vnp_Amount=12500000");
    expect(built.url).toContain("vnp_Version=2.1.0");
    expect(built.url).toContain("vnp_CurrCode=VND");
    expect(built.url).not.toContain("client_secret");
    expect(built.url).toContain("vnp_IpAddr=192.0.2.4");
  });

  it("generates distinct per-attempt transaction references", () => {
    expect(generateTransactionRef(9, 1)).not.toBe(generateTransactionRef(9, 2));
  });

  it("does not turn ambiguous fraud, pending, reversal, or refund states into failed or paid", () => {
    expect(vnpayOutcome("00", "00")).toBe("paid");
    expect(vnpayOutcome("07", "02")).toBe("pending");
    expect(vnpayOutcome("24", "02")).toBe("failed");
    expect(vnpayOutcome("00", "04")).toBe("pending");
    expect(vnpayOutcome("99", "02")).toBe("pending");
  });

  it("rejects non-allowlisted origins and duplicate signed query values", () => {
    expect(() =>
      validateReturnOrigin("https://evil.example.test", env),
    ).toThrow();
    const config = getPaymentConfiguration(env);
    const built = buildVnpayCheckoutUrl(
      {
        paymentId: 1,
        rideId: 1,
        amount: 1000,
        attempt: 1,
        returnOrigin: "https://preview.example.test",
        ipAddress: "127.0.0.1",
      },
      config,
    );
    const query = Object.fromEntries(new URL(built.url).searchParams.entries());
    expect(
      verifyVnpaySignature(
        { ...query, vnp_Amount: [query.vnp_Amount, query.vnp_Amount] },
        "secret",
      ).valid,
    ).toBe(false);
  });
});

describe("VNPay configuration", () => {
  it("accepts a valid secondary public origin throughout checkout construction", () => {
    const env = {
      VNPAY_TMN_CODE: "TESTMERCHANT",
      VNPAY_HASH_SECRET: "secret",
      EXPO_WEB_PREVIEW_URL: "https://preview.example.test",
      PUBLIC_ORIGIN: "https://public.example.test",
      EXPO_PUBLIC_API_BASE_URL: "https://api.example.test",
    } as unknown as NodeJS.ProcessEnv;
    const origin = validateReturnOrigin("https://public.example.test", env);
    const config = getPaymentConfiguration(env);
    const input = {
      paymentId: 1,
      rideId: 2,
      amount: 120000,
      attempt: 1,
      returnOrigin: origin,
      ipAddress: "127.0.0.1",
    };
    const result = buildVnpayCheckoutUrl(input, config);
    expect(new URL(result.url).searchParams.get("vnp_ReturnUrl")).toBe(
      "https://public.example.test/payments/return?rideId=2",
    );
    expect(() =>
      buildVnpayCheckoutUrl(
        { ...input, returnOrigin: "https://evil.example.test" },
        config,
      ),
    ).toThrow("không được cho phép");
  });
  it("stays unavailable until both merchant credentials and public URLs exist", () => {
    const config = getPaymentConfiguration({
      VNPAY_TMN_CODE: "TESTMERCHANT",
    } as unknown as NodeJS.ProcessEnv);
    expect(config.provider).toBe("vnpay");
    expect(config.available).toBe(false);
    expect(config.mode).toBe("unconfigured");
    expect(config.reason).toContain("khóa bí mật");
  });
});
