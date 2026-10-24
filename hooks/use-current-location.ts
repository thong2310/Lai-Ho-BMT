import { Platform } from "react-native";
import * as Location from "expo-location";

import type { Coordinate } from "@/shared/mobility";

export type LocationErrorCode =
  | "UNSUPPORTED"
  | "INSECURE_CONTEXT"
  | "SERVICE_DISABLED"
  | "PERMISSION_DENIED"
  | "UNAVAILABLE";

export class CurrentLocationError extends Error {
  readonly code: LocationErrorCode;

  constructor(code: LocationErrorCode, message: string) {
    super(message);
    this.name = "CurrentLocationError";
    this.code = code;
  }
}

function assertCoordinate(value: Location.LocationObject): Coordinate {
  const { latitude, longitude } = value.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new CurrentLocationError(
      "UNAVAILABLE",
      "Thiết bị chưa trả về tọa độ GPS hợp lệ.",
    );
  }
  return { lat: latitude, lng: longitude };
}

function isSecureWebContext(): boolean {
  if (typeof window === "undefined") return false;
  if (window.isSecureContext) return true;
  const protocol = window.location?.protocol;
  const hostname = window.location?.hostname;
  return protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1";
}

/** Request location only from an explicit user action; this function never auto-starts GPS. */
export async function getCurrentCoordinate(): Promise<Coordinate> {
  if (Platform.OS === "web") {
    if (!isSecureWebContext()) {
      throw new CurrentLocationError(
        "INSECURE_CONTEXT",
        "Trình duyệt chỉ cho phép GPS trong kết nối HTTPS an toàn.",
      );
    }
  } else {
    const serviceEnabled = await Location.hasServicesEnabledAsync();
    if (!serviceEnabled) {
      throw new CurrentLocationError(
        "SERVICE_DISABLED",
        "Dịch vụ định vị đang tắt. Hãy bật GPS rồi thử lại.",
      );
    }
  }

  if (!Location.requestForegroundPermissionsAsync) {
    throw new CurrentLocationError(
      "UNSUPPORTED",
      "Thiết bị này chưa hỗ trợ chia sẻ vị trí.",
    );
  }

  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== Location.PermissionStatus.GRANTED) {
    throw new CurrentLocationError(
      "PERMISSION_DENIED",
      "GPS chưa được cấp quyền. Hãy cho phép quyền vị trí khi trình duyệt hoặc thiết bị hỏi.",
    );
  }

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return assertCoordinate(position);
  } catch (error) {
    if (error instanceof CurrentLocationError) throw error;
    throw new CurrentLocationError(
      "UNAVAILABLE",
      "Không thể lấy vị trí hiện tại. Hãy kiểm tra GPS và thử lại.",
    );
  }
}
