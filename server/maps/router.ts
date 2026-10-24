import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { GeoPlace, RoutePreview } from "../../shared/mobility";
import { publicProcedure, router } from "../_core/trpc";
import * as maps from "./client";
import { signRouteToken } from "./token";
import { mapDocument } from "./view";

const coordinate = z.number().finite();
const place = z.object({
  lat: coordinate.refine(
    (value) => value >= -90 && value <= 90,
    "Vĩ độ không hợp lệ",
  ),
  lng: coordinate.refine(
    (value) => value >= -180 && value <= 180,
    "Kinh độ không hợp lệ",
  ),
  label: z.string().trim().min(1).max(500),
  placeId: z.string().trim().min(1).max(300).optional(),
  zone: z.string().trim().min(1).max(120).optional(),
});

function mapsError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  const raw = error instanceof Error ? error.message : "";
  const message =
    raw === "No geocoding result"
      ? "Không tìm thấy địa điểm"
      : raw === "Maps request timed out"
        ? "Dịch vụ bản đồ phản hồi quá lâu, vui lòng thử lại"
        : raw === "Maps request rate limit exceeded"
          ? "Bạn thao tác bản đồ quá nhanh, vui lòng thử lại sau"
          : raw === "Maps service is not configured" ||
              raw === "Maps server credential is not configured"
            ? "Dịch vụ bản đồ chưa được cấu hình"
            : raw === "Route token signing secret is not configured"
              ? "Hệ thống ký lộ trình chưa được cấu hình"
              : "Dịch vụ bản đồ hiện không khả dụng";
  throw new TRPCError({
    code: raw.includes("configured") ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST",
    message,
  });
}

export const mapsRouter = router({
  config: publicProcedure.query(() => ({
    ...maps.mapsConfig(),
    ...mapDocument(),
  })),

  geocode: publicProcedure
    .input(z.object({ address: z.string().trim().min(1).max(500) }))
    .query(async ({ input }): Promise<GeoPlace> => {
      try {
        return await maps.geocode(input.address);
      } catch (error) {
        return mapsError(error);
      }
    }),

  reverse: publicProcedure
    .input(z.object({ lat: coordinate, lng: coordinate }))
    .query(async ({ input }): Promise<GeoPlace> => {
      if (
        input.lat < -90 ||
        input.lat > 90 ||
        input.lng < -180 ||
        input.lng > 180
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tọa độ không hợp lệ",
        });
      try {
        return await maps.reverseGeocode(input.lat, input.lng);
      } catch (error) {
        return mapsError(error);
      }
    }),

  search: publicProcedure
    .input(z.object({ query: z.string().trim().min(1).max(500) }))
    .query(async ({ input }): Promise<GeoPlace[]> => {
      try {
        return await maps.textSearch(input.query);
      } catch (error) {
        return mapsError(error);
      }
    }),

  route: publicProcedure
    .input(z.object({ pickup: place, dropoff: place }))
    .query(async ({ input }): Promise<RoutePreview> => {
      try {
        const route = await maps.directions(input.pickup, input.dropoff);
        const signed = signRouteToken({
          pickup: {
            label: input.pickup.label,
            lat: input.pickup.lat,
            lng: input.pickup.lng,
          },
          dropoff: {
            label: input.dropoff.label,
            lat: input.dropoff.lat,
            lng: input.dropoff.lng,
          },
          distanceKm: route.distanceKm,
          durationSeconds: route.durationSeconds,
          polyline: route.polyline,
        });
        return {
          pickup: input.pickup,
          dropoff: input.dropoff,
          distanceKm: route.distanceKm,
          durationSeconds: route.durationSeconds,
          polyline: route.polyline,
          routeToken: signed.token,
          expiresAt: signed.expiresAt,
        };
      } catch (error) {
        return mapsError(error);
      }
    }),
});
