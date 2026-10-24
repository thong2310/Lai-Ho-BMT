import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getPaymentConfiguration } from "./config";
import { paymentActor } from "./db";
import { checkoutPayment, getPaymentHistory, getPaymentOverview, mapPaymentResult, publicPaymentConfiguration, reconcilePayment } from "./service";
import { mapPayment, PaymentError } from "./types";

function mapError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  if (error instanceof PaymentError) throw new TRPCError({ code: error.code === "SERVICE_UNAVAILABLE" ? "SERVICE_UNAVAILABLE" : error.code, message: error.message });
  if (error instanceof Error && error.message === "Database is unavailable") throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Dịch vụ dữ liệu hiện không khả dụng" });
  console.error("[Payments] Operation failed");
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Không thể xử lý thanh toán, vui lòng thử lại" });
}

export const paymentsRouter = router({
  status: publicProcedure.query(() => publicPaymentConfiguration()),
  overview: protectedProcedure.input(z.object({ rideId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    try {
      const result = await getPaymentOverview(paymentActor(ctx.user), input.rideId);
      const config = getPaymentConfiguration();
      return { configuration: { available: config.available, provider: config.provider, mode: config.mode, reason: config.reason }, payment: mapPaymentResult(result.payment), canPay: result.canPay };
    } catch (error) {
      return mapError(error);
    }
  }),
  history: protectedProcedure.query(async ({ ctx }) => {
    try {
      return (await getPaymentHistory(paymentActor(ctx.user))).map(mapPayment);
    } catch (error) {
      return mapError(error);
    }
  }),
  checkout: protectedProcedure.input(z.object({ rideId: z.number().int().positive(), returnOrigin: z.string().trim().min(1).max(512) })).mutation(async ({ ctx, input }) => {
    try {
      return await checkoutPayment(paymentActor(ctx.user), input.rideId, input.returnOrigin, ctx.req.ip);
    } catch (error) {
      return mapError(error);
    }
  }),
  reconcile: protectedProcedure.input(z.object({ rideId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    try {
      return mapPaymentResult(await reconcilePayment(paymentActor(ctx.user), input.rideId));
    } catch (error) {
      return mapError(error);
    }
  }),
});
