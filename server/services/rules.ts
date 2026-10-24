import type { Pricing, RideStatus, Verification } from "../../shared/domain";

export const ACTIVE_RIDE_STATUSES: RideStatus[] = ["accepted", "arriving", "met", "in_progress"];
export const DISPATCHABLE_RIDE_STATUSES: RideStatus[] = ["pending", "offered", "accepted", "arriving", "met"];
export const RIDE_STATUS_LABELS: Record<RideStatus, string> = {
  pending: "Chờ điều phối",
  offered: "Đã đẩy cuốc",
  accepted: "Đã nhận cuốc",
  arriving: "Đang đến",
  met: "Đã gặp khách",
  in_progress: "Đang chạy",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
};
export const VERIFICATION_STATUS_LABELS: Record<Verification, string> = {
  pending: "Chờ xác minh",
  verified: "Đã xác minh",
  rejected: "Bị từ chối",
  suspended: "Tạm khóa",
};

export const MAX_PRICING_PER_KM = 5_000_000;
export const MAX_PRICING_FEE = 100_000_000;

export function nextRideStatus(status: RideStatus): RideStatus | null {
  const next: Partial<Record<RideStatus, RideStatus>> = {
    accepted: "arriving",
    arriving: "met",
    met: "in_progress",
    in_progress: "completed",
  };
  return next[status] ?? null;
}

export function canAdvanceRide(status: RideStatus): boolean {
  return nextRideStatus(status) !== null;
}

export function canDispatchRide(status: RideStatus): boolean {
  return DISPATCHABLE_RIDE_STATUSES.includes(status);
}

export function canCancelRide(status: RideStatus): boolean {
  return status !== "completed" && status !== "in_progress" && status !== "cancelled";
}

export function isEligibleDriver(verification: Verification, available: boolean): boolean {
  return verification === "verified" && available;
}

export function isValidPricing(pricing: Pricing): boolean {
  return Number.isInteger(pricing.baseFare) && pricing.baseFare >= 0 && pricing.baseFare <= MAX_PRICING_FEE
    && Number.isInteger(pricing.perKm) && pricing.perKm >= 0 && pricing.perKm <= MAX_PRICING_PER_KM
    && Number.isInteger(pricing.minFare) && pricing.minFare > 0 && pricing.minFare <= MAX_PRICING_FEE
    && Number.isInteger(pricing.nightFee) && pricing.nightFee >= 0 && pricing.nightFee <= MAX_PRICING_FEE
    && Number.isInteger(pricing.peakFee) && pricing.peakFee >= 0 && pricing.peakFee <= MAX_PRICING_FEE
    && Number.isFinite(pricing.commissionPercent) && pricing.commissionPercent >= 0 && pricing.commissionPercent <= 100;
}

export function isValidScheduledAt(value: string, now = Date.now()): boolean {
  const time = Date.parse(value);
  const max = now + 90 * 24 * 60 * 60 * 1000;
  return Number.isFinite(time) && time >= now - 60_000 && time <= max;
}

export function isValidDistance(distanceKm: number): boolean {
  return Number.isFinite(distanceKm) && distanceKm >= 0.5 && distanceKm <= 300;
}

export function isValidVietnamPhone(phone: string): boolean {
  const normalized = phone.replace(/[ .-]/g, "");
  return /^(?:0(?:3|5|7|8|9)\d{8}|\+84(?:3|5|7|8|9)\d{8})$/.test(normalized);
}

export function maskPhone(phone: string): string {
  const normalized = phone.replace(/[ .-]/g, "");
  if (normalized.length < 7) return "***";
  return `${normalized.slice(0, 3)}***${normalized.slice(-3)}`;
}
