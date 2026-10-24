import type { PaymentConfiguration, PaymentOverview, RidePaymentRecord } from "../../shared/payments";
import type { RidePaymentRow } from "../../drizzle/payment-schema";

export type PaymentWithRide = RidePaymentRow & { rideCode: string };
export type PaymentActor = { id: number; name: string | null; email?: string | null; role: "user" | "driver" | "admin" };

export function mapPayment(row: PaymentWithRide): RidePaymentRecord {
  return {
    id: row.id,
    rideId: row.rideId,
    rideCode: row.rideCode,
    customerId: row.customerId,
    amount: row.amount,
    currency: row.currency.toUpperCase(),
    status: row.status,
    provider: row.provider,
    createdAt: new Date(row.createdAt).toISOString(),
    paidAt: row.paidAt ? new Date(row.paidAt).toISOString() : null,
  };
}

export function paymentOverview(configuration: PaymentConfiguration, payment: RidePaymentRecord | null, canPay: boolean): PaymentOverview {
  return { configuration, payment, canPay };
}

export class PaymentError extends Error {
  constructor(public readonly code: "BAD_REQUEST" | "FORBIDDEN" | "CONFLICT" | "NOT_FOUND" | "SERVICE_UNAVAILABLE", message: string) {
    super(message);
    this.name = "PaymentError";
  }
}
