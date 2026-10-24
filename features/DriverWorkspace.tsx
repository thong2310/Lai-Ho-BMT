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
  formatDate,
  formatMoney,
  NEXT_STATUS,
  STATUS_LABELS,
  type Driver,
  type Offer,
  type Ride,
  type Workspace,
  VERIFICATION_LABELS,
  VEHICLES,
} from "@/shared/domain";
import { trpc } from "@/lib/trpc";
import { RideDetail } from "./RideDetail";

type Props = {
  data: Workspace | null;
  demo: boolean;
  onLogin: () => void;
  tab: string;
};

type FormState = {
  name: string;
  phone: string;
  zone: string;
  experience: string;
  licenseNumber: string;
  documentNote: string;
  vehiclePlate: string;
};

const emptyForm: FormState = {
  name: "",
  phone: "",
  zone: "",
  experience: "",
  licenseNumber: "",
  documentNote: "",
  vehiclePlate: "",
};

const messageFor = (error: unknown, fallback: string) =>
  error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message || fallback)
    : fallback;

const verificationTone = (
  value: Driver["verification"],
): "green" | "amber" | "red" | "gray" => {
  if (value === "verified") return "green";
  if (value === "rejected" || value === "suspended") return "red";
  if (value === "pending") return "amber";
  return "gray";
};

const statusTone = (
  status: Ride["status"],
): "green" | "amber" | "blue" | "red" | "gray" => {
  if (status === "completed") return "green";
  if (status === "cancelled") return "red";
  if (status === "pending" || status === "offered") return "amber";
  if (
    status === "accepted" ||
    status === "arriving" ||
    status === "met" ||
    status === "in_progress"
  )
    return "blue";
  return "gray";
};

function LoginRequired({ onLogin }: { onLogin: () => void }) {
  return (
    <View style={styles.centered}>
      <View style={styles.loginMark}>
        <Icon name="car-sport" size={30} color={COLORS.primary} />
      </View>
      <Text style={styles.loginTitle}>Không gian tài xế</Text>
      <Text style={styles.loginCopy}>
        Đăng nhập để xem hồ sơ, cuốc chờ và thu nhập của bạn.
      </Text>
      <Button
        title="Đăng nhập với Manus"
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
        Dữ liệu demo · Chỉ xem. Đăng nhập để thao tác thật.
      </Text>
      <Icon name="arrow-forward" size={15} color={COLORS.primary} />
    </Pressable>
  );
}

function DriverHeader({
  driver,
  available,
  onToggle,
  disabled,
}: {
  driver: Driver;
  available: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {driver.name.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View style={styles.headerIdentity}>
        <Text style={styles.eyebrow}>XIN CHÀO, TÀI XẾ</Text>
        <Text style={styles.title}>{driver.name}</Text>
        <View style={styles.inline}>
          <Pill
            label={VERIFICATION_LABELS[driver.verification]}
            tone={verificationTone(driver.verification)}
          />
          <Text style={styles.dot}>·</Text>
          <Text style={styles.muted}>{driver.zone}</Text>
        </View>
      </View>
      <Pressable
        disabled={disabled}
        onPress={onToggle}
        accessibilityRole="switch"
        accessibilityState={{ checked: available }}
        style={[
          styles.onlineToggle,
          available && styles.onlineToggleOn,
          disabled && styles.disabled,
        ]}
      >
        <View style={[styles.toggleDot, available && styles.toggleDotOn]} />
        <Text style={[styles.toggleText, available && styles.toggleTextOn]}>
          {available ? "Đang online" : "Tạm nghỉ"}
        </Text>
      </Pressable>
    </View>
  );
}

function OfferCard({
  offer,
  onAccept,
  onReject,
  onOpen,
  busy,
}: {
  offer: Offer;
  onAccept: () => void;
  onReject: () => void;
  onOpen: () => void;
  busy?: boolean;
}) {
  const [now] = useState(Date.now);
  const expired = new Date(offer.expiresAt).getTime() <= now;
  return (
    <Card style={styles.offerCard}>
      <View style={styles.cardTopline}>
        <View>
          <Text style={styles.rideCode}>#{offer.ride.code}</Text>
          <Text style={styles.smallMuted}>
            {formatDate(offer.ride.scheduledAt)} · {offer.ride.zone}
          </Text>
        </View>
        <Pill
          label={expired ? "Đã hết hạn" : "Đang chờ nhận"}
          tone={expired ? "gray" : "amber"}
        />
      </View>
      <RouteLine pickup={offer.ride.pickup} dropoff={offer.ride.dropoff} />
      <View style={styles.offerMeta}>
        <Text style={styles.metaLabel}>Thu nhập dự kiến</Text>
        <Text style={styles.earning}>
          {formatMoney(offer.ride.driverIncome)}
        </Text>
        <Text style={styles.metaValue}>
          {offer.ride.distanceKm} km · {VEHICLES[offer.ride.vehicleType]}
        </Text>
      </View>
      {expired ? (
        <Text style={styles.warning}>Offer đã hết thời hạn phản hồi.</Text>
      ) : (
        <View style={styles.actionRow}>
          <Button
            title="Từ chối"
            variant="secondary"
            loading={busy}
            disabled={busy}
            onPress={onReject}
          />
          <Button
            title="Nhận cuốc"
            loading={busy}
            disabled={busy}
            onPress={onAccept}
            icon="checkmark"
          />
        </View>
      )}
      <Pressable onPress={onOpen} style={styles.detailLink}>
        <Text style={styles.detailLinkText}>Xem chi tiết cuốc</Text>
        <Icon name="chevron-forward" size={15} color={COLORS.primary} />
      </Pressable>
    </Card>
  );
}

function ProfileView({
  driver,
  onRegister,
  onLogin,
  demo,
  submitting,
}: {
  driver: Driver | null;
  onRegister: (input: FormState) => Promise<void>;
  onLogin: () => void;
  demo: boolean;
  submitting: boolean;
}) {
  const [form, setForm] = useState<FormState>(() =>
    driver
      ? {
          name: driver.name,
          phone: driver.phone,
          zone: driver.zone,
          experience: String(driver.experience),
          licenseNumber: driver.licenseNumber,
          documentNote: driver.documentNote,
          vehiclePlate: driver.vehiclePlate,
        }
      : emptyForm,
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const set = (key: keyof FormState, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    setError("");
    setSuccess("");
    if (
      !form.name.trim() ||
      !form.phone.trim() ||
      !form.zone.trim() ||
      !form.licenseNumber.trim() ||
      !form.vehiclePlate.trim() ||
      !form.documentNote.trim()
    ) {
      setError(
        "Vui lòng điền họ tên, số điện thoại, khu vực, bằng lái, thông tin xe/biển số và ghi chú giấy tờ.",
      );
      return;
    }
    const experience = Number(form.experience);
    if (!Number.isInteger(experience) || experience < 0) {
      setError("Kinh nghiệm phải là số năm hợp lệ.");
      return;
    }
    if (demo) {
      onLogin();
      return;
    }
    try {
      await onRegister(form);
      setSuccess("Hồ sơ đã được gửi. Admin sẽ xem xét thông tin bạn khai báo.");
    } catch (caught) {
      setError(messageFor(caught, "Không thể gửi hồ sơ lúc này."));
    }
  };
  if (driver && !["pending", "rejected"].includes(driver.verification))
    return (
      <View style={styles.stack}>
        <Card>
          <SectionTitle
            title="Hồ sơ tài xế"
            subtitle="Thông tin đang được dùng để xét điều kiện nhận cuốc."
          />
          <View style={styles.profileGrid}>
            <ProfileItem label="Họ và tên" value={driver.name} />
            <ProfileItem label="Số điện thoại" value={driver.phone} />
            <ProfileItem label="Khu vực" value={driver.zone} />
            <ProfileItem
              label="Kinh nghiệm"
              value={`${driver.experience} năm`}
            />
            <ProfileItem label="Bằng lái" value={driver.licenseNumber} />
            <ProfileItem label="Biển số xe" value={driver.vehiclePlate} />
          </View>
          <View style={styles.verificationBox}>
            <View style={styles.inline}>
              <Icon name="shield-checkmark" size={18} color={COLORS.primary} />
              <Text style={styles.verificationTitle}>
                {VERIFICATION_LABELS[driver.verification]}
              </Text>
            </View>
            <Text style={styles.body}>
              {driver.verification === "verified"
                ? "Bạn đủ điều kiện xem và nhận cuốc phù hợp."
                : driver.rejectionReason ||
                  "Hồ sơ đang chờ Admin kiểm tra thủ công."}
            </Text>
          </View>
          <Notice
            text="Lái Xe Hộ chưa tích hợp upload giấy tờ hoặc eKYC. Thông tin dưới đây là dữ liệu bạn khai báo để Admin đối soát thủ công."
            tone="blue"
          />
          <View style={styles.metadata}>
            <Text style={styles.smallMuted}>Ghi chú giấy tờ</Text>
            <Text style={styles.body}>
              {driver.documentNote || "Chưa có ghi chú"}
            </Text>
            <Text style={styles.smallMuted}>
              Ngày tạo hồ sơ: {formatDate(driver.createdAt)}
            </Text>
          </View>
        </Card>
      </View>
    );
  return (
    <View style={styles.stack}>
      <Card>
        <SectionTitle
          title={driver ? "Cập nhật hồ sơ tài xế" : "Đăng ký làm tài xế"}
          subtitle={
            driver
              ? "Bổ sung thông tin rồi gửi lại để Admin xét duyệt."
              : "Khai báo thông tin để Admin xét duyệt thủ công."
          }
        />
        {driver ? (
          <Notice
            text={
              driver.rejectionReason
                ? `Admin yêu cầu bổ sung: ${driver.rejectionReason}`
                : "Hồ sơ đang chờ xác minh; bạn có thể cập nhật và gửi lại thông tin."
            }
            tone="amber"
          />
        ) : null}
        {error ? <Notice text={error} tone="red" /> : null}
        {success ? <Notice text={success} tone="green" /> : null}
        <Field
          label="Họ và tên *"
          value={form.name}
          onChangeText={(value) => set("name", value)}
          placeholder="Nguyễn Văn A"
        />
        <Field
          label="Số điện thoại *"
          value={form.phone}
          onChangeText={(value) => set("phone", value)}
          placeholder="09xx xxx xxx"
          keyboardType="phone-pad"
        />
        <Field
          label="Khu vực hoạt động *"
          value={form.zone}
          onChangeText={(value) => set("zone", value)}
          placeholder="Quận 1"
        />
        <Field
          label="Kinh nghiệm (năm) *"
          value={form.experience}
          onChangeText={(value) => set("experience", value)}
          placeholder="3"
          keyboardType="numeric"
        />
        <Field
          label="Số bằng lái *"
          value={form.licenseNumber}
          onChangeText={(value) => set("licenseNumber", value)}
          placeholder="B2-012345678"
        />
        <Field
          label="Thông tin xe/biển số *"
          value={form.vehiclePlate}
          onChangeText={(value) => set("vehiclePlate", value)}
          placeholder="51A-123.45 hoặc Xe khách hàng"
        />
        <Field
          label="Ghi chú giấy tờ *"
          value={form.documentNote}
          onChangeText={(value) => set("documentNote", value)}
          placeholder="Ghi rõ thông tin xe, giấy tờ liên quan hoặc Xe khách hàng"
          multiline
        />
        <Button
          title={
            demo
              ? "Đăng nhập để gửi hồ sơ"
              : driver
                ? "Gửi lại hồ sơ"
                : "Gửi hồ sơ xét duyệt"
          }
          loading={submitting}
          disabled={submitting}
          onPress={submit}
          icon="arrow-forward"
        />
        <Text style={styles.formHint}>
          Không tải tài liệu lên tại bước này. Admin sẽ xem dữ liệu khai báo và
          lưu lý do khi từ chối.
        </Text>
      </Card>
    </View>
  );
}

function ProfileItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.profileItem}>
      <Text style={styles.smallMuted}>{label}</Text>
      <Text style={styles.bodyStrong}>{value || "—"}</Text>
    </View>
  );
}

export function DriverWorkspace({ data, demo, onLogin, tab }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const snapshotUtils = trpc.useUtils();
  const register = trpc.driver.register.useMutation();
  const setAvailability = trpc.driver.setAvailability.useMutation();
  const accept = trpc.driver.accept.useMutation();
  const reject = trpc.driver.reject.useMutation();
  const advance = trpc.driver.advance.useMutation();
  const [notice, setNotice] = useState("");
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const profile = data?.profile ?? null;
  const availability = profile?.available ?? false;
  const offers = useMemo(
    () =>
      data?.offers.filter(
        (offer) => offer.status === "sent" && offer.driverId === profile?.id,
      ) ?? [],
    [data?.offers, profile?.id],
  );
  const myRides = useMemo(
    () => data?.rides.filter((ride) => ride.driverId === profile?.id) ?? [],
    [data?.rides, profile?.id],
  );
  const activeRide = myRides.find((ride) =>
    ["accepted", "arriving", "met", "in_progress"].includes(ride.status),
  );
  const completedIncome = myRides
    .filter((ride) => ride.status === "completed")
    .reduce((sum, ride) => sum + ride.driverIncome, 0);

  const invalidate = async () => {
    try {
      await snapshotUtils.workspace.snapshot.invalidate();
    } catch {
      /* parent refresh remains source of truth */
    }
  };
  const demoAction = () => {
    setNotice(
      "Đây là dữ liệu demo chỉ xem. Đăng nhập để thực hiện thao tác thật.",
    );
    onLogin();
  };
  const toggleAvailability = async () => {
    if (demo) {
      demoAction();
      return;
    }
    if (setAvailability.isPending) return;
    const next = !availability;
    setNotice("");
    try {
      await setAvailability.mutateAsync({ available: next });
      await invalidate();
      setNotice(
        next
          ? "Bạn đã bật trạng thái sẵn sàng nhận cuốc."
          : "Bạn đã tạm nghỉ nhận cuốc.",
      );
    } catch (error) {
      setNotice(messageFor(error, "Không thể cập nhật trạng thái online."));
    }
  };
  const respond = async (offer: Offer, action: "accept" | "reject") => {
    if (demo) {
      demoAction();
      return;
    }
    if (accept.isPending || reject.isPending) return;
    setNotice("");
    try {
      await (action === "accept" ? accept : reject).mutateAsync({
        offerId: offer.id,
      });
      await invalidate();
      setNotice(
        action === "accept"
          ? "Đã nhận cuốc. Hãy theo dõi các bước tiếp theo."
          : "Đã từ chối offer.",
      );
    } catch (error) {
      setNotice(messageFor(error, "Không thể cập nhật offer."));
    }
  };
  const advanceRide = async (ride: Ride) => {
    if (demo) {
      demoAction();
      return;
    }
    if (advance.isPending || !NEXT_STATUS[ride.status]) return;
    try {
      await advance.mutateAsync({ rideId: ride.id });
      await invalidate();
      setNotice(`Đã cập nhật: ${STATUS_LABELS[NEXT_STATUS[ride.status]!]}.`);
    } catch (error) {
      setNotice(messageFor(error, "Không thể chuyển trạng thái cuốc."));
    }
  };
  const registerDriver = async (form: FormState) => {
    await register.mutateAsync({
      ...form,
      experience: Number(form.experience),
    });
    await Promise.all([invalidate(), snapshotUtils.auth.me.invalidate()]);
  };

  if (!data && !demo) return <LoginRequired onLogin={onLogin} />;
  if (!data) return <LoginRequired onLogin={onLogin} />;

  const renderOverview = () => (
    <View style={styles.stack}>
      <DriverHeader
        driver={
          profile ??
          ({ name: "Tài xế mới", zone: "", verification: "pending" } as Driver)
        }
        available={availability}
        disabled={setAvailability.isPending}
        onToggle={toggleAvailability}
      />
      {notice ? (
        <Notice
          text={notice}
          tone={
            notice.includes("không") || notice.includes("demo")
              ? "amber"
              : "green"
          }
        />
      ) : null}
      {activeRide ? (
        <Card style={styles.activeCard}>
          <View style={styles.cardTopline}>
            <SectionTitle
              title="Cuốc đang thực hiện"
              subtitle={`#${activeRide.code} · ${STATUS_LABELS[activeRide.status]}`}
              right={
                <Pill
                  label={STATUS_LABELS[activeRide.status]}
                  tone={statusTone(activeRide.status)}
                />
              }
            />
          </View>
          <RouteLine pickup={activeRide.pickup} dropoff={activeRide.dropoff} />
          <View style={styles.actionRow}>
            <Button
              title="Mở chi tiết"
              variant="secondary"
              onPress={() => setSelectedRide(activeRide)}
            />
            <Button
              title={
                NEXT_STATUS[activeRide.status]
                  ? `Chuyển: ${STATUS_LABELS[NEXT_STATUS[activeRide.status]!]}`
                  : "Đã hoàn tất"
              }
              loading={advance.isPending}
              onPress={() => advanceRide(activeRide)}
              disabled={!NEXT_STATUS[activeRide.status] || advance.isPending}
            />
          </View>
        </Card>
      ) : (
        <Card style={styles.emptyHero}>
          <Icon name="navigate-circle" size={30} color={COLORS.primary} />
          <Text style={styles.heroTitle}>
            {profile?.verification === "verified"
              ? "Sẵn sàng nhận cuốc?"
              : "Hoàn thiện hồ sơ để bắt đầu"}
          </Text>
          <Text style={styles.heroCopy}>
            {profile?.verification === "verified"
              ? "Các offer phù hợp sẽ xuất hiện trong tab Cuốc chờ."
              : "Admin cần xác minh hồ sơ trước khi bạn có thể nhận cuốc."}
          </Text>
        </Card>
      )}
      <View style={compact ? styles.statStack : styles.statRow}>
        <Stat
          label="Thu nhập đã hoàn tất"
          value={formatMoney(completedIncome)}
          icon="wallet"
        />
        <Stat
          label="Cuốc hoàn tất"
          value={String(
            myRides.filter((ride) => ride.status === "completed").length,
          )}
          icon="checkmark-circle"
        />
        <Stat
          label="Đánh giá"
          value={
            profile
              ? profile.rating > 0
                ? profile.rating.toFixed(1)
                : "Chưa có"
              : "—"
          }
          icon="star"
        />
      </View>
      <SectionTitle
        title="Cuốc gần đây"
        subtitle="Dữ liệu lấy từ snapshot hiện tại"
        right={<Text style={styles.linkText}>{myRides.length} cuốc</Text>}
      />
      {myRides.length ? (
        myRides
          .slice(0, 3)
          .map((ride) => (
            <RideRow
              key={ride.id}
              ride={ride}
              onPress={() => setSelectedRide(ride)}
            />
          ))
      ) : (
        <Empty
          title="Chưa có cuốc"
          subtitle="Cuốc đã nhận sẽ hiển thị ở đây."
        />
      )}
    </View>
  );

  const renderOffers = () => (
    <View style={styles.stack}>
      <SectionTitle
        title="Cuốc chờ"
        subtitle={
          profile?.verification === "verified"
            ? "Offer chỉ hiển thị khi hồ sơ đã được xác minh."
            : "Hồ sơ chưa được xác minh nên chưa thể nhận cuốc."
        }
      />
      {profile?.verification !== "verified" ? (
        <Notice
          text="Bạn cần chờ Admin duyệt hồ sơ trước khi nhận offer."
          tone="amber"
        />
      ) : offers.length ? (
        offers.map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            busy={accept.isPending || reject.isPending}
            onAccept={() => respond(offer, "accept")}
            onReject={() => respond(offer, "reject")}
            onOpen={() => setSelectedRide(offer.ride)}
          />
        ))
      ) : (
        <Empty
          title="Chưa có cuốc phù hợp"
          subtitle="Khi có offer mới, bạn sẽ thấy điểm đón và thu nhập tại đây."
        />
      )}
    </View>
  );
  const renderHistory = () => (
    <View style={styles.stack}>
      <SectionTitle
        title="Lịch sử cuốc"
        subtitle={`${myRides.length} cuốc trong snapshot`}
      />
      {myRides.length ? (
        myRides.map((ride) => (
          <RideRow
            key={ride.id}
            ride={ride}
            onPress={() => setSelectedRide(ride)}
          />
        ))
      ) : (
        <Empty
          title="Chưa có lịch sử"
          subtitle="Các cuốc đã nhận sẽ được lưu tại đây."
        />
      )}
    </View>
  );
  const renderProfile = () => (
    <ProfileView
      key={profile?.id ?? "new"}
      driver={profile}
      onRegister={registerDriver}
      onLogin={onLogin}
      demo={demo}
      submitting={register.isPending}
    />
  );

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
          {tab === "offers"
            ? renderOffers()
            : tab === "history"
              ? renderHistory()
              : tab === "profile"
                ? renderProfile()
                : renderOverview()}
        </View>
      </ScrollView>
      <Modal
        visible={Boolean(selectedRide)}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedRide(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.detailModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chi tiết cuốc</Text>
              <Pressable onPress={() => setSelectedRide(null)}>
                <Icon name="close" size={22} color={COLORS.ink} />
              </Pressable>
            </View>
            {selectedRide ? (
              <RideDetail ride={selectedRide} events={data.events} />
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: any;
}) {
  return (
    <Card style={styles.stat}>
      <Icon name={icon} size={19} color={COLORS.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}
function RideRow({ ride, onPress }: { ride: Ride; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.rideRow, pressed && styles.pressed]}
    >
      <View style={styles.rideRowMain}>
        <View style={styles.rideRowIcon}>
          <Icon name="car" size={17} color={COLORS.primary} />
        </View>
        <View style={styles.rideRowText}>
          <Text style={styles.rideCode}>#{ride.code}</Text>
          <Text numberOfLines={1} style={styles.smallMuted}>
            {ride.pickup} → {ride.dropoff}
          </Text>
          <Text style={styles.smallMuted}>{formatDate(ride.scheduledAt)}</Text>
        </View>
      </View>
      <View style={styles.rideRowEnd}>
        <Pill
          label={STATUS_LABELS[ride.status]}
          tone={statusTone(ride.status)}
        />
        <Text style={styles.bodyStrong}>{formatMoney(ride.driverIncome)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  container: { padding: 24, paddingBottom: 48 },
  containerCompact: { padding: 16 },
  maxWidth: { width: "100%", maxWidth: 1160, alignSelf: "center" },
  stack: { gap: 16 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 4,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "#DDF3EE",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: COLORS.primary, fontSize: 22, fontWeight: "800" },
  headerIdentity: { flex: 1 },
  eyebrow: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: { color: COLORS.ink, fontSize: 25, fontWeight: "800", marginTop: 2 },
  inline: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 5 },
  dot: { color: COLORS.muted },
  muted: { color: COLORS.muted, fontSize: 13 },
  onlineToggle: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  onlineToggleOn: { borderColor: "#A6DCD2", backgroundColor: "#EFFAF7" },
  toggleDot: {
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: COLORS.muted,
  },
  toggleDotOn: { backgroundColor: COLORS.primary },
  toggleText: { fontSize: 12, color: COLORS.muted, fontWeight: "700" },
  toggleTextOn: { color: COLORS.primary },
  demoBanner: {
    minHeight: 42,
    backgroundColor: "#EFFAF7",
    borderColor: "#BEE8DF",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 18,
  },
  demoText: { flex: 1, color: COLORS.ink, fontSize: 12, fontWeight: "700" },
  activeCard: { borderColor: "#B8E4DA", borderWidth: 1 },
  cardTopline: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  rideCode: { color: COLORS.ink, fontWeight: "800", fontSize: 15 },
  smallMuted: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  offerCard: { gap: 12 },
  offerMeta: {
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  metaLabel: { color: COLORS.muted, fontSize: 12 },
  earning: {
    color: COLORS.primary,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 2,
  },
  metaValue: { color: COLORS.ink, fontSize: 12, marginTop: 3 },
  warning: {
    color: "#946A16",
    fontSize: 12,
    backgroundColor: "#FFF8E8",
    padding: 9,
    borderRadius: 8,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },
  detailLink: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: 2,
  },
  detailLinkText: { color: COLORS.primary, fontWeight: "800", fontSize: 12 },
  statRow: { flexDirection: "row", gap: 12 },
  statStack: { gap: 12 },
  stat: { flex: 1, minHeight: 106, gap: 7 },
  statValue: {
    color: COLORS.ink,
    fontSize: 21,
    fontWeight: "800",
    marginTop: 2,
  },
  statLabel: { color: COLORS.muted, fontSize: 12 },
  emptyHero: {
    alignItems: "flex-start",
    backgroundColor: "#F1FAF8",
    borderColor: "#D8F1EC",
    borderWidth: 1,
  },
  heroTitle: {
    color: COLORS.ink,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 10,
  },
  heroCopy: {
    color: COLORS.muted,
    lineHeight: 20,
    marginTop: 4,
    maxWidth: 500,
  },
  rideRow: {
    backgroundColor: "#fff",
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    paddingVertical: 13,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
  },
  pressed: { opacity: 0.65 },
  rideRowMain: { flexDirection: "row", alignItems: "center", gap: 11, flex: 1 },
  rideRowIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#EFFAF7",
    alignItems: "center",
    justifyContent: "center",
  },
  rideRowText: { flex: 1 },
  rideRowEnd: { alignItems: "flex-end", gap: 5 },
  linkText: { color: COLORS.primary, fontSize: 12, fontWeight: "800" },
  profileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18,
    marginTop: 12,
  },
  profileItem: { minWidth: 145, flexGrow: 1 },
  body: { color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  bodyStrong: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },
  verificationBox: {
    marginTop: 18,
    padding: 13,
    borderRadius: 12,
    backgroundColor: "#F1FAF8",
    gap: 8,
  },
  verificationTitle: { color: COLORS.primary, fontWeight: "800" },
  metadata: { gap: 5, marginTop: 14 },
  formHint: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
    maxWidth: 360,
    marginVertical: 9,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(20,44,42,0.35)",
    justifyContent: "flex-end",
  },
  detailModal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    maxHeight: "88%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  modalTitle: { color: COLORS.ink, fontSize: 18, fontWeight: "800" },
  disabled: { opacity: 0.55 },
});
