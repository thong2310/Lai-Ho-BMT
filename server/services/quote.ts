import type { Pricing, Quote, VehicleType } from "../../shared/domain";

export const VEHICLE_FEES: Record<VehicleType, number> = {
  automatic: 0,
  manual: 20_000,
  luxury: 30_000,
};

function hourInHoChiMinh(value: string | Date): number {
  const date = value instanceof Date ? value : new Date(value);
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).find((part) => part.type === "hour")?.value;
  return Number(hour ?? 0);
}

export function calculateQuote(
  pricing: Pricing,
  input: { distanceKm: number; scheduledAt: string | Date; vehicleType: VehicleType },
): Quote {
  const distanceKm = Math.round(input.distanceKm * 10) / 10;
  const baseFare = Math.round(pricing.baseFare);
  const distanceFare = Math.round(distanceKm * pricing.perKm);
  const hour = hourInHoChiMinh(input.scheduledAt);
  const nightFee = hour >= 22 || hour < 6 ? Math.round(pricing.nightFee) : 0;
  const peakFee = (hour >= 7 && hour < 9) || (hour >= 17 && hour < 19) ? Math.round(pricing.peakFee) : 0;
  const vehicleFee = VEHICLE_FEES[input.vehicleType];
  const subtotal = baseFare + distanceFare + nightFee + peakFee + vehicleFee;
  const minAdjustment = Math.max(0, Math.round(pricing.minFare) - subtotal);
  const total = subtotal + minAdjustment;
  const driverIncome = Math.round(total * (1 - pricing.commissionPercent / 100));

  return {
    baseFare,
    distanceFare,
    nightFee,
    peakFee,
    vehicleFee,
    minAdjustment,
    total,
    driverIncome,
    distanceKm,
    estimatedMinutes: Math.max(10, Math.round(distanceKm * 3 + 10)),
  };
}
