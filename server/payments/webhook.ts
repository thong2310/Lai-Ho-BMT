import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { paymentEvents, ridePayments } from "../../drizzle/payment-schema";
import {
  getPaymentConfiguration,
  type PaymentRuntimeConfiguration,
} from "./config";
import { requirePaymentDb, type PaymentExecutor } from "./db";
import {
  verifyVnpaySignature,
  vnpayOutcome,
  type VnpayQuery,
} from "./vnpay-provider";

function response(res: Response, code: string): void {
  res.json({
    RspCode: code,
    Message: code === "00" ? "Confirm Success" : "Confirm Failed",
  });
}

function eventId(values: Record<string, string>): string {
  return `vnpay:${values.vnp_TxnRef}:${values.vnp_TransactionNo ?? "none"}:${values.vnp_ResponseCode}:${values.vnp_TransactionStatus ?? "none"}`;
}

async function applyIpn(
  db: PaymentExecutor,
  values: Record<string, string>,
  configuration: PaymentRuntimeConfiguration,
): Promise<string> {
  if (values.vnp_TmnCode !== configuration.tmnCode) return "01";
  if (
    !values.vnp_TxnRef ||
    !values.vnp_Amount ||
    !values.vnp_ResponseCode ||
    !values.vnp_TransactionStatus
  )
    return "01";
  // vnp_CurrCode is absent from the official IPN sample; validate it only when sent.
  if (values.vnp_CurrCode !== undefined && values.vnp_CurrCode !== "VND")
    return "04";

  return db.transaction(async (tx: PaymentExecutor) => {
    // Lock by the provider reference before reading status or inserting the event.
    const lockedRows = await tx
      .select()
      .from(ridePayments)
      .where(eq(ridePayments.sessionRef, values.vnp_TxnRef))
      .limit(1)
      .for("update");
    const current = lockedRows[0];
    if (!current) return "01";
    if (
      current.sessionRef !== values.vnp_TxnRef ||
      current.amount * 100 !== Number(values.vnp_Amount) ||
      current.currency.toUpperCase() !== "VND"
    )
      return "04";

    // A paid row is terminal. A valid late callback for the same reference is not a new charge.
    if (current.status === "paid") return "02";

    const id = eventId(values);
    const existing = await tx
      .select({ eventId: paymentEvents.eventId })
      .from(paymentEvents)
      .where(eq(paymentEvents.eventId, id))
      .limit(1);
    if (existing.length) return "00";

    const outcome = vnpayOutcome(
      values.vnp_ResponseCode,
      values.vnp_TransactionStatus,
    );
    const transactionId = values.vnp_TransactionNo ?? null;
    let nextStatus: "pending" | "failed" | "paid" | null = null;
    let paidAt: Date | null | undefined;

    if (outcome === "paid") {
      // A signed success for the active reference may settle pending, creating, failed, or expired.
      nextStatus = "paid";
      paidAt = new Date();
    } else if (outcome === "failed") {
      // Definitive failure can close an in-flight attempt, but never regresses paid or a prior failure.
      if (current.status === "pending" || current.status === "creating")
        nextStatus = "failed";
    } else if (current.status === "pending" || current.status === "creating") {
      // Preserve an ambiguous result as pending. A changed provider transaction id is a real update.
      nextStatus = "pending";
    }

    if (!nextStatus) return "01";
    const statusChanged = current.status !== nextStatus;
    const transactionChanged = current.providerTransactionId !== transactionId;
    if (!statusChanged && !transactionChanged) return "01";

    await tx
      .insert(paymentEvents)
      .values({ eventId: id, provider: "vnpay", type: outcome });
    await tx
      .update(ridePayments)
      .set({
        status: nextStatus,
        providerTransactionId: transactionId,
        ...(paidAt ? { paidAt } : {}),
      })
      .where(eq(ridePayments.id, current.id));
    return "00";
  });
}

export async function processVnpayIpn(
  query: VnpayQuery,
  configuration = getPaymentConfiguration(),
): Promise<string> {
  if (!configuration.available || !configuration.hashSecret) return "01";
  const verified = verifyVnpaySignature(query, configuration.hashSecret);
  if (!verified.valid) return "97";
  const db = await requirePaymentDb();
  return applyIpn(db, verified.values, configuration);
}

export function registerPaymentRoutes(app: Express): void {
  app.get("/api/payments/vnpay/ipn", async (req: Request, res: Response) => {
    try {
      const code = await processVnpayIpn(req.query as VnpayQuery);
      response(res, code);
    } catch {
      console.error("[Payments] VNPay IPN processing failed");
      response(res, "99");
    }
  });
}

export { applyIpn };
