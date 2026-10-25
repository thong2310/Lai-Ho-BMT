import { useMemo, useState } from "react";
import {
  Modal,
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
} from "@/components/laiho/ui";
import {
  DEFAULT_PRICING,
  formatDate,
  formatMoney,
  STATUS_LABELS,
  type Driver,
  type Pricing,
  type Ride,
  type Workspace,
  VERIFICATION_LABELS,
} from "@/shared/domain";
import { trpc } from "@/lib/trpc";
import { RideDetail } from "./RideDetail";

type Props = {
  data: Workspace | null;
  demo: boolean;
  onLogin: () => void;
  tab: string;
};
type DriverDecision = "verified" | "rejected" | "suspended";
type PriceForm = Record<keyof Pricing, string>;
const EMPTY_RIDES: Ride[] = [];
const EMPTY_DRIVERS: Driver[] = [];

const messageFor = (error: unknown, fallback: string) =>
  error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message || fallback)
    : fallback;
const statusTone = (
  status: Ride["status"],
): "green" | "amber" | "blue" | "red" | "gray" =>
  status === "completed"
    ? "green"
    : status === "cancelled"
      ? "red"
      : ["pending", "offered"].includes(status)
        ? "amber"
        : "blue";
const verificationTone = (
  status: Driver["verification"],
): "green" | "amber" | "red" | "gray" =>
  status === "verified" ? "green" : status === "pending" ? "amber" : "red";
const todayKey = (value: string | Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
const initialPrice = (pricing: Pricing): PriceForm => ({
  baseFare: String(pricing.baseFare),
  perKm: String(pricing.perKm),
  minFare: String(pricing.minFare),
  nightFee: String(pricing.nightFee),
  peakFee: String(pricing.peakFee),
  commissionPercent: String(pricing.commissionPercent),
});

function LoginRequired({ onLogin }: { onLogin: () => void }) {
  return (
    <View style={styles.centered}>
      <View style={styles.loginMark}>
        <Icon name="speedometer" size={30} color={COLORS.primary} />
      </View>
      <Text style={styles.loginTitle}>Bảng điều hành</Text>
      <Text style={styles.loginCopy}>
        Đăng nhập bằng tài khoản Admin để điều phối cuốc, xét duyệt tài xế và
        cập nhật bảng giá.
      </Text>
      <Button
        title="Đăng nhập tài khoản nội bộ"
        onPress={onLogin}
        icon="arrow-forward"
      />
    </View>
  );
}
function DemoNotice({ onLogin }: { onLogin: () => void }) {
  return (
    <Pressable onPress={onLogin} style={styles.demoBanner}>
      <Icon name="flask" size={16} color={COLORS.primary} />
      <Text style={styles.demoText}>
        Dữ liệu demo · Mọi thao tác đang ở chế độ chỉ xem.
      </Text>
      <Text style={styles.loginLink}>Đăng nhập</Text>
    </Pressable>
  );
}

export function AdminWorkspace({ data, demo, onLogin, tab }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 820;
  const utils = trpc.useUtils();
  const dispatch = trpc.admin.dispatch.useMutation();
  const verify = trpc.admin.verify.useMutation();
  const setAvailability = trpc.admin.setAvailability.useMutation();
  const updatePricing = trpc.admin.updatePricing.useMutation();
  const cancel = trpc.booking.cancel.useMutation();
  const [notice, setNotice] = useState("");
  const [rideFilter, setRideFilter] = useState<"all" | Ride["status"]>("all");
  const [rideSearch, setRideSearch] = useState("");
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const [dispatchRide, setDispatchRide] = useState<Ride | null>(null);
  const [verifyDriver, setVerifyDriver] = useState<Driver | null>(null);
  const [selectedDrivers, setSelectedDrivers] = useState<number[]>([]);
  const [decision, setDecision] = useState<DriverDecision>("verified");
  const [reason, setReason] = useState("");
  const [priceOverride, setPriceOverride] = useState<PriceForm | null>(null);
  const [priceError, setPriceError] = useState("");
  const [cancelRideTarget, setCancelRideTarget] = useState<Ride | null>(null);
  const priceForm =
    priceOverride ?? initialPrice(data?.pricing ?? DEFAULT_PRICING);

  const rides = data?.rides ?? EMPTY_RIDES;
  const drivers = data?.drivers ?? EMPTY_DRIVERS;
  const events = data?.events ?? [];
  const today = todayKey(new Date());
  const todayRides = rides.filter((ride) => todayKey(ride.createdAt) === today);
  const completedToday = todayRides.filter(
    (ride) => ride.status === "completed",
  );
  const stats = {
    rides: todayRides.length,
    waiting: rides.filter((ride) =>
      ["pending", "offered"].includes(ride.status),
    ).length,
    running: rides.filter((ride) =>
      ["accepted", "arriving", "met", "in_progress"].includes(ride.status),
    ).length,
    online: drivers.filter(
      (driver) => driver.verification === "verified" && driver.available,
    ).length,
    income: completedToday.reduce((sum, ride) => sum + ride.price, 0),
  };
  const filteredRides = useMemo(
    () =>
      rideFilter === "all"
        ? rides
        : rides.filter((ride) => ride.status === rideFilter),
    [rideFilter, rides],
  );
  const eligibleDrivers = useMemo(() => {
    const activeDriverIds = new Set(
      rides
        .filter(
          (ride) =>
            ["accepted", "arriving", "met", "in_progress"].includes(
              ride.status,
            ) && ride.driverId !== null,
        )
        .map((ride) => ride.driverId as number),
    );
    return drivers.filter(
      (driver) =>
        driver.verification === "verified" &&
        driver.available &&
        !activeDriverIds.has(driver.id),
    );
  }, [drivers, rides]);
  const pendingDrivers = drivers.filter(
    (driver) => driver.verification === "pending",
  );

  const invalidate = async () => {
    try {
      await utils.workspace.snapshot.invalidate();
    } catch {
      /* parent snapshot remains the source of truth */
    }
  };
  const action = async (
    fn: () => Promise<unknown>,
    success: string,
  ): Promise<boolean> => {
    setNotice("");
    try {
      await fn();
      await invalidate();
      setNotice(success);
      return true;
    } catch (error) {
      setNotice(messageFor(error, "Không thể hoàn tất thao tác."));
      return false;
    }
  };
  const demoAction = () => {
    setNotice(
      "Đây là dữ liệu demo chỉ xem. Đăng nhập để thực hiện thao tác thật.",
    );
    onLogin();
  };
  const openDispatch = (ride: Ride) => {
    if (demo) {
      demoAction();
      return;
    }
    if (
      !["pending", "offered", "accepted", "arriving", "met"].includes(
        ride.status,
      )
    ) {
      setNotice(
        "Chỉ có thể điều phối cuốc đang chờ hoặc đang được xử lý đến trạng thái đã gặp khách.",
      );
      return;
    }
    setDispatchRide(ride);
    setSelectedDrivers([]);
  };
  const suggestDrivers = () => {
    if (!dispatchRide) return;
    const suggested = [...eligibleDrivers]
      .sort(
        (a, b) =>
          Number(b.zone === dispatchRide.zone) -
            Number(a.zone === dispatchRide.zone) ||
          b.rating - a.rating ||
          b.trips - a.trips,
      )
      .slice(0, 3);
    setSelectedDrivers(suggested.map((driver) => driver.id));
    setNotice(
      suggested.length
        ? `Đã chọn ${suggested.length} tài xế ưu tiên cùng khu vực, theo điểm đánh giá.`
        : "Không có tài xế đã xác minh và đang online phù hợp.",
    );
  };
  const submitDispatch = async () => {
    if (!dispatchRide || dispatch.isPending) return;
    if (!selectedDrivers.length) {
      setNotice("Chọn ít nhất một tài xế đã xác minh và đang online.");
      return;
    }
    if (
      await action(
        () =>
          dispatch.mutateAsync({
            rideId: dispatchRide.id,
            driverIds: selectedDrivers,
          }),
        `Đã đẩy cuốc #${dispatchRide.code} đến ${selectedDrivers.length} tài xế.`,
      )
    )
      setDispatchRide(null);
  };
  const submitDecision = async () => {
    if (!verifyDriver || verify.isPending) return;
    if (decision !== "verified" && !reason.trim()) {
      setNotice("Vui lòng nhập lý do khi từ chối hoặc tạm khóa tài xế.");
      return;
    }
    if (
      await action(
        () =>
          verify.mutateAsync({
            driverId: verifyDriver.id,
            verification: decision,
            reason: reason.trim(),
          }),
        `Đã cập nhật hồ sơ ${verifyDriver.name}.`,
      )
    ) {
      setVerifyDriver(null);
      setReason("");
    }
  };
  const submitPricing = async () => {
    setPriceError("");
    const numbers: Pricing = {
      baseFare: Number(priceForm.baseFare),
      perKm: Number(priceForm.perKm),
      minFare: Number(priceForm.minFare),
      nightFee: Number(priceForm.nightFee),
      peakFee: Number(priceForm.peakFee),
      commissionPercent: Number(priceForm.commissionPercent),
    };
    if (
      Object.values(numbers).some(
        (value) => !Number.isFinite(value) || value < 0,
      ) ||
      numbers.commissionPercent > 100 ||
      numbers.minFare <= 0
    ) {
      setPriceError(
        "Nhập số hợp lệ; giá sàn phải lớn hơn 0 và hoa hồng nằm trong 0–100%.",
      );
      return;
    }
    if (demo) {
      demoAction();
      return;
    }
    if (
      !updatePricing.isPending &&
      (await action(
        () => updatePricing.mutateAsync(numbers),
        "Đã cập nhật bảng giá. Báo giá mới sẽ dùng quy tắc này.",
      ))
    )
      setPriceOverride(null);
  };
  const toggleDriver = (driver: Driver) => {
    if (demo) {
      demoAction();
      return;
    }
    if (!setAvailability.isPending)
      action(
        () =>
          setAvailability.mutateAsync({
            driverId: driver.id,
            available: !driver.available,
          }),
        `Đã ${driver.available ? "tắt" : "bật"} trạng thái nhận cuốc của ${driver.name}.`,
      );
  };
  const requestCancel = (ride: Ride) => {
    if (demo) {
      demoAction();
      return;
    }
    if (["completed", "cancelled", "in_progress"].includes(ride.status)) {
      setNotice("Cuốc này không thể hủy ở trạng thái hiện tại.");
      return;
    }
    setCancelRideTarget(ride);
  };
  const confirmCancel = async () => {
    if (!cancelRideTarget || cancel.isPending) return;
    if (
      await action(
        () => cancel.mutateAsync({ rideId: cancelRideTarget.id }),
        `Đã hủy cuốc #${cancelRideTarget.code}.`,
      )
    )
      setCancelRideTarget(null);
  };

  if (!data) return <LoginRequired onLogin={onLogin} />;
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          compact && styles.containerCompact,
        ]}
      >
        <View style={styles.maxWidth}>
          {demo ? <DemoNotice onLogin={onLogin} /> : null}
          {notice ? (
            <Notice
              text={notice}
              tone={
                notice.includes("không") ||
                notice.includes("demo") ||
                notice.includes("Chỉ")
                  ? "amber"
                  : "green"
              }
            />
          ) : null}
          {tab === "rides" ? (
            <RidesView
              rides={filteredRides}
              filter={rideFilter}
              search={rideSearch}
              compact={compact}
              onSearch={setRideSearch}
              onFilter={setRideFilter}
              onDispatch={openDispatch}
              onOpen={setSelectedRide}
              onCancel={requestCancel}
            />
          ) : tab === "drivers" ? (
            <DriversView
              drivers={drivers}
              pending={pendingDrivers}
              compact={compact}
              busy={setAvailability.isPending}
              onToggle={toggleDriver}
              onReview={(driver) => {
                if (demo) {
                  demoAction();
                  return;
                }
                setVerifyDriver(driver);
                setDecision("verified");
                setReason("");
              }}
            />
          ) : tab === "pricing" ? (
            <PricingView
              form={priceForm}
              setForm={setPriceOverride}
              error={priceError}
              demo={demo}
              saving={updatePricing.isPending}
              onLogin={onLogin}
              onSave={submitPricing}
            />
          ) : tab === "activity" ? (
            <ActivityView events={events} />
          ) : (
            <Overview
              stats={stats}
              todayRides={todayRides}
              compact={compact}
              onOpen={setSelectedRide}
              onDispatch={openDispatch}
            />
          )}
        </View>
      </ScrollView>
      <Modal
        visible={Boolean(dispatchRide)}
        transparent
        animationType="fade"
        onRequestClose={() => setDispatchRide(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <ScrollView
              style={styles.dialogScroll}
              contentContainerStyle={styles.dialogScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <DialogHeader
                title="Đẩy cuốc đến tài xế"
                onClose={() => setDispatchRide(null)}
              />
              {dispatchRide ? (
                <>
                  <Text style={styles.dialogSub}>
                    #{dispatchRide.code} · {dispatchRide.zone}
                  </Text>
                  <RouteLine
                    pickup={dispatchRide.pickup}
                    dropoff={dispatchRide.dropoff}
                  />
                  {dispatchRide.driverId ? (
                    <Notice
                      text="Đây là điều phối lại. Tài xế cũ chỉ được giải phóng khi bạn bấm xác nhận gửi offer; chưa có thay đổi nào được thực hiện."
                      tone="amber"
                    />
                  ) : (
                    <Notice
                      text="Offer expiry được backend quyết định theo quy tắc vận hành; sau khi gửi, theo dõi thời hạn trong lịch sử offer."
                      tone="blue"
                    />
                  )}
                  <View style={styles.suggestionRow}>
                    <Text style={styles.dialogLabel}>
                      Tài xế đủ điều kiện ({eligibleDrivers.length})
                    </Text>
                    <Button
                      title="Đề xuất theo khu vực"
                      variant="secondary"
                      onPress={suggestDrivers}
                      disabled={!eligibleDrivers.length || dispatch.isPending}
                    />
                  </View>
                  {eligibleDrivers.length ? (
                    eligibleDrivers.map((driver) => (
                      <SelectDriver
                        key={driver.id}
                        driver={driver}
                        selected={selectedDrivers.includes(driver.id)}
                        onPress={() =>
                          setSelectedDrivers((current) =>
                            current.includes(driver.id)
                              ? current.filter((id) => id !== driver.id)
                              : [...current, driver.id],
                          )
                        }
                      />
                    ))
                  ) : (
                    <Empty
                      title="Không có tài xế phù hợp"
                      subtitle="Cần hồ sơ đã xác minh, online và không đang chạy cuốc khác."
                    />
                  )}
                  <View style={styles.dialogActions}>
                    <Button
                      title="Đóng"
                      variant="secondary"
                      onPress={() => setDispatchRide(null)}
                    />
                    <Button
                      title="Gửi offer"
                      loading={dispatch.isPending}
                      onPress={submitDispatch}
                      disabled={!selectedDrivers.length || dispatch.isPending}
                      icon="send"
                    />
                  </View>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        visible={Boolean(verifyDriver)}
        transparent
        animationType="slide"
        onRequestClose={() => setVerifyDriver(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <ScrollView
              style={styles.dialogScroll}
              contentContainerStyle={styles.dialogScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <DialogHeader
                title="Xem hồ sơ tài xế"
                onClose={() => setVerifyDriver(null)}
              />
              {verifyDriver ? (
                <>
                  <View style={styles.profileHeader}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {verifyDriver.name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dialogTitle}>
                        {verifyDriver.name}
                      </Text>
                      <Text style={styles.muted}>
                        {verifyDriver.phone} · {verifyDriver.zone}
                      </Text>
                    </View>
                    <Pill
                      label={VERIFICATION_LABELS[verifyDriver.verification]}
                      tone={verificationTone(verifyDriver.verification)}
                    />
                  </View>
                  <View style={styles.credentialGrid}>
                    <Credential
                      label="Kinh nghiệm"
                      value={`${verifyDriver.experience} năm`}
                    />
                    <Credential
                      label="Bằng lái"
                      value={verifyDriver.licenseNumber}
                    />
                    <Credential
                      label="Thông tin xe/biển số"
                      value={verifyDriver.vehiclePlate}
                    />
                    <Credential
                      label="Ghi chú giấy tờ"
                      value={verifyDriver.documentNote}
                    />
                    <Credential
                      label="Đánh giá / cuốc"
                      value={`${verifyDriver.rating > 0 ? verifyDriver.rating.toFixed(1) : "Chưa có"} · ${verifyDriver.trips}`}
                    />
                  </View>
                  <Notice
                    text="Chưa có upload tài liệu hoặc eKYC. Đây là metadata do tài xế khai báo để Admin kiểm tra thủ công."
                    tone="blue"
                  />
                  <Text style={styles.dialogLabel}>Quyết định</Text>
                  <View style={styles.choiceRow}>
                    {(
                      ["verified", "rejected", "suspended"] as DriverDecision[]
                    ).map((value) => (
                      <Pressable
                        key={value}
                        onPress={() => setDecision(value)}
                        style={[
                          styles.choice,
                          decision === value && styles.choiceActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.choiceText,
                            decision === value && styles.choiceTextActive,
                          ]}
                        >
                          {value === "verified"
                            ? "Duyệt"
                            : value === "rejected"
                              ? "Từ chối"
                              : "Tạm khóa"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {decision !== "verified" ? (
                    <Field
                      label="Lý do bắt buộc *"
                      value={reason}
                      onChangeText={setReason}
                      placeholder="Nêu rõ thông tin cần bổ sung hoặc lý do khóa"
                      multiline
                    />
                  ) : (
                    <Field
                      label="Ghi chú xét duyệt (không bắt buộc)"
                      value={reason}
                      onChangeText={setReason}
                      placeholder="Ghi chú nội bộ"
                      multiline
                    />
                  )}
                  <View style={styles.dialogActions}>
                    <Button
                      title="Hủy"
                      variant="secondary"
                      onPress={() => setVerifyDriver(null)}
                    />
                    <Button
                      title="Lưu quyết định"
                      loading={verify.isPending}
                      onPress={submitDecision}
                      disabled={verify.isPending}
                      icon="checkmark"
                    />
                  </View>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        visible={Boolean(selectedRide)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedRide(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.detailModal}>
            <DialogHeader
              title="Chi tiết cuốc"
              onClose={() => setSelectedRide(null)}
            />
            {selectedRide ? (
              <RideDetail
                ride={
                  data.rides.find((ride) => ride.id === selectedRide.id) ??
                  selectedRide
                }
                events={events}
                offers={data.offers}
                demo={demo}
              />
            ) : null}
          </View>
        </View>
      </Modal>
      <Modal
        visible={Boolean(cancelRideTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!cancel.isPending) setCancelRideTarget(null);
        }}
      >
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <ScrollView
              style={styles.dialogScroll}
              contentContainerStyle={styles.dialogScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <DialogHeader
                title="Xác nhận hủy cuốc"
                onClose={() => {
                  if (!cancel.isPending) setCancelRideTarget(null);
                }}
              />
              {cancelRideTarget ? (
                <>
                  <Text style={styles.dialogSub}>
                    Bạn chắc chắn muốn hủy cuốc #{cancelRideTarget.code}?
                  </Text>
                  <RouteLine
                    pickup={cancelRideTarget.pickup}
                    dropoff={cancelRideTarget.dropoff}
                  />
                  <Notice
                    text="Hành động này sẽ hủy các offer đang chờ. Không thể hoàn tác sau khi backend xác nhận."
                    tone="amber"
                  />
                  <View style={styles.dialogActions}>
                    <Button
                      title="Quay lại"
                      variant="secondary"
                      onPress={() => setCancelRideTarget(null)}
                      disabled={cancel.isPending}
                    />
                    <Button
                      title="Xác nhận hủy"
                      variant="danger"
                      loading={cancel.isPending}
                      onPress={confirmCancel}
                      disabled={cancel.isPending}
                      icon="close"
                    />
                  </View>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Overview({
  stats,
  todayRides,
  compact,
  onOpen,
  onDispatch,
}: {
  stats: {
    rides: number;
    waiting: number;
    running: number;
    online: number;
    income: number;
  };
  todayRides: Ride[];
  compact: boolean;
  onOpen: (ride: Ride) => void;
  onDispatch: (ride: Ride) => void;
}) {
  return (
    <View style={styles.stack}>
      <View>
        <Text style={styles.eyebrow}>ĐIỀU HÀNH HÔM NAY</Text>
        <Text style={styles.pageTitle}>Tổng quan vận hành</Text>
        <Text style={styles.muted}>
          Số liệu theo Asia/Ho_Chi_Minh · chỉ từ snapshot hiện tại
        </Text>
      </View>
      <View style={compact ? styles.statStack : styles.statRow}>
        <AdminStat
          icon="calendar"
          value={String(stats.rides)}
          label="Cuốc hôm nay"
        />
        <AdminStat
          icon="time"
          value={String(stats.waiting)}
          label="Đang chờ điều phối"
        />
        <AdminStat
          icon="navigate"
          value={String(stats.running)}
          label="Đang chạy"
        />
        <AdminStat
          icon="people"
          value={String(stats.online)}
          label="Tài xế online / đã duyệt"
        />
        <AdminStat
          icon="wallet"
          value={formatMoney(stats.income)}
          label="Doanh thu ước tính cuốc hoàn tất"
        />
      </View>
      <SectionTitle
        title="Luồng cuốc hôm nay"
        subtitle="Ưu tiên cuốc cần được xử lý trước"
      />
      {todayRides.length ? (
        todayRides
          .slice(0, 8)
          .map((ride) => (
            <AdminRideRow
              key={ride.id}
              ride={ride}
              compact={compact}
              onOpen={() => onOpen(ride)}
              onDispatch={() => onDispatch(ride)}
            />
          ))
      ) : (
        <Empty
          title="Chưa có cuốc hôm nay"
          subtitle="Khi khách đặt cuốc, danh sách vận hành sẽ xuất hiện ở đây."
        />
      )}
    </View>
  );
}
function AdminStat({
  icon,
  value,
  label,
}: {
  icon: any;
  value: string;
  label: string;
}) {
  return (
    <Card style={styles.adminStat}>
      <Icon name={icon} size={18} color={COLORS.primary} />
      <Text style={styles.adminStatValue}>{value}</Text>
      <Text style={styles.adminStatLabel}>{label}</Text>
    </Card>
  );
}

function RidesView({
  rides,
  filter,
  search,
  compact,
  onSearch,
  onFilter,
  onDispatch,
  onOpen,
  onCancel,
}: {
  rides: Ride[];
  filter: "all" | Ride["status"];
  search: string;
  compact: boolean;
  onSearch: (value: string) => void;
  onFilter: (value: "all" | Ride["status"]) => void;
  onDispatch: (ride: Ride) => void;
  onOpen: (ride: Ride) => void;
  onCancel: (ride: Ride) => void;
}) {
  const filters: ("all" | Ride["status"])[] = [
    "all",
    "pending",
    "offered",
    "accepted",
    "arriving",
    "met",
    "in_progress",
    "completed",
    "cancelled",
  ];
  const query = search.trim().toLocaleLowerCase("vi");
  const visibleRides = rides.filter(
    (ride) =>
      !query ||
      [ride.code, ride.customerName, ride.phone].some((value) =>
        value.toLocaleLowerCase("vi").includes(query),
      ),
  );
  return (
    <View style={styles.stack}>
      <SectionTitle
        title="Quản lý cuốc"
        subtitle="Lọc trạng thái, tìm theo mã/khách/số điện thoại và mở timeline."
      />
      <Field
        label="Tìm cuốc"
        value={search}
        onChangeText={onSearch}
        placeholder="Mã cuốc, tên khách hoặc số điện thoại"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {filters.map((value) => (
          <Pressable
            key={value}
            onPress={() => onFilter(value)}
            style={[styles.filter, filter === value && styles.filterActive]}
          >
            <Text
              style={[
                styles.filterText,
                filter === value && styles.filterTextActive,
              ]}
            >
              {value === "all" ? "Tất cả" : STATUS_LABELS[value]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {visibleRides.length ? (
        visibleRides.map((ride) => (
          <AdminRideRow
            key={ride.id}
            ride={ride}
            compact={compact}
            onOpen={() => onOpen(ride)}
            onDispatch={() => onDispatch(ride)}
            onCancel={() => onCancel(ride)}
          />
        ))
      ) : (
        <Empty
          title="Không có cuốc phù hợp"
          subtitle="Thử từ khóa hoặc bộ lọc khác để xem thêm dữ liệu."
        />
      )}
    </View>
  );
}
function AdminRideRow({
  ride,
  compact,
  onOpen,
  onDispatch,
  onCancel,
}: {
  ride: Ride;
  compact: boolean;
  onOpen: () => void;
  onDispatch: () => void;
  onCancel?: () => void;
}) {
  return (
    <Card style={styles.rideCard}>
      <View style={styles.rideMain}>
        <View style={{ flex: 1 }}>
          <View style={styles.inline}>
            <Text style={styles.rideCode}>#{ride.code}</Text>
            <Pill
              label={STATUS_LABELS[ride.status]}
              tone={statusTone(ride.status)}
            />
          </View>
          <RouteLine pickup={ride.pickup} dropoff={ride.dropoff} />
          <Text style={styles.muted}>
            {formatDate(ride.scheduledAt)} · {ride.customerName} ·{" "}
            {ride.driverName || "Chưa gán tài xế"}
          </Text>
        </View>
        <View style={styles.ridePrice}>
          <Text style={styles.price}>{formatMoney(ride.price)}</Text>
          <Text style={styles.muted}>{ride.distanceKm} km</Text>
        </View>
      </View>
      <View style={[styles.rowActions, compact && styles.rowActionsCompact]}>
        <Button
          title="Chi tiết"
          variant="secondary"
          onPress={onOpen}
          icon="chevron-forward"
        />
        {["pending", "offered", "accepted", "arriving", "met"].includes(
          ride.status,
        ) ? (
          <Button
            title={
              ["accepted", "arriving", "met"].includes(ride.status)
                ? "Điều phối lại"
                : "Đẩy cuốc"
            }
            onPress={onDispatch}
            icon="send"
          />
        ) : null}
        {onCancel &&
        !["completed", "cancelled", "in_progress"].includes(ride.status) ? (
          <Button
            title="Hủy cuốc"
            variant="danger"
            onPress={onCancel}
            icon="close"
          />
        ) : null}
      </View>
    </Card>
  );
}

function DriversView({
  drivers,
  pending,
  compact,
  busy,
  onToggle,
  onReview,
}: {
  drivers: Driver[];
  pending: Driver[];
  compact: boolean;
  busy: boolean;
  onToggle: (driver: Driver) => void;
  onReview: (driver: Driver) => void;
}) {
  const [search, setSearch] = useState("");
  const [verification, setVerification] = useState<
    "all" | Driver["verification"]
  >("all");
  const query = search.trim().toLocaleLowerCase("vi");
  const visible = drivers.filter(
    (driver) =>
      (verification === "all" || driver.verification === verification) &&
      (!query ||
        `${driver.name} ${driver.zone}`
          .toLocaleLowerCase("vi")
          .includes(query)),
  );
  const visiblePending = visible.filter(
    (driver) => driver.verification === "pending",
  );
  return (
    <View style={styles.stack}>
      <SectionTitle
        title="Quản lý tài xế"
        subtitle={`${drivers.length} hồ sơ · ${pending.length} chờ Admin xét duyệt`}
      />
      <Field
        label="Tìm tài xế"
        value={search}
        onChangeText={setSearch}
        placeholder="Tên hoặc khu vực hoạt động"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {(["all", "pending", "verified", "rejected", "suspended"] as const).map(
          (value) => (
            <Pressable
              key={value}
              onPress={() => setVerification(value)}
              style={[
                styles.filter,
                verification === value && styles.filterActive,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  verification === value && styles.filterTextActive,
                ]}
              >
                {value === "all" ? "Tất cả" : VERIFICATION_LABELS[value]}
              </Text>
            </Pressable>
          ),
        )}
      </ScrollView>
      {visiblePending.length ? (
        <Card style={styles.queueCard}>
          <View style={styles.inline}>
            <Icon name="shield-checkmark" size={18} color={COLORS.amber} />
            <Text style={styles.queueTitle}>Hàng chờ xác minh</Text>
            <Pill label={`${visiblePending.length}`} tone="amber" />
          </View>
          {visiblePending.map((driver) => (
            <DriverRow
              key={driver.id}
              driver={driver}
              compact={compact}
              busy={busy}
              onToggle={onToggle}
              onReview={onReview}
            />
          ))}
        </Card>
      ) : null}
      <SectionTitle title="Tất cả tài xế" />
      {visible.length ? (
        visible.map((driver) => (
          <DriverRow
            key={driver.id}
            driver={driver}
            compact={compact}
            busy={busy}
            onToggle={onToggle}
            onReview={onReview}
          />
        ))
      ) : (
        <Empty title="Chưa có hồ sơ phù hợp" />
      )}
    </View>
  );
}
function DriverRow({
  driver,
  compact,
  busy,
  onToggle,
  onReview,
}: {
  driver: Driver;
  compact: boolean;
  busy: boolean;
  onToggle: (driver: Driver) => void;
  onReview: (driver: Driver) => void;
}) {
  return (
    <View style={[styles.driverRow, compact && styles.driverRowCompact]}>
      <View style={styles.avatarSmall}>
        <Text style={styles.avatarTextSmall}>
          {driver.name.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View style={styles.driverIdentity}>
        <Text style={styles.bodyStrong}>{driver.name}</Text>
        <Text style={styles.muted}>
          {driver.zone} · {driver.vehiclePlate} · {driver.trips} cuốc
        </Text>
      </View>
      <Pill
        label={VERIFICATION_LABELS[driver.verification]}
        tone={verificationTone(driver.verification)}
      />
      <Pressable
        disabled={busy}
        onPress={() => onToggle(driver)}
        style={[
          styles.availability,
          driver.available && styles.available,
          busy && styles.disabled,
        ]}
      >
        <View
          style={[
            styles.availabilityDot,
            driver.available && styles.availableDot,
          ]}
        />
        <Text style={styles.availabilityText}>
          {driver.available ? "Online" : "Offline"}
        </Text>
      </Pressable>
      <Button
        title={compact ? "Xem" : "Xem hồ sơ"}
        variant="secondary"
        onPress={() => onReview(driver)}
      />
    </View>
  );
}

function PricingView({
  form,
  setForm,
  error,
  demo,
  saving,
  onLogin,
  onSave,
}: {
  form: PriceForm;
  setForm: (next: PriceForm) => void;
  error: string;
  demo: boolean;
  saving: boolean;
  onLogin: () => void;
  onSave: () => void;
}) {
  const field = (key: keyof Pricing, label: string, suffix = "đ") => (
    <Field
      label={`${label} (${suffix})`}
      value={form[key]}
      keyboardType="numeric"
      onChangeText={(value) => setForm({ ...form, [key]: value })}
    />
  );
  return (
    <View style={styles.stack}>
      <SectionTitle
        title="Bảng giá"
        subtitle="Giá áp dụng cho báo giá mới; dữ liệu hiện tại từ snapshot."
      />
      {error ? <Notice text={error} tone="red" /> : null}
      <Card>
        {field("baseFare", "Phí mở cuốc")}
        {field("perKm", "Đơn giá / km")}
        {field("minFare", "Giá sàn")}
        {field("nightFee", "Phụ phí ban đêm")}
        {field("peakFee", "Phụ phí cao điểm")}
        {field("commissionPercent", "Hoa hồng", "%")}
        <Text style={styles.formHint}>
          Không tự động thay đổi giá các cuốc đã tạo. Thu nhập tài xế thực tế
          chỉ ghi nhận ở ride completed.
        </Text>
        <Button
          title={demo ? "Đăng nhập để lưu bảng giá" : "Lưu bảng giá"}
          loading={saving}
          disabled={saving}
          onPress={demo ? onLogin : onSave}
          icon="checkmark"
        />
      </Card>
    </View>
  );
}
function ActivityView({ events }: { events: Workspace["events"] }) {
  const sorted = [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return (
    <View style={styles.stack}>
      <SectionTitle
        title="Nhật ký vận hành"
        subtitle="Lịch sử thay đổi nhạy cảm từ snapshot hiện tại."
      />
      {sorted.length ? (
        <Card>
          {sorted.map((event) => (
            <View key={event.id} style={styles.activityRow}>
              <View style={styles.activityDot}>
                <Icon name="pulse" size={15} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bodyStrong}>{event.message}</Text>
                <Text style={styles.muted}>
                  {event.actorName} · {formatDate(event.createdAt)}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      ) : (
        <Empty
          title="Chưa có nhật ký"
          subtitle="Các thay đổi điều phối và xác minh sẽ hiển thị ở đây."
        />
      )}
    </View>
  );
}
function DialogHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <View style={styles.dialogHeader}>
      <Text style={styles.dialogTitle}>{title}</Text>
      <Pressable onPress={onClose}>
        <Icon name="close" size={22} color={COLORS.ink} />
      </Pressable>
    </View>
  );
}
function SelectDriver({
  driver,
  selected,
  onPress,
}: {
  driver: Driver;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.selectDriver, selected && styles.selectDriverActive]}
    >
      <View style={[styles.checkbox, selected && styles.checkboxActive]}>
        {selected ? <Icon name="checkmark" size={14} color="#fff" /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.bodyStrong}>{driver.name}</Text>
        <Text style={styles.muted}>
          {driver.zone} ·{" "}
          {driver.rating > 0
            ? `${driver.rating.toFixed(1)} sao`
            : "Chưa có đánh giá"}{" "}
          · {driver.vehiclePlate}
        </Text>
      </View>
      <Pill label="Đã duyệt" tone="green" />
    </Pressable>
  );
}
function Credential({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.credential}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.bodyStrong}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  container: { padding: 24, paddingBottom: 56 },
  containerCompact: { padding: 16 },
  maxWidth: { width: "100%", maxWidth: 1240, alignSelf: "center" },
  stack: { gap: 16 },
  eyebrow: {
    color: COLORS.muted,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "800",
  },
  pageTitle: {
    color: COLORS.ink,
    fontSize: 28,
    fontWeight: "800",
    marginTop: 5,
  },
  muted: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  statRow: { flexDirection: "row", gap: 10 },
  statStack: { gap: 10 },
  adminStat: { flex: 1, minHeight: 112, gap: 7 },
  adminStatValue: {
    color: COLORS.ink,
    fontSize: 21,
    fontWeight: "800",
    marginTop: 2,
  },
  adminStatLabel: { color: COLORS.muted, fontSize: 11, lineHeight: 16 },
  demoBanner: {
    minHeight: 42,
    paddingHorizontal: 13,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#BEE8DF",
    backgroundColor: "#EFFAF7",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  demoText: { flex: 1, color: COLORS.ink, fontSize: 12, fontWeight: "700" },
  loginLink: { color: COLORS.primary, fontSize: 12, fontWeight: "800" },
  filterRow: { gap: 8, paddingBottom: 2 },
  filter: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: "#F2F6F4",
  },
  filterActive: { backgroundColor: COLORS.primary },
  filterText: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  filterTextActive: { color: "#fff" },
  rideCard: { gap: 12 },
  rideMain: { flexDirection: "row", gap: 18 },
  rideCode: { color: COLORS.ink, fontSize: 15, fontWeight: "800" },
  inline: { flexDirection: "row", alignItems: "center", gap: 8 },
  ridePrice: { alignItems: "flex-end", minWidth: 90 },
  price: { color: COLORS.primary, fontSize: 15, fontWeight: "800" },
  rowActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
  },
  rowActionsCompact: { justifyContent: "flex-start", flexWrap: "wrap" },
  queueCard: { borderColor: "#F0DDAA", backgroundColor: "#FFFDF7" },
  queueTitle: { color: COLORS.ink, fontSize: 15, fontWeight: "800", flex: 1 },
  driverRow: {
    minHeight: 68,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  driverRowCompact: { flexWrap: "wrap" },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "#DDF3EE",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: COLORS.primary, fontSize: 19, fontWeight: "800" },
  avatarSmall: {
    width: 35,
    height: 35,
    borderRadius: 12,
    backgroundColor: "#EAF5EE",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTextSmall: { color: COLORS.primary, fontSize: 15, fontWeight: "800" },
  driverIdentity: { flex: 1, minWidth: 150 },
  bodyStrong: { color: COLORS.ink, fontSize: 13, fontWeight: "700" },
  availability: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 9,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  available: { borderColor: "#B8E4DA", backgroundColor: "#F0FAF7" },
  availabilityDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.muted,
  },
  availableDot: { backgroundColor: COLORS.primary },
  availabilityText: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: "rgba(20,44,42,0.35)",
    justifyContent: "center",
    padding: 18,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(20,44,42,0.35)",
    justifyContent: "center",
    padding: 18,
  },
  dialog: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    maxWidth: 620,
    width: "100%",
    maxHeight: "92%",
    alignSelf: "center",
    gap: 13,
  },
  dialogScroll: { maxHeight: "100%" },
  dialogScrollContent: { gap: 13, paddingBottom: 2 },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  disabled: { opacity: 0.55 },
  detailModal: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    maxWidth: 700,
    width: "100%",
    maxHeight: "92%",
    alignSelf: "center",
  },
  dialogHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dialogTitle: { color: COLORS.ink, fontSize: 19, fontWeight: "800" },
  dialogSub: { color: COLORS.muted, fontSize: 13 },
  dialogLabel: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },
  dialogActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 9,
    flexWrap: "wrap",
    marginTop: 5,
  },
  selectDriver: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selectDriverActive: {
    borderColor: COLORS.primary,
    backgroundColor: "#F0FAF7",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#B3C7BE",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  profileHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  credentialGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 13,
  },
  credential: { minWidth: 115, flexGrow: 1 },
  choiceRow: { flexDirection: "row", gap: 8 },
  choice: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 9,
    padding: 10,
    alignItems: "center",
  },
  choiceActive: { borderColor: COLORS.primary, backgroundColor: "#EFFAF7" },
  choiceText: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  choiceTextActive: { color: COLORS.primary },
  formHint: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  activityRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  activityDot: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "#EFFAF7",
    alignItems: "center",
    justifyContent: "center",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
    backgroundColor: "#fff",
  },
  loginMark: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: "#E5F5F1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  loginTitle: {
    color: COLORS.ink,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  loginCopy: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    maxWidth: 400,
    marginVertical: 9,
  },
});
