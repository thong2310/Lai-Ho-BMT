export type PaymentStatus =
  | "unpaid"
  | "creating"
  | "pending"
  | "paid"
  | "failed"
  | "expired";
export interface RidePaymentRecord {
  id: number;
  rideId: number;
  rideCode: string;
  customerId: number;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  createdAt: string;
  paidAt: string | null;
}
export interface PaymentConfiguration {
  available: boolean;
  provider: string;
  mode: "test" | "live" | "unconfigured";
  reason: string | null;
}
export interface PaymentOverview {
  configuration: PaymentConfiguration;
  payment: RidePaymentRecord | null;
  canPay: boolean;
}
export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Chưa thanh toán",
  creating: "Đang chuẩn bị cổng",
  pending: "Chờ cổng xác nhận",
  paid: "Đã thanh toán",
  failed: "Thanh toán chưa thành công",
  expired: "Phiên thanh toán hết hạn",
};
