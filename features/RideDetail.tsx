import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Card, COLORS, Icon, Pill, RouteLine } from "@/components/laiho/ui";
import { RideTracking } from "@/components/laiho/RideTracking";
import { RidePayment } from "@/components/laiho/RidePayment";
import {
  formatDate,
  formatMoney,
  STATUS_LABELS,
  type Offer,
  type Ride,
  type RideEvent,
} from "@/shared/domain";

type Props = {
  ride: Ride;
  events: RideEvent[];
  offers?: Offer[];
  demo?: boolean;
  trackEnabled?: boolean;
  paymentReadOnly?: boolean;
};

const tone = (
  status: Ride["status"],
): "green" | "amber" | "blue" | "red" | "gray" => {
  if (status === "completed") return "green";
  if (status === "cancelled") return "red";
  if (status === "pending" || status === "offered") return "amber";
  return "blue";
};

export function RideDetail({
  ride,
  events,
  offers = [],
  demo = false,
  trackEnabled = true,
  paymentReadOnly = true,
}: Props) {
  const [now] = useState(Date.now);
  const rideEvents = events
    .filter((event) => event.rideId === ride.id)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  const rideOffers = offers
    .filter((offer) => offer.rideId === ride.id)
    .sort(
      (a, b) =>
        new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime(),
    );
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.code}>#{ride.code}</Text>
          <Text style={styles.muted}>
            {formatDate(ride.scheduledAt)} · {ride.zone}
          </Text>
        </View>
        <Pill label={STATUS_LABELS[ride.status]} tone={tone(ride.status)} />
      </View>
      <Card style={styles.routeCard}>
        <RouteLine pickup={ride.pickup} dropoff={ride.dropoff} />
        <View style={styles.metaGrid}>
          <Meta label="Khoảng cách ước tính" value={`${ride.distanceKm} km`} />
          <Meta
            label="Loại xe"
            value={
              ride.vehicleType === "luxury"
                ? "Xe cao cấp"
                : ride.vehicleType === "automatic"
                  ? "Số tự động"
                  : "Số sàn"
            }
          />
          <Meta
            label="Thu nhập tài xế"
            value={formatMoney(ride.driverIncome)}
          />
          <Meta label="Giá cuốc" value={formatMoney(ride.price)} />
        </View>
      </Card>
      {trackEnabled ? (
        <RideTracking ride={ride} demo={demo} trackEnabled allowShare={false} />
      ) : null}
      {trackEnabled ? (
        <RidePayment ride={ride} demo={demo} readOnly={paymentReadOnly} />
      ) : null}
      <View style={styles.gpsNote}>
        <Icon name="location-outline" size={18} color="#3477BF" />
        <Text style={styles.gpsText}>
          Chưa bật GPS · Khoảng cách tới điểm đón chưa được tính trong MVP.
        </Text>
      </View>
      {rideOffers.length ? (
        <View style={styles.offerSection}>
          <Text style={styles.heading}>Lịch sử offer</Text>
          {rideOffers.map((offer) => {
            const expired =
              offer.status === "sent" &&
              new Date(offer.expiresAt).getTime() <= now;
            const status =
              offer.status === "sent"
                ? expired
                  ? "Đã hết hạn"
                  : "Đang chờ"
                : offer.status === "accepted"
                  ? "Đã nhận"
                  : offer.status === "rejected"
                    ? "Đã từ chối"
                    : "Đã hết hạn";
            const offerTone =
              offer.status === "accepted"
                ? "green"
                : offer.status === "rejected" ||
                    expired ||
                    offer.status === "expired"
                  ? "gray"
                  : "amber";
            return (
              <View key={offer.id} style={styles.offerRow}>
                <View style={styles.offerCopy}>
                  <Text style={styles.eventMessage}>
                    Tài xế #{offer.driverId}
                  </Text>
                  <Text style={styles.muted}>
                    Hạn phản hồi: {formatDate(offer.expiresAt)}
                  </Text>
                </View>
                <Pill label={status} tone={offerTone} />
              </View>
            );
          })}
        </View>
      ) : null}
      <Text style={styles.heading}>Timeline vận hành</Text>
      {rideEvents.length ? (
        rideEvents.map((event, index) => (
          <View key={event.id} style={styles.eventRow}>
            <View style={styles.track}>
              {index < rideEvents.length - 1 ? (
                <View style={styles.trackLine} />
              ) : null}
              <View style={styles.eventDot} />
            </View>
            <View style={styles.eventText}>
              <Text style={styles.eventMessage}>{event.message}</Text>
              <Text style={styles.muted}>
                {event.actorName} · {formatDate(event.createdAt)}
              </Text>
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.muted}>Chưa có sự kiện timeline cho cuốc này.</Text>
      )}
    </ScrollView>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.meta}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 20 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  code: { color: COLORS.ink, fontSize: 18, fontWeight: "800" },
  muted: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  routeCard: { padding: 16 },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 15,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 13,
    marginTop: 6,
  },
  meta: { minWidth: 130, flexGrow: 1 },
  value: { color: COLORS.ink, fontSize: 13, fontWeight: "800", marginTop: 3 },
  gpsNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#EAF2FE",
    padding: 11,
    borderRadius: 10,
  },
  gpsText: { color: "#3477BF", fontSize: 12, lineHeight: 18, flex: 1 },
  heading: { color: COLORS.ink, fontSize: 16, fontWeight: "800", marginTop: 2 },
  eventRow: { flexDirection: "row", gap: 12, minHeight: 54 },
  track: { width: 12, alignItems: "center" },
  trackLine: {
    position: "absolute",
    width: 1,
    backgroundColor: "#CFE4DD",
    top: 12,
    bottom: -20,
  },
  eventDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
    marginTop: 3,
    borderWidth: 2,
    borderColor: "#DDF3EE",
  },
  eventText: { flex: 1 },
  eventMessage: {
    color: COLORS.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  offerSection: { gap: 10 },
  offerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  offerCopy: { flex: 1 },
});
