import { beforeEach, describe, expect, it, vi } from "vitest";
import { paymentEvents, ridePayments } from "../drizzle/payment-schema";
import { rides } from "../drizzle/schema";
import { getDb } from "../server/db";
import { checkoutPayment } from "../server/payments/service";
import { applyIpn } from "../server/payments/webhook";
import type { PaymentRuntimeConfiguration } from "../server/payments/config";

vi.mock("../server/db", () => ({ getDb: vi.fn() }));

type Payment = Record<string, any>;
type Ride = Record<string, any>;

function fluent(resolve: () => unknown): any {
  const chain: any = {};
  for (const method of ["from", "where", "limit", "for"])
    chain[method] = (...args: unknown[]) => {
      if (method === "from") chain.table = args[0];
      return chain;
    };
  chain.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (error: unknown) => unknown,
  ) => Promise.resolve().then(resolve).then(onFulfilled, onRejected);
  return chain;
}

function makeDb(
  options: {
    ride?: Ride | null;
    payment?: Payment | null;
    unknownSession?: boolean;
  } = {},
) {
  let ride = options.ride ?? {
    id: 7,
    customerId: 42,
    status: "completed",
    price: 125000,
  };
  let payment: Payment | null = options.payment ?? null;
  const events: Payment[] = [];
  let nextPaymentId = payment?.id ?? 1;
  let operation = 0;
  let tail = Promise.resolve();

  const db: any = {
    select: vi.fn(() => {
      const queryNumber = operation++;
      return fluent(() => {
        if ((db as any)._table === rides) return ride ? [ride] : [];
        if ((db as any)._table === paymentEvents) return events.slice();
        if ((db as any)._table === ridePayments) {
          if (options.unknownSession && queryNumber === 0) return [];
          return payment ? [payment] : [];
        }
        return [];
      });
    }),
    insert: vi.fn((table: unknown) => {
      const chain: any = {};
      chain.values = (value: Payment) => {
        if (table === ridePayments) {
          payment = {
            id: nextPaymentId++,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...value,
          };
        } else if (table === paymentEvents) {
          events.push(value);
        }
        return chain;
      };
      chain.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve([{ insertId: payment?.id ?? 1 }]).then(resolve);
      return chain;
    }),
    update: vi.fn((table: unknown) => {
      const chain: any = {};
      chain.set = (value: Payment) => {
        if (table === ridePayments && payment)
          payment = { ...payment, ...value, updatedAt: new Date() };
        return chain;
      };
      chain.where = () => chain;
      chain.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve([]).then(resolve);
      return chain;
    }),
    transaction: (fn: (tx: any) => Promise<unknown>) => {
      const run = tail.then(() => fn(db));
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    get _table() {
      return undefined;
    },
  };
  // Keep table identity on each select chain without depending on SQL parsing.
  db.select = vi.fn(() => {
    const chain = fluent(() => {
      if (chain.table === rides) return ride ? [ride] : [];
      if (chain.table === paymentEvents) return events.slice();
      if (chain.table === ridePayments)
        return options.unknownSession && operation === 1
          ? []
          : payment
            ? [payment]
            : [];
      return [];
    });
    operation += 1;
    return chain;
  });
  vi.mocked(getDb).mockResolvedValue(db);
  return { db, getRide: () => ride, getPayment: () => payment, events };
}

const configuration: PaymentRuntimeConfiguration = {
  available: true,
  provider: "vnpay",
  mode: "test",
  reason: null,
  tmnCode: "TESTMERCHANT",
  hashSecret: "test-only-secret",
  returnOrigin: "https://preview.example.test",
  ipnUrl: "https://api.example.test/api/payments/vnpay/ipn",
};
const actor = { id: 42, name: "Test customer", role: "user" as const };
const ipn = (overrides: Record<string, string> = {}) => ({
  vnp_TmnCode: "TESTMERCHANT",
  vnp_TxnRef: "LX11ABC",
  vnp_Amount: "12500000",
  vnp_ResponseCode: "00",
  vnp_TransactionStatus: "00",
  vnp_TransactionNo: "9001",
  ...overrides,
});

beforeEach(() => {
  vi.stubEnv("VNPAY_TMN_CODE", "TESTMERCHANT");
  vi.stubEnv("VNPAY_HASH_SECRET", "test-only-secret");
  vi.stubEnv("EXPO_WEB_PREVIEW_URL", "https://preview.example.test");
  vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "https://api.example.test");
});

describe("VNPay IPN flow (isolated executor, no real DB)", () => {
  it("accepts the official IPN shape when CurrCode is absent", async () => {
    const fake = makeDb({
      payment: {
        id: 11,
        rideId: 7,
        customerId: 42,
        amount: 125000,
        currency: "VND",
        status: "pending",
        sessionRef: "LX11ABC",
        providerTransactionId: null,
      },
    });
    await expect(applyIpn(fake.db, ipn(), configuration)).resolves.toBe("00");
    expect(fake.getPayment()?.status).toBe("paid");
  });

  it("rejects a tampered amount and unknown transaction without writing an event", async () => {
    const tampered = makeDb({
      payment: {
        id: 11,
        amount: 125000,
        currency: "VND",
        status: "pending",
        sessionRef: "LX11ABC",
        providerTransactionId: null,
      },
    });
    await expect(
      applyIpn(tampered.db, ipn({ vnp_Amount: "1" }), configuration),
    ).resolves.toBe("04");
    expect(tampered.events).toHaveLength(0);

    const unknown = makeDb({
      payment: {
        id: 11,
        amount: 125000,
        currency: "VND",
        status: "pending",
        sessionRef: "OTHER",
        providerTransactionId: null,
      },
      unknownSession: true,
    });
    await expect(applyIpn(unknown.db, ipn(), configuration)).resolves.toBe(
      "01",
    );
    expect(unknown.events).toHaveLength(0);
  });

  it("never regresses paid and deduplicates an accepted ambiguous event", async () => {
    const paid = makeDb({
      payment: {
        id: 11,
        amount: 125000,
        currency: "VND",
        status: "paid",
        sessionRef: "LX11ABC",
        providerTransactionId: "9001",
      },
    });
    await expect(
      applyIpn(
        paid.db,
        ipn({ vnp_ResponseCode: "24", vnp_TransactionStatus: "02" }),
        configuration,
      ),
    ).resolves.toBe("02");
    expect(paid.getPayment()?.status).toBe("paid");

    const duplicate = makeDb({
      payment: {
        id: 11,
        amount: 125000,
        currency: "VND",
        status: "pending",
        sessionRef: "LX11ABC",
        providerTransactionId: null,
      },
    });
    const ambiguous = ipn({
      vnp_ResponseCode: "00",
      vnp_TransactionStatus: "04",
    });
    await expect(
      applyIpn(duplicate.db, ambiguous, configuration),
    ).resolves.toBe("00");
    await expect(
      applyIpn(duplicate.db, ambiguous, configuration),
    ).resolves.toBe("00");
    expect(duplicate.events).toHaveLength(1);
  });

  it("accepts a signed late success for the same expired reference", async () => {
    const fake = makeDb({
      payment: {
        id: 11,
        amount: 125000,
        currency: "VND",
        status: "expired",
        sessionRef: "LX11ABC",
        providerTransactionId: null,
      },
    });
    await expect(applyIpn(fake.db, ipn(), configuration)).resolves.toBe("00");
    expect(fake.getPayment()?.status).toBe("paid");
  });
});

describe("atomic checkout flow (isolated executor, no real DB)", () => {
  it("rejects a non-owner and an in-progress ride inside the transaction", async () => {
    makeDb({
      ride: { id: 7, customerId: 9, status: "completed", price: 125000 },
    });
    await expect(
      checkoutPayment(actor, 7, "https://preview.example.test", "127.0.0.1"),
    ).rejects.toThrow("Chỉ khách hàng");

    makeDb({
      ride: { id: 7, customerId: 42, status: "in_progress", price: 125000 },
    });
    await expect(
      checkoutPayment(actor, 7, "https://preview.example.test", "127.0.0.1"),
    ).rejects.toThrow("Chỉ khách hàng");
  });

  it("uses the locked server fare and returns the same persisted URL for concurrent calls", async () => {
    const fake = makeDb({
      ride: { id: 7, customerId: 42, status: "completed", price: 125000 },
    });
    const [first, second] = await Promise.all([
      checkoutPayment(actor, 7, "https://preview.example.test", "127.0.0.1"),
      checkoutPayment(actor, 7, "https://preview.example.test", "127.0.0.1"),
    ]);
    expect(first.url).toBe(second.url);
    expect(first.paymentId).toBe(second.paymentId);
    expect(fake.getPayment()?.amount).toBe(125000);
    expect(new URL(first.url).searchParams.get("vnp_Amount")).toBe("12500000");
  });
});
