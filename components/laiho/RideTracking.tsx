import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { trpc } from "@/lib/trpc";
import type { Ride } from "@/shared/domain";
import type { RideRoute, TrackingSnapshot } from "@/shared/mobility";
import { RideMap } from "./RideMap";
import { Button, Card, COLORS, Notice, SectionTitle } from "./ui";
import { useDriverGps } from "@/hooks/use-driver-gps";

type RideWithRoute = Ride & { route?: RideRoute | null };

type Props = {
  ride: Ride;
  demo?: boolean;
  allowShare?: boolean;
  trackEnabled?: boolean;
};

const ACTIVE_STATUSES: Ride["status"][] = [
  "accepted",
  "arriving",
  "met",
  "in_progress",
];

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = error as { data?: { code?: unknown }; code?: unknown };
  const code = value.data?.code ?? value.code;
  return typeof code === "string" ? code : undefined;
}

function formatAge(ageMs: number): string {
  const minutes = Math.max(1, Math.floor(ageMs / 60_000));
  return `${minutes} phút trước`;
}

export function RideTracking({
  ride,
  demo = false,
  allowShare = false,
  trackEnabled = true,
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  const enabled = !demo && trackEnabled;
  const snapshotQuery = trpc.location.snapshot.useQuery(
    { rideId: ride.id },
    {
      enabled,
      retry: false,
      refetchInterval: enabled ? 5_000 : false,
    },
  );
  const snapshot = snapshotQuery.data as TrackingSnapshot | undefined;
  const rideWithRoute = ride as RideWithRoute;
  const route = snapshot?.route ?? rideWithRoute.route ?? null;
  const activeRide = ACTIVE_STATUSES.includes(ride.status);
  const canShare = Boolean(
    !demo &&
      allowShare &&
      activeRide &&
      snapshot?.active &&
      snapshot.canShare,
  );
  const gps = useDriverGps(ride.id, canShare);
  const location = snapshot?.location ?? null;
  const receivedAt = location ? Date.parse(location.receivedAt) : NaN;
  const ageMs = Number.isFinite(receivedAt) ? Math.max(0, now - receivedAt) : 0;
  const olderThanTwoMinutes = Boolean(location) && (location?.stale || ageMs > 120_000);
  const olderThanFifteenMinutes = Boolean(location) && ageMs > 900_000;
  const mapState = useMemo(
    () => ({
      pickup: route?.pickup ?? null,
      dropoff: route?.dropoff ?? null,
      polyline: route?.polyline ?? null,
      driver: olderThanFifteenMinutes
        ? null
        : gps.coordinate ?? (location ? { lat: location.lat, lng: location.lng } : null),
    }),
    [gps.coordinate, location, olderThanFifteenMinutes, route],
  );
  const hasMapData = Boolean(
    mapState.pickup || mapState.dropoff || mapState.driver || mapState.polyline,
  );
  const forbidden = errorCode(snapshotQuery.error) === "FORBIDDEN";

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!trackEnabled) return null;

  return (
    <Card style={styles.card}>
      <SectionTitle
        title="Bản đồ & GPS"
        subtitle={demo ? "Chế độ demo · chỉ xem" : "Vị trí chỉ được chia sẻ khi tài xế chủ động bật"}
      />
      {demo ? (
        <Notice
          text="Đây là dữ liệu demo. Không yêu cầu quyền vị trí và không có điểm GPS hiện tại giả lập."
          tone="blue"
        />
      ) : null}
      {snapshotQuery.isLoading && enabled ? (
        <Notice text="Đang tải trạng thái theo dõi…" tone="blue" />
      ) : null}
      {forbidden ? (
        <Notice
          text="Bạn không có quyền xem vị trí GPS của cuốc này. Chỉ người liên quan đến cuốc mới được theo dõi."
          tone="amber"
        />
      ) : null}
      {snapshotQuery.isError && !forbidden ? (
        <Notice
          text="Chưa thể tải trạng thái GPS. Lộ trình tĩnh vẫn có thể được hiển thị nếu đã lưu tọa độ."
          tone="amber"
        />
      ) : null}
      {hasMapData ? (
        <RideMap state={mapState} height={240} />
      ) : (
        <Notice
          text="Chưa có tọa độ lộ trình được lưu. Hãy dùng địa chỉ điểm đón và điểm trả thủ công."
          tone="amber"
        />
      )}
      {route ? (
        <View style={styles.routeMeta}>
          <Text style={styles.metaText}>
            Tuyến đường Google Maps · khoảng {Math.round(route.durationSeconds / 60)} phút dự kiến
          </Text>
        </View>
      ) : null}
      {olderThanFifteenMinutes ? (
        <Notice
          text="Vị trí cuối đã quá 15 phút nên không được xem là vị trí hiện tại."
          tone="amber"
        />
      ) : olderThanTwoMinutes && location ? (
        <Notice
          text={`Vị trí cuối được ghi nhận ${formatAge(ageMs)}${location.accuracy == null ? "" : ` · độ chính xác ±${Math.round(location.accuracy)} m`}. Đây không phải vị trí trực tiếp.`}
          tone="amber"
        />
      ) : location ? (
        <Text style={styles.locationMeta}>
          Cập nhật {formatAge(ageMs)}{location.accuracy == null ? "" : ` · độ chính xác ±${Math.round(location.accuracy)} m`}
        </Text>
      ) : snapshot?.active ? (
        <Notice text="Đang chờ tài xế gửi vị trí GPS đầu tiên." tone="blue" />
      ) : null}
      {canShare ? (
        <View style={styles.shareBlock}>
          <Notice
            text={
              gps.sharing
                ? "GPS chỉ được gửi khi ứng dụng đang mở và ở foreground. Nếu chuyển nền, chia sẻ sẽ tự dừng và không tự bật lại."
                : "Khi bật, ứng dụng sẽ gửi vị trí gần nhất mỗi 5 giây khi đang mở. Bạn có thể dừng bất cứ lúc nào."
            }
            tone="blue"
          />
          <Button
            title={gps.sharing ? "Dừng chia sẻ" : "Bật chia sẻ GPS"}
            variant={gps.sharing ? "danger" : "primary"}
            loading={gps.busy}
            disabled={gps.busy}
            onPress={() => void (gps.sharing ? gps.stop() : gps.start())}
            icon={gps.sharing ? "stop-circle-outline" : "navigate-outline"}
          />
        </View>
      ) : null}
      {gps.error ? <Notice text={gps.error.message} tone="red" /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 16 },
  routeMeta: {
    paddingHorizontal: 2,
  },
  metaText: { color: COLORS.muted, fontSize: 12 },
  locationMeta: { color: COLORS.muted, fontSize: 12 },
  shareBlock: { gap: 10, marginTop: 2 },
});
