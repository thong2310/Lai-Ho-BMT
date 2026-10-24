import { and, eq } from "drizzle-orm";
import { rides } from "../../drizzle/schema";
import { ridePayments } from "../../drizzle/payment-schema";
import type { PaymentConfiguration } from "../../shared/payments";
import { getPaymentConfiguration, validateReturnOrigin } from "./config";
import {
  canStartCheckout,
  canViewRide,
  findPaymentByRide,
  findRideAccess,
  listPaymentsForActor,
  requirePaymentDb,
  type PaymentExecutor,
} from "./db";
import { buildVnpayCheckoutUrl } from "./vnpay-provider";
import {
  mapPayment,
  PaymentError,
  type PaymentActor,
  type PaymentWithRide,
} from "./types";

export function publicPaymentConfiguration(): PaymentConfiguration {
  const config = getPaymentConfiguration();
  return {
    available: config.available,
    provider: config.provider,
    mode: config.mode,
    reason: config.reason,
  };
}

function insertedId(result: unknown): number {
  const id = Number((result as any)?.[0]?.insertId);
  if (!Number.isInteger(id) || id <= 0)
    throw new Error("Database did not return an inserted id");
  return id;
}

const EXPIRED_PENDING_MESSAGE =
  "Phiên hết hạn nhưng chưa nhận IPN; cần đối soát trước khi tạo mới";

async function createCheckoutAtomically(
  db: PaymentExecutor,
  actor: PaymentActor,
  rideId: number,
  origin: string,
  ipAddress: string | undefined,
  configuration: ReturnType<typeof getPaymentConfiguration>,
  now: Date,
): Promise<{ url: string; paymentId: number }> {
  return db.transaction(async (tx: PaymentExecutor) => {
    // Every checkout attempt locks the domain ride before the unique payment row.
    const lockedRides = await tx
      .select()
      .from(rides)
      .where(eq(rides.id, rideId))
      .limit(1)
      .for("update");
    const ride = lockedRides[0];
    if (!ride) throw new PaymentError("NOT_FOUND", "Không tìm thấy cuốc xe");
    if (!canStartCheckout(actor, { ride, driverUserId: null })) {
      throw new PaymentError(
        "FORBIDDEN",
        "Chỉ khách hàng của cuốc đã hoàn tất mới có thể thanh toán",
      );
    }
    if (ride.status === "cancelled")
      throw new PaymentError("BAD_REQUEST", "Cuốc xe đã bị hủy");
    if (!Number.isSafeInteger(ride.price) || ride.price <= 0)
      throw new PaymentError("BAD_REQUEST", "Cước thanh toán không hợp lệ");

    const lockedPayments = await tx
      .select()
      .from(ridePayments)
      .where(eq(ridePayments.rideId, ride.id))
      .limit(1)
      .for("update");
    let payment = lockedPayments[0];
    if (payment) {
      if (
        payment.customerId !== ride.customerId ||
        payment.amount !== ride.price ||
        payment.currency.toUpperCase() !== "VND"
      ) {
        throw new PaymentError(
          "CONFLICT",
          "Thông tin cước thanh toán không còn khớp",
        );
      }
      if (payment.status === "paid")
        throw new PaymentError("CONFLICT", "Cuốc xe này đã được thanh toán");

      const hasPersistedCheckout = Boolean(
        payment.checkoutUrl && payment.sessionRef && payment.expiresAt,
      );
      const checkoutStillValid = payment.expiresAt
        ? new Date(payment.expiresAt).getTime() > now.getTime()
        : false;
      if (hasPersistedCheckout && checkoutStillValid)
        return { url: payment.checkoutUrl as string, paymentId: payment.id };

      // Never replace an expired pending reference: a late success IPN may still settle it.
      if (payment.status === "pending" || payment.status === "expired") {
        throw new PaymentError("CONFLICT", EXPIRED_PENDING_MESSAGE);
      }

      const nextAttempt =
        payment.status === "failed" ? payment.attempt + 1 : payment.attempt;
      await tx
        .update(ridePayments)
        .set({
          status: "creating",
          attempt: nextAttempt,
          sessionRef: null,
          providerTransactionId: null,
          checkoutUrl: null,
          returnOrigin: null,
          expiresAt: null,
        })
        .where(eq(ridePayments.id, payment.id));
      payment = {
        ...payment,
        status: "creating",
        attempt: nextAttempt,
        sessionRef: null,
        providerTransactionId: null,
        checkoutUrl: null,
        returnOrigin: null,
        expiresAt: null,
      };
    } else {
      const result = await tx.insert(ridePayments).values({
        rideId: ride.id,
        customerId: ride.customerId,
        provider: "vnpay",
        amount: ride.price,
        currency: "VND",
        status: "creating",
        attempt: 1,
      });
      const created = await tx
        .select()
        .from(ridePayments)
        .where(eq(ridePayments.id, insertedId(result)))
        .limit(1);
      payment = created[0];
      if (!payment) throw new Error("Unable to create payment reservation");
    }

    // URL generation is local HMAC work; no provider request occurs inside this transaction.
    const built = buildVnpayCheckoutUrl(
      {
        paymentId: payment.id,
        rideId: ride.id,
        amount: ride.price,
        attempt: payment.attempt,
        returnOrigin: origin,
        ipAddress: ipAddress ?? "127.0.0.1",
      },
      configuration,
      now,
    );
    await tx
      .update(ridePayments)
      .set({
        status: "pending",
        sessionRef: built.sessionRef,
        checkoutUrl: built.url,
        returnOrigin: origin,
        expiresAt: built.expiresAt,
      })
      .where(
        and(
          eq(ridePayments.id, payment.id),
          eq(ridePayments.status, "creating"),
        ),
      );

    const persisted = await tx
      .select()
      .from(ridePayments)
      .where(eq(ridePayments.id, payment.id))
      .limit(1);
    const finalPayment = persisted[0];
    if (!finalPayment?.checkoutUrl || !finalPayment.sessionRef)
      throw new Error("Payment checkout was not persisted");
    return { url: finalPayment.checkoutUrl, paymentId: finalPayment.id };
  });
}

export async function checkoutPayment(
  actor: PaymentActor,
  rideId: number,
  returnOrigin: string,
  ipAddress: string | undefined,
): Promise<{ url: string; paymentId: number }> {
  const config = getPaymentConfiguration();
  if (!config.available)
    throw new PaymentError(
      "SERVICE_UNAVAILABLE",
      config.reason ?? "Thanh toán VNPay hiện chưa khả dụng",
    );
  const origin = validateReturnOrigin(returnOrigin);
  const db = await requirePaymentDb();
  return createCheckoutAtomically(
    db,
    actor,
    rideId,
    origin,
    ipAddress,
    config,
    new Date(),
  );
}

export async function getPaymentOverview(actor: PaymentActor, rideId: number) {
  const db = await requirePaymentDb();
  const access = await findRideAccess(db, rideId);
  if (!access || !canViewRide(actor, access))
    throw new PaymentError(
      "FORBIDDEN",
      "Bạn không có quyền xem thanh toán của cuốc xe này",
    );
  const payment = await findPaymentByRide(db, rideId);
  return {
    payment,
    canPay: canStartCheckout(actor, access) && payment?.status !== "paid",
  };
}

export async function getPaymentHistory(
  actor: PaymentActor,
): Promise<PaymentWithRide[]> {
  return listPaymentsForActor(await requirePaymentDb(), actor);
}

export async function reconcilePayment(
  actor: PaymentActor,
  rideId: number,
): Promise<PaymentWithRide | null> {
  const db = await requirePaymentDb();
  const access = await findRideAccess(db, rideId);
  if (!access || !canStartCheckout(actor, access))
    throw new PaymentError(
      "FORBIDDEN",
      "Chỉ khách hàng của cuốc xe mới có thể làm mới trạng thái",
    );
  return findPaymentByRide(db, rideId);
}

export function mapPaymentResult(
  payment: PaymentWithRide | null,
): ReturnType<typeof mapPayment> | null {
  return payment ? mapPayment(payment) : null;
}
