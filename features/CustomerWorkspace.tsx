import { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Button,
  Card,
  COLORS,
  Empty,
  Field,
  Icon,
  Notice,
  Pill,
  RouteLine,
  SectionTitle,
  StatusPill,
} from "@/components/laiho/ui";
import { LocationSearch } from "@/components/laiho/LocationSearch";
import { RideMap } from "@/components/laiho/RideMap";
import { RideTracking } from "@/components/laiho/RideTracking";
import { RidePayment } from "@/components/laiho/RidePayment";
import { getCurrentCoordinate } from "@/hooks/use-current-location";
import { trpc } from "@/lib/trpc";
import {
  LOCATIONS,
  VEHICLES,
  formatDate,
  formatMoney,
  type Quote,
  type VehicleType,
  type Workspace,
} from "@/shared/domain";
import type { GeoPlace } from "@/shared/mobility";

const HERO = "/manus-storage/async-images/NfkU7yC8QrqFl9NESXoht3/image-2.webp";
const localSchedule = () => {
  const d = new Date(Date.now() + 20 * 60000);
  const part = (key: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      [key]: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .find((p) => p.type === key)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
};
function parseSchedule(text: string) {
  return new Date(text.replace(" ", "T") + ":00+07:00");
}
function QuoteBreakdown({ quote }: { quote: Quote }) {
  const rows: [string, number][] = [
    ["Phí mở cuốc", quote.baseFare],
    [`Quãng đường · ${quote.distanceKm} km`, quote.distanceFare],
  ];
  if (quote.nightFee) rows.push(["Phụ phí đêm (22:00–06:00)", quote.nightFee]);
  if (quote.peakFee) rows.push(["Phụ phí giờ cao điểm", quote.peakFee]);
  if (quote.vehicleFee) rows.push(["Phụ phí loại xe", quote.vehicleFee]);
  if (quote.minAdjustment)
    rows.push(["Điều chỉnh mức tối thiểu", quote.minAdjustment]);
  return (
    <>
      {rows.map(([label, amount]) => (
        <View key={label} style={s.priceRow}>
          <Text style={s.small}>{label}</Text>
          <Text style={s.small}>{formatMoney(amount)}</Text>
        </View>
      ))}
      <View
        style={[
          s.between,
          { borderTopWidth: 1, borderColor: COLORS.border, paddingTop: 12 },
        ]}
      >
        <Text style={s.body}>Tổng dự kiến</Text>
        <Text style={s.total}>{formatMoney(quote.total)}</Text>
      </View>
    </>
  );
}

type Props = {
  data: Workspace | null;
  demo: boolean;
  onLogin: () => void;
  tab: string;
  authenticated: boolean;
  onNavigate: (tab: string) => void;
};
export function CustomerWorkspace({
  data,
  demo,
  onLogin,
  tab,
  authenticated,
  onNavigate,
}: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const utils = trpc.useUtils();
  const pricing = trpc.booking.pricing.useQuery();
  const [pickup, setPickup] = useState(LOCATIONS[0].label);
  const [dropoff, setDropoff] = useState(LOCATIONS[1].label);
  const [from, setFrom] = useState<GeoPlace | null>(LOCATIONS[0]);
  const [to, setTo] = useState<GeoPlace | null>(LOCATIONS[1]);
  const [zone, setZone] = useState(LOCATIONS[0].zone);
  const [distanceMode, setDistanceMode] = useState<"maps" | "manual">("maps");
  const [km, setKm] = useState("5");
  const [vehicle, setVehicle] = useState<VehicleType>("automatic");
  const [schedule, setSchedule] = useState(localSchedule);
  const [timing, setTiming] = useState<"now" | "later">("now");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = data?.rides.find((ride) => ride.id === selectedId) ?? null;
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [findingGps, setFindingGps] = useState(false);
  const [findingAddress, setFindingAddress] = useState(false);
  const [clock, setClock] = useState(() =>
    new Date(Date.now() + 5 * 60000).toISOString(),
  );
  useEffect(() => {
    const timer = setInterval(
      () => setClock(new Date(Date.now() + 5 * 60000).toISOString()),
      30000,
    );
    return () => clearInterval(timer);
  }, []);
  const date = parseSchedule(schedule);
  const when =
    timing === "later" && !Number.isNaN(date.getTime())
      ? date.toISOString()
      : clock;
  const route = trpc.maps.route.useQuery(
    { pickup: from ?? LOCATIONS[0], dropoff: to ?? LOCATIONS[1] },
    {
      enabled: tab === "book" && distanceMode === "maps" && !!from && !!to,
      staleTime: 120000,
      refetchInterval: 600000,
      retry: false,
    },
  );
  const routeData =
    distanceMode === "maps" && from && to ? route.data : undefined;
  const distance =
    distanceMode === "maps"
      ? (routeData?.distanceKm ?? 0)
      : Number(km.replace(",", "."));
  const validDistance =
    Number.isFinite(distance) && distance >= 0.5 && distance <= 300;
  const ready =
    validDistance &&
    (distanceMode === "manual" ||
      (!!routeData && !route.isFetching && !route.error));
  const quote = trpc.booking.quote.useQuery(
    {
      distanceKm: validDistance ? distance : 1,
      scheduledAt: when,
      vehicleType: vehicle,
      ...(routeData ? { routeToken: routeData.routeToken } : {}),
    },
    { enabled: ready && tab === "book", staleTime: 10000, retry: false },
  );
  const create = trpc.booking.create.useMutation({
    onSuccess: (ride) => {
      setConfirm(false);
      setSuccess(`Đã tạo cuốc ${ride.code}. Yêu cầu đang chờ admin điều phối.`);
      utils.workspace.snapshot.invalidate();
      onNavigate("trips");
    },
    onError: (caught) => {
      setError(caught.message);
      setConfirm(false);
    },
  });
  const cancel = trpc.booking.cancel.useMutation({
    onSuccess: () => {
      setCancelId(null);
      setSelectedId(null);
      utils.workspace.snapshot.invalidate();
      setSuccess("Đã hủy yêu cầu đặt tài xế.");
    },
    onError: (caught) => setError(caught.message),
  });
  const chooseFrom = (place: GeoPlace) => {
    setFrom(place);
    setPickup(place.label);
    setZone(place.zone ?? "TP.HCM");
  };
  const chooseTo = (place: GeoPlace) => {
    setTo(place);
    setDropoff(place.label);
  };
  async function resolveAddresses() {
    if (findingAddress) return;
    setFindingAddress(true);
    setError("");
    try {
      const [a, b] = await Promise.all([
        utils.maps.geocode.fetch({ address: pickup }),
        utils.maps.geocode.fetch({ address: dropoff }),
      ]);
      chooseFrom(a);
      chooseTo(b);
      setDistanceMode("maps");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Chưa xác định được tọa độ của địa chỉ.",
      );
    } finally {
      setFindingAddress(false);
    }
  }
  async function useCurrentLocation() {
    if (findingGps) return;
    setFindingGps(true);
    setError("");
    try {
      const coordinate = await getCurrentCoordinate();
      const place = await utils.maps.reverse.fetch(coordinate);
      chooseFrom(place);
      setDistanceMode("maps");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Chưa lấy được vị trí. Hãy cho phép GPS hoặc nhập địa chỉ.",
      );
    } finally {
      setFindingGps(false);
    }
  }
  function requestBooking() {
    setError("");
    if (!pickup.trim() || !dropoff.trim())
      return setError("Vui lòng điền điểm đón và điểm đến.");
    if (pickup.trim() === dropoff.trim())
      return setError("Điểm đón và điểm đến cần khác nhau.");
    if (!ready)
      return setError(
        distanceMode === "maps"
          ? "Chọn địa chỉ có tọa độ và chờ tuyến đường cập nhật, hoặc chuyển sang km thủ công."
          : "Quãng đường phải từ 0,5 đến 300 km.",
      );
    if (!/^(0|\+84)[0-9\s.-]{8,13}$/.test(phone))
      return setError("Vui lòng nhập số điện thoại Việt Nam hợp lệ.");
    if (
      timing === "later" &&
      (Number.isNaN(date.getTime()) || date.getTime() < Date.now())
    )
      return setError("Thời gian đặt trước cần ở tương lai (giờ Việt Nam).");
    if (!authenticated || demo) return onLogin();
    if (!quote.data || quote.isFetching || quote.error)
      return setError("Vui lòng chờ báo giá cập nhật.");
    setConfirm(true);
  }

  if (tab === "pricing")
    return (
      <View style={s.stack}>
        <SectionTitle
          title="Giá rõ ràng, trước khi đi"
          subtitle="Bảng giá hiệu lực từ hệ thống; giá snapshot được lưu cho từng cuốc."
        />
        <Card>
          {pricing.data ? (
            <>
              {[
                ["Phí mở cuốc", pricing.data.baseFare],
                ["Đơn giá mỗi km", pricing.data.perKm],
                ["Giá tối thiểu", pricing.data.minFare],
                ["Phụ phí đêm", pricing.data.nightFee],
                ["Phụ phí cao điểm", pricing.data.peakFee],
              ].map(([label, amount]) => (
                <View key={String(label)} style={s.priceRow}>
                  <Text style={s.body}>{label}</Text>
                  <Text style={s.priceValue}>
                    {formatMoney(Number(amount))}
                  </Text>
                </View>
              ))}
              <Notice text="Giờ đêm 22:00–06:00; cao điểm 07:00–09:00 và 17:00–19:00 (giờ Việt Nam)." />
              <Button
                title="Đặt tài xế ngay"
                onPress={() => onNavigate("book")}
              />
            </>
          ) : (
            <Notice
              tone="amber"
              text="Đang tải bảng giá hoặc dịch vụ hiện không khả dụng."
            />
          )}
        </Card>
        <Notice
          tone="blue"
          text="Google Maps tính quãng đường đường bộ. ETA là ước tính, không cam kết giao thông; giá chưa gồm phí cầu đường/đỗ xe phát sinh. Chế độ km thủ công được đánh dấu riêng."
        />
      </View>
    );
  if (tab === "help")
    return (
      <View style={s.stack}>
        <SectionTitle
          title="An tâm trên mọi hành trình"
          subtitle="GPS có quyền riêng tư và giá minh bạch."
        />
        {[
          {
            title: "Lái hộ trên xe của bạn",
            text: "Tài xế đến và lái chính chiếc xe của bạn. Chọn đúng loại hộp số và ghi chú đặc điểm xe.",
          },
          {
            title: "Theo dõi tài xế",
            text: "Khi tài xế bật chia sẻ GPS cho cuốc đã nhận, bạn xem vị trí mới nhất trên bản đồ. Ứng dụng làm mới khoảng 5 giây; vị trí cũ được đánh dấu. GPS chỉ chia sẻ khi app tài xế đang mở.",
          },
          {
            title: "Vị trí hiện tại của khách",
            text: "Nút Dùng vị trí của tôi xin quyền GPS để điền điểm đón. Khách không tự động phát vị trí liên tục. Nếu từ chối quyền, vẫn có thể tìm/nhập địa chỉ.",
          },
          {
            title: "Thanh toán an toàn",
            text: "Thanh toán trực tuyến chỉ mở cổng đã được merchant cấu hình; trạng thái xác minh tại server. Chưa kết nối merchant thì không tạo giao dịch hay hiển thị giả đã trả tiền.",
          },
          {
            title: "Xác minh tài xế",
            text: "Admin xét duyệt hồ sơ tự khai. eKYC và đối soát GPLX điện tử chưa kết nối.",
          },
        ].map((item) => (
          <Card key={item.title}>
            <Text style={s.cardTitle}>{item.title}</Text>
            <Text style={s.body}>{item.text}</Text>
          </Card>
        ))}
      </View>
    );
  if (tab === "trips")
    return (
      <View style={s.stack}>
        <SectionTitle
          title="Chuyến của tôi"
          subtitle="Một lịch sử dùng chung trên web và điện thoại."
          right={
            <Button
              title="Đặt chuyến mới"
              icon="add"
              variant="secondary"
              onPress={() => onNavigate("book")}
            />
          }
        />
        {success ? <Notice text={success} /> : null}
        {error ? <Notice tone="red" text={error} /> : null}
        {!authenticated && !demo ? (
          <Card>
            <Empty
              title="Đăng nhập để xem hành trình"
              subtitle="Dữ liệu chuyến chỉ dành cho người trong cuốc."
            />
            <Button title="Đăng nhập bằng Manus" onPress={onLogin} />
          </Card>
        ) : data?.rides.length ? (
          data.rides.map((ride) => (
            <Card key={ride.id}>
              <View style={s.between}>
                <Text style={s.cardTitle}>{ride.code}</Text>
                <StatusPill status={ride.status} />
              </View>
              <RouteLine pickup={ride.pickup} dropoff={ride.dropoff} />
              <View style={s.between}>
                <Text style={s.small}>
                  {formatDate(ride.scheduledAt)} · {ride.distanceKm} km
                </Text>
                <Text style={s.priceValue}>{formatMoney(ride.price)}</Text>
              </View>
              {ride.driverName ? (
                <Text style={s.body}>Tài xế: {ride.driverName}</Text>
              ) : null}
              <Button
                title="Xem hành trình & GPS"
                variant="secondary"
                onPress={() => {
                  setSelectedId(ride.id);
                  setCancelId(null);
                }}
              />
            </Card>
          ))
        ) : (
          <Card>
            <Empty
              title="Chưa có chuyến đi nào"
              subtitle="Đặt tài xế để bắt đầu hành trình."
            />
          </Card>
        )}
        <Modal
          visible={!!selected}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedId(null)}
        >
          <View style={s.overlay}>
            <ScrollView style={s.modal} contentContainerStyle={s.modalBody}>
              <View style={s.between}>
                <Text style={s.cardTitle}>Hành trình {selected?.code}</Text>
                <Pressable
                  onPress={() => setSelectedId(null)}
                  accessibilityLabel="Đóng chi tiết chuyến"
                >
                  <Icon name="close" />
                </Pressable>
              </View>
              {selected ? (
                <>
                  <StatusPill status={selected.status} />
                  <RouteLine
                    pickup={selected.pickup}
                    dropoff={selected.dropoff}
                  />
                  <Text style={s.body}>
                    {VEHICLES[selected.vehicleType]} ·{" "}
                    {formatDate(selected.scheduledAt)}
                  </Text>
                  <Text style={s.priceValue}>
                    {formatMoney(selected.price)}
                  </Text>
                  <Text style={s.body}>
                    {selected.driverName
                      ? `Tài xế: ${selected.driverName}`
                      : "Đang tìm tài xế phù hợp"}
                  </Text>
                  <RideTracking key={selected.id} ride={selected} demo={demo} />
                  <RidePayment ride={selected} demo={demo} />
                  {selected.note ? (
                    <Text style={s.body}>{selected.note}</Text>
                  ) : null}
                  {data?.events
                    .filter((event) => event.rideId === selected.id)
                    .map((event) => (
                      <View key={event.id} style={s.timeline}>
                        <Text style={s.body}>{event.message}</Text>
                        <Text style={s.small}>
                          {formatDate(event.createdAt)}
                        </Text>
                      </View>
                    ))}
                  {!["completed", "cancelled", "in_progress"].includes(
                    selected.status,
                  ) ? (
                    <Button
                      title="Hủy yêu cầu"
                      variant="danger"
                      onPress={() =>
                        demo ? onLogin() : setCancelId(selected.id)
                      }
                    />
                  ) : null}
                  {cancelId !== null ? (
                    <View style={{ gap: 12 }}>
                      <Notice
                        tone="amber"
                        text="Bạn chắc chắn muốn hủy cuốc này?"
                      />
                      <Button
                        title="Xác nhận hủy"
                        loading={cancel.isPending}
                        variant="danger"
                        onPress={() => cancel.mutate({ rideId: cancelId })}
                      />
                    </View>
                  ) : null}
                </>
              ) : null}
            </ScrollView>
          </View>
        </Modal>
      </View>
    );

  return (
    <View style={s.stack}>
      <View style={{ gap: 8 }}>
        <Text style={s.eyebrow}>DỊCH VỤ TÀI XẾ LÁI HỘ</Text>
        <Text style={[s.headline, { fontSize: wide ? 38 : 29 }]}>
          Bạn tận hưởng.{wide ? " " : "\n"}Chúng tôi cầm lái.
        </Text>
        <Text style={s.subtitle}>
          Biết giá trước. Xem tuyến đường. Về nhà an tâm.
        </Text>
      </View>
      {error ? <Notice text={error} tone="red" /> : null}
      <View
        style={{
          flexDirection: wide ? "row" : "column",
          gap: 24,
          alignItems: "stretch",
        }}
      >
        <Card
          style={{
            flex: wide ? 0.92 : undefined,
            padding: wide ? 26 : 20,
            gap: 18,
          }}
        >
          <View style={s.between}>
            <Text style={s.cardTitle}>Đặt tài xế lái hộ</Text>
            <Pill label="Giá minh bạch" />
          </View>
          <View style={s.segment}>
            {(["now", "later"] as const).map((option) => (
              <Pressable
                key={option}
                onPress={() => setTiming(option)}
                style={[s.segmentButton, timing === option && s.segmentActive]}
              >
                <Icon
                  name={option === "now" ? "flash-outline" : "calendar-outline"}
                  size={16}
                  color={COLORS.primary}
                />
                <Text style={s.choiceLabel}>
                  {option === "now" ? "Đi ngay" : "Đặt trước"}
                </Text>
              </Pressable>
            ))}
          </View>
          <LocationSearch
            label="ĐIỂM ĐÓN"
            value={pickup}
            marker={COLORS.primary}
            onChange={(value) => {
              setPickup(value);
              setFrom(null);
            }}
            onSelect={chooseFrom}
          />
          <Button
            title="Dùng vị trí của tôi"
            icon="locate-outline"
            variant="secondary"
            loading={findingGps}
            onPress={useCurrentLocation}
          />
          <LocationSearch
            label="ĐIỂM ĐẾN"
            value={dropoff}
            marker="#DDA03F"
            onChange={(value) => {
              setDropoff(value);
              setTo(null);
            }}
            onSelect={chooseTo}
          />
          {(!from || !to) && distanceMode === "maps" ? (
            <Button
              title="Xác định địa chỉ & tính tuyến"
              variant="secondary"
              icon="search"
              loading={findingAddress}
              onPress={resolveAddresses}
            />
          ) : null}
          <View style={s.segment}>
            {(["maps", "manual"] as const).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => setDistanceMode(mode)}
                style={[
                  s.segmentButton,
                  distanceMode === mode && s.segmentActive,
                ]}
              >
                <Text style={s.choiceLabel}>
                  {mode === "maps" ? "Google Maps" : "Km thủ công"}
                </Text>
              </Pressable>
            ))}
          </View>
          {distanceMode === "maps" ? (
            <View style={{ gap: 8 }}>
              {route.isFetching ? (
                <Text style={s.small}>Đang tính tuyến đường…</Text>
              ) : routeData && !route.error ? (
                <Text style={[s.body, { color: COLORS.primary }]}>
                  {routeData.distanceKm} km đường bộ · khoảng{" "}
                  {Math.ceil(routeData.durationSeconds / 60)} phút chạy xe
                </Text>
              ) : (
                <Notice
                  tone="amber"
                  text={
                    route.error?.message ??
                    "Chọn địa chỉ trong gợi ý hoặc xác định địa chỉ để xem tuyến đường."
                  }
                />
              )}
            </View>
          ) : (
            <>
              <Field
                label="Quãng đường ước tính thủ công (km)"
                value={km}
                onChangeText={setKm}
                keyboardType="decimal-pad"
              />
              <Notice
                tone="amber"
                text="Bạn nhập số km thủ công. Tuyến này chưa được Maps xác minh và không lưu tọa độ cho bản đồ chuyến."
              />
            </>
          )}
          <Text style={s.label}>XE CỦA BẠN</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(Object.keys(VEHICLES) as VehicleType[]).map((value) => (
              <Pressable
                key={value}
                onPress={() => setVehicle(value)}
                style={[
                  s.vehicle,
                  vehicle === value && {
                    borderColor: COLORS.primary,
                    backgroundColor: "#F0F9F3",
                  },
                ]}
              >
                <Icon
                  name={
                    value === "luxury" ? "car-sport-outline" : "car-outline"
                  }
                  size={23}
                  color={vehicle === value ? COLORS.primary : COLORS.muted}
                />
                <Text style={s.choiceLabel}>{VEHICLES[value]}</Text>
              </Pressable>
            ))}
          </View>
          <Field
            label="Số điện thoại liên hệ"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="09xx xxx xxx"
          />
          {timing === "later" ? (
            <Field
              label="Giờ Việt Nam (YYYY-MM-DD HH:mm)"
              value={schedule}
              onChangeText={setSchedule}
            />
          ) : null}
          <Field
            label="Ghi chú cho tài xế (không bắt buộc)"
            value={note}
            onChangeText={setNote}
            placeholder="Số tầng, đặc điểm xe, điểm hẹn…"
          />
          <View style={s.quote}>
            <View style={s.between}>
              <Text style={s.label}>BÁO GIÁ TỰ ĐỘNG</Text>
              <Pill
                label={
                  quote.isFetching
                    ? "Đang tính"
                    : distanceMode === "maps"
                      ? "Theo tuyến Maps"
                      : "Km thủ công"
                }
              />
            </View>
            {ready && quote.data && !quote.error ? (
              <QuoteBreakdown quote={quote.data} />
            ) : (
              <Text style={s.small}>
                {quote.error?.message ?? "Chọn tuyến hợp lệ để xem báo giá."}
              </Text>
            )}
          </View>
          <Button
            title={
              authenticated ? "Xác nhận đặt tài xế" : "Đăng nhập & đặt tài xế"
            }
            icon="arrow-forward"
            loading={create.isPending}
            disabled={findingGps || findingAddress}
            onPress={requestBooking}
          />
          <Text style={[s.small, { textAlign: "center" }]}>
            Giá cuốc được server tính lại và lưu khi đặt. GPS chỉ dùng khi bạn
            cho phép.
          </Text>
        </Card>
        <View style={{ flex: wide ? 1.15 : undefined, gap: 18 }}>
          <Card style={{ padding: 14, gap: 12 }}>
            <View style={s.between}>
              <Text style={s.cardTitle}>Bản đồ hành trình</Text>
              <Icon name="map-outline" color={COLORS.primary} />
            </View>
            <RideMap
              state={{
                pickup: from,
                dropoff: to,
                polyline: distanceMode === "maps" ? routeData?.polyline : null,
              }}
              height={wide ? 350 : 280}
            />
            <Text style={s.small}>
              Xanh: điểm đón · Vàng: điểm đến. Bản đồ tương tác Google Maps.
            </Text>
          </Card>
          <View style={[s.hero, { height: 210 }]}>
            <Image
              source={
                Platform.OS === "web"
                  ? { uri: HERO }
                  : require("../assets/images/hero-native.jpg")
              }
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
              }}
              resizeMode="cover"
            />
            <View style={s.heroOverlay}>
              <Text style={s.heroTitle}>Đi vui. Về an tâm.</Text>
              <Text style={s.heroText}>
                Một người lái đáng tin cho những lúc bạn cần nghỉ ngơi.
              </Text>
            </View>
          </View>
          <Card style={{ gap: 16 }}>
            <Text style={s.cardTitle}>Về nhà trong 3 bước</Text>
            {[
              {
                n: "01",
                title: "Chọn hành trình, biết giá trước",
                desc: "Google Maps tính đường bộ; giá hiển thị từng thành phần.",
              },
              {
                n: "02",
                title: "Tài xế phù hợp nhận cuốc",
                desc: "Admin điều phối tới tài xế đã xét duyệt.",
              },
              {
                n: "03",
                title: "Theo dõi hành trình của bạn",
                desc: "GPS khi tài xế bật chia sẻ; trạng thái dùng chung website/app.",
              },
            ].map((step) => (
              <View key={step.n} style={{ flexDirection: "row", gap: 14 }}>
                <Text style={s.step}>{step.n}</Text>
                <View style={{ gap: 5, flex: 1 }}>
                  <Text style={s.bodyStrong}>{step.title}</Text>
                  <Text style={s.small}>{step.desc}</Text>
                </View>
              </View>
            ))}
          </Card>
          <Notice
            tone="blue"
            text="GPS chỉ hoạt động foreground khi người dùng chủ động bật. Thanh toán cần merchant hợp lệ; không thu tiền nếu chưa kết nối cổng."
          />
        </View>
      </View>
      <Modal
        visible={confirm}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirm(false)}
      >
        <View style={s.overlay}>
          <View style={[s.modal, { padding: 24, gap: 18 }]}>
            <Text style={s.cardTitle}>Xác nhận hành trình</Text>
            <RouteLine pickup={pickup} dropoff={dropoff} />
            <Text style={s.body}>
              {VEHICLES[vehicle]} · {formatDate(when)} · {distance} km
            </Text>
            <Text style={s.total}>
              {quote.data ? formatMoney(quote.data.total) : ""}
            </Text>
            <Notice text="Cuốc sẽ được lưu để Admin điều phối. Thanh toán trực tuyến thực hiện sau khi chuyến hoàn tất và cổng được cấu hình." />
            <Button
              title="Đặt tài xế"
              loading={create.isPending}
              onPress={() =>
                create.mutate({
                  pickup: pickup.trim(),
                  dropoff: dropoff.trim(),
                  zone,
                  distanceKm: distance,
                  scheduledAt: when,
                  vehicleType: vehicle,
                  phone,
                  note,
                  ...(routeData ? { routeToken: routeData.routeToken } : {}),
                })
              }
            />
            <Button
              title="Quay lại"
              variant="ghost"
              onPress={() => setConfirm(false)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  stack: { gap: 23 },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
  },
  headline: {
    color: COLORS.ink,
    fontWeight: "800",
    letterSpacing: -1,
    lineHeight: 45,
  },
  subtitle: { color: COLORS.muted, fontSize: 14, lineHeight: 22 },
  cardTitle: { color: COLORS.ink, fontWeight: "700", fontSize: 18 },
  body: { color: "#526D5F", fontSize: 13, lineHeight: 21 },
  bodyStrong: { color: COLORS.ink, fontSize: 13, fontWeight: "700" },
  small: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  label: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  between: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 4,
  },
  priceValue: { color: COLORS.ink, fontSize: 17, fontWeight: "700" },
  total: { color: COLORS.primary, fontSize: 26, fontWeight: "800" },
  quote: { backgroundColor: "#F4F9F6", borderRadius: 12, padding: 16, gap: 10 },
  segment: {
    flexDirection: "row",
    padding: 4,
    backgroundColor: "#F2F6F2",
    borderRadius: 10,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    padding: 10,
    borderRadius: 7,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  segmentActive: { backgroundColor: "#FFFFFF" },
  choiceLabel: { color: COLORS.primary, fontSize: 11, fontWeight: "600" },
  vehicle: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    alignItems: "center",
    gap: 7,
  },
  hero: { borderRadius: 16, overflow: "hidden", backgroundColor: "#193F34" },
  heroOverlay: {
    flex: 1,
    padding: 25,
    justifyContent: "flex-end",
    gap: 10,
    backgroundColor: "rgba(9,37,28,0.25)",
  },
  heroTitle: { color: "#FFFFFF", fontSize: 29, fontWeight: "800" },
  heroText: { color: "#E4EEE5", fontSize: 12, lineHeight: 19 },
  step: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700",
    width: 34,
    paddingVertical: 8,
  },
  overlay: {
    flex: 1,
    padding: 18,
    backgroundColor: "rgba(14,36,28,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  modal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    width: "100%",
    maxWidth: 640,
    maxHeight: "92%",
  },
  modalBody: { gap: 18, padding: 22 },
  timeline: {
    borderLeftWidth: 2,
    borderColor: COLORS.primary,
    paddingLeft: 14,
    gap: 5,
  },
});
