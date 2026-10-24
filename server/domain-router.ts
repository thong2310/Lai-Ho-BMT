import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { DEFAULT_PRICING, type Pricing, type VehicleType } from "../shared/domain";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as domain from "./domain-db";
import { isValidDistance, isValidScheduledAt, isValidVietnamPhone, MAX_PRICING_FEE, MAX_PRICING_PER_KM } from "./services/rules";

z.config({
  customError: (issue) => {
    if (issue.code === "invalid_type") return "Kiểu dữ liệu không hợp lệ";
    if (issue.code === "invalid_value") return "Giá trị lựa chọn không hợp lệ";
    if (issue.code === "too_small") return "Giá trị chưa đủ lớn hoặc nội dung quá ngắn";
    if (issue.code === "too_big") return "Giá trị vượt quá giới hạn hoặc nội dung quá dài";
    if (issue.code === "invalid_format") return "Định dạng không hợp lệ";
    return "Dữ liệu không hợp lệ";
  },
});

const vehicleType = z.enum(["automatic", "manual", "luxury"], { error: "Loại xe không hợp lệ" });
const scheduledAt = z.string().refine((value) => isValidScheduledAt(value), "Thời gian đón phải hợp lệ, trong tương lai và không quá 90 ngày");
const distanceKm = z.number().finite().refine(isValidDistance, "Khoảng cách phải từ 0,5 đến 300 km");
const phone = z.string().trim().refine(isValidVietnamPhone, "Số điện thoại Việt Nam không hợp lệ");
const pricingInput = z.object({
  baseFare: z.number().int("Cước cơ bản phải là số nguyên").min(0, "Cước cơ bản không được âm").max(MAX_PRICING_FEE, "Cước cơ bản vượt giới hạn"),
  perKm: z.number().int("Đơn giá/km phải là số nguyên").min(0, "Đơn giá/km không được âm").max(MAX_PRICING_PER_KM, "Đơn giá/km vượt giới hạn 5.000.000"),
  minFare: z.number().int("Giá tối thiểu phải là số nguyên").positive("Giá tối thiểu phải lớn hơn 0").max(MAX_PRICING_FEE, "Giá tối thiểu vượt giới hạn"),
  nightFee: z.number().int("Phụ phí đêm phải là số nguyên").min(0, "Phụ phí đêm không được âm").max(MAX_PRICING_FEE, "Phụ phí đêm vượt giới hạn"),
  peakFee: z.number().int("Phụ phí cao điểm phải là số nguyên").min(0, "Phụ phí cao điểm không được âm").max(MAX_PRICING_FEE, "Phụ phí cao điểm vượt giới hạn"),
  commissionPercent: z.number().finite().min(0, "Hoa hồng không được âm").max(100, "Hoa hồng không được vượt quá 100%"),
});

const DOMAIN_MESSAGES: Record<string, string> = {
  "Database is unavailable": "Dịch vụ dữ liệu hiện không khả dụng",
  "Database did not return an inserted id": "Không thể lưu dữ liệu, vui lòng thử lại",
  "Pricing settings are unavailable": "Bảng giá hiện không khả dụng",
  "Ride not found": "Không tìm thấy cuốc xe",
  "Driver not found": "Không tìm thấy tài xế",
  "Driver profile not found": "Bạn chưa có hồ sơ tài xế",
  "Offer not found": "Không tìm thấy lời mời chuyến",
  "You cannot cancel this ride": "Bạn không có quyền hủy cuốc xe này",
  "This ride cannot be cancelled": "Cuốc xe này không thể hủy",
  "Pickup and dropoff must be different": "Điểm đón và điểm trả phải khác nhau",
  "Suspended drivers cannot self-unlock": "Tài xế đang tạm khóa không thể tự mở khóa",
  "Cannot edit driver credentials during an active ride": "Không thể sửa hồ sơ khi tài xế đang có cuốc hoạt động",
  "Driver must be verified before going online": "Tài xế phải được xác minh trước khi bật khả dụng",
  "Driver is not eligible to accept rides": "Tài xế chưa đủ điều kiện nhận cuốc",
  "Driver already has an active ride": "Tài xế đã có một cuốc đang hoạt động",
  "Offer is no longer available": "Lời mời chuyến không còn khả dụng",
  "Offer has expired": "Lời mời chuyến đã hết hạn",
  "Ride is no longer available": "Cuốc xe không còn khả dụng",
  "This ride is not assigned to you": "Cuốc xe này không được giao cho bạn",
  "Driver is not verified": "Tài xế chưa được xác minh",
  "Invalid ride transition": "Không thể chuyển trạng thái cuốc xe",
  "Ride cannot be dispatched in its current state": "Không thể điều phối lại cuốc xe ở trạng thái hiện tại",
  "At least one driver is required": "Cần chọn ít nhất một tài xế",
  "A reason is required": "Cần nhập lý do",
  "Credential metadata is incomplete": "Thông tin hồ sơ tài xế chưa đầy đủ",
  "Only verified drivers can be available": "Chỉ tài xế đã xác minh mới có thể khả dụng",
  "Pricing values are outside the allowed limits": "Giá trị bảng giá vượt giới hạn cho phép",
  "Driver has active rides that must be reassigned before this action": "Cần điều phối lại các cuốc đang hoạt động trước khi từ chối hoặc tạm khóa tài xế",
  "Invalid route token": "Mã lộ trình không hợp lệ hoặc đã hết hạn",
  "Route endpoints do not match booking labels": "Điểm đón và điểm trả không khớp với lộ trình đã xác nhận",
};

function domainError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  const raw = error instanceof Error ? error.message : "";
  const message = DOMAIN_MESSAGES[raw]
    ?? (/^Driver \d+ is not available$/.test(raw) ? "Tài xế được chọn không khả dụng" : undefined)
    ?? (/^Driver \d+ already has an active ride$/.test(raw) ? "Tài xế được chọn đã có cuốc đang hoạt động" : undefined)
    ?? "Không thể thực hiện thao tác, vui lòng thử lại";
  throw new TRPCError({ code: raw.startsWith("Database") ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST", message });
}

function domainUser(user: NonNullable<Parameters<typeof domain.getWorkspace>[0]>): domain.DomainUser {
  return { id: user.id, name: user.name, role: user.role };
}

export const bookingRouter = router({
  quote: publicProcedure
    .input(z.object({ distanceKm, scheduledAt, vehicleType, routeToken: z.string().trim().min(1).max(16_384).optional() }))
    .query(async ({ input }) => {
      try {
        return await domain.quoteBooking(input);
      } catch (error) {
        return domainError(error);
      }
    }),
  pricing: publicProcedure.query(async () => {
    try {
      return await domain.getPricing();
    } catch (error) {
      return domainError(error);
    }
  }),
  create: protectedProcedure
    .input(
      z.object({
        pickup: z.string().trim().min(1).max(500),
        dropoff: z.string().trim().min(1).max(500),
        zone: z.string().trim().min(1).max(120),
        distanceKm,
        scheduledAt,
        vehicleType,
        phone,
        note: z.string().trim().max(1000).default(""),
        routeToken: z.string().trim().min(1).max(16_384).optional(),
      }).refine((value) => value.pickup.localeCompare(value.dropoff, undefined, { sensitivity: "accent" }) !== 0, "Điểm đón và điểm trả phải khác nhau"),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await domain.createBooking(domainUser(ctx.user), input);
      } catch (error) {
        return domainError(error);
      }
    }),
  cancel: protectedProcedure
    .input(z.object({ rideId: z.number().int().positive("Mã cuốc xe không hợp lệ" ) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await domain.cancelBooking(domainUser(ctx.user), input.rideId);
      } catch (error) {
        return domainError(error);
      }
    }),
});

export const workspaceRouter = router({
  snapshot: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await domain.getWorkspace(domainUser(ctx.user));
    } catch (error) {
      return domainError(error);
    }
  }),
});

export const driverRouter = router({
  register: protectedProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(160),
      phone,
      zone: z.string().trim().min(1).max(120),
      experience: z.number().int().min(0).max(80),
      licenseNumber: z.string().trim().min(1).max(120),
      documentNote: z.string().trim().min(1).max(2000),
      vehiclePlate: z.string().trim().min(1).max(32),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await domain.registerDriver(domainUser(ctx.user), input);
      } catch (error) {
        return domainError(error);
      }
    }),
  setAvailability: protectedProcedure
    .input(z.object({ available: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await domain.setOwnAvailability(domainUser(ctx.user), input.available);
      } catch (error) {
        return domainError(error);
      }
    }),
  accept: protectedProcedure
    .input(z.object({ offerId: z.number().int().positive("Mã lời mời không hợp lệ") }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await domain.acceptOffer(domainUser(ctx.user), input.offerId);
      } catch (error) {
        return domainError(error);
      }
    }),
  reject: protectedProcedure
    .input(z.object({ offerId: z.number().int().positive("Mã lời mời không hợp lệ") }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await domain.rejectOffer(domainUser(ctx.user), input.offerId);
      } catch (error) {
        return domainError(error);
      }
    }),
  advance: protectedProcedure
    .input(z.object({ rideId: z.number().int().positive("Mã cuốc xe không hợp lệ") }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await domain.advanceRide(domainUser(ctx.user), input.rideId);
      } catch (error) {
        return domainError(error);
      }
    }),
});

export const adminRouter = router({
  dispatch: adminProcedure
    .input(z.object({ rideId: z.number().int().positive("Mã cuốc xe không hợp lệ"), driverIds: z.array(z.number().int().positive("Mã tài xế không hợp lệ")).min(1, "Cần chọn ít nhất một tài xế").max(50) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await domain.dispatchRide(domainUser(ctx.user), input.rideId, input.driverIds);
      } catch (error) {
        return domainError(error);
      }
    }),
  verify: adminProcedure
    .input(z.object({
      driverId: z.number().int().positive("Mã tài xế không hợp lệ"),
      verification: z.enum(["verified", "rejected", "suspended"], { error: "Trạng thái xác minh không hợp lệ" }),
      reason: z.string().trim().max(1000),
    }).refine((value) => value.verification === "verified" || value.reason.length > 0, "Cần nhập lý do khi từ chối hoặc tạm khóa"))
    .mutation(async ({ ctx, input }) => {
      try {
        return await domain.verifyDriver(domainUser(ctx.user), input.driverId, input.verification, input.reason);
      } catch (error) {
        return domainError(error);
      }
    }),
  setAvailability: adminProcedure
    .input(z.object({ driverId: z.number().int().positive("Mã tài xế không hợp lệ"), available: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await domain.setDriverAvailability(domainUser(ctx.user), input.driverId, input.available);
      } catch (error) {
        return domainError(error);
      }
    }),
  updatePricing: adminProcedure
    .input(pricingInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await domain.updatePricing(domainUser(ctx.user), input as Pricing);
      } catch (error) {
        return domainError(error);
      }
    }),
});

export const domainRouters = {
  booking: bookingRouter,
  workspace: workspaceRouter,
  driver: driverRouter,
  admin: adminRouter,
};

export { DEFAULT_PRICING, type VehicleType };
