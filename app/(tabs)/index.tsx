import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Head from "expo-router/head";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { trpc } from "@/lib/trpc";
import * as Auth from "@/lib/_core/auth";
import { Button, COLORS, Icon, Notice, Pill } from "@/components/laiho/ui";
import { CustomerWorkspace } from "@/features/CustomerWorkspace";
import { DriverWorkspace } from "@/features/DriverWorkspace";
import { AdminWorkspace } from "@/features/AdminWorkspace";
import { AdminAccountWorkspace } from "@/features/AdminAccountWorkspace";
import { LocalAuthPanel } from "@/features/LocalAuthPanel";
import { PaymentsHistory } from "@/features/PaymentsHistory";
import { getDemoWorkspace } from "@/lib/demo";
import type { ViewRole } from "@/shared/domain";

type MenuItem = {
  id: string;
  title: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
};
const MENUS: Record<ViewRole, MenuItem[]> = {
  customer: [
    { id: "book", title: "Đặt tài xế", icon: "car-outline" },
    { id: "trips", title: "Chuyến của tôi", icon: "receipt-outline" },
    { id: "pricing", title: "Bảng giá", icon: "wallet-outline" },
    { id: "help", title: "Trợ giúp", icon: "help-circle-outline" },
  ],
  driver: [
    { id: "overview", title: "Tổng quan", icon: "grid-outline" },
    { id: "offers", title: "Cuốc chờ", icon: "radio-outline" },
    { id: "history", title: "Lịch sử & thu nhập", icon: "wallet-outline" },
    { id: "profile", title: "Hồ sơ tài xế", icon: "person-outline" },
  ],
  admin: [
    { id: "overview", title: "Tổng quan", icon: "grid-outline" },
    { id: "rides", title: "Điều phối cuốc", icon: "navigate-outline" },
    { id: "drivers", title: "Quản lý tài xế", icon: "people-outline" },
    { id: "pricing", title: "Cấu hình giá", icon: "options-outline" },
    { id: "activity", title: "Nhật ký vận hành", icon: "time-outline" },
    { id: "account", title: "Tài khoản", icon: "person-circle-outline" },
  ],
};
for (const role of ["customer", "driver", "admin"] as const)
  MENUS[role].splice(2, 0, {
    id: "payments",
    title: "Thanh toán",
    icon: "card-outline",
  });
const ROLE_LABELS = {
  customer: "Khách hàng",
  driver: "Tài xế",
  admin: "Quản trị",
};
function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
      <View style={s.logo}>
        <Image
          source={require("../../assets/images/icon.png")}
          style={{ width: 35, height: 35, borderRadius: 9 }}
        />
      </View>
      <View>
        <Text
          style={{
            color: COLORS.ink,
            fontSize: compact ? 18 : 21,
            fontWeight: "800",
            letterSpacing: -0.9,
          }}
        >
          Lái Hộ<Text style={{ color: COLORS.primary }}>.</Text>
        </Text>
        {!compact && (
          <Text
            style={{
              color: "#94A49A",
              fontSize: 8,
              letterSpacing: 2,
              marginTop: 3,
            }}
          >
            VỀ NHÀ AN TÂM
          </Text>
        )}
      </View>
    </View>
  );
}
export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const desktop = width >= 900;
  const utils = trpc.useUtils();
  const auth = trpc.auth.me.useQuery(undefined, {
    retry: 1,
    refetchInterval: 15000,
  });
  const [selectedRole, setRole] = useState<ViewRole | null>(null);
  const [selectedTab, setTab] = useState<string | null>(null);
  const [demoRequested, setDemoRequested] = useState(false);
  const [authPanelRole, setAuthPanelRole] = useState<ViewRole>("customer");
  const [authPanelVisible, setAuthPanelVisible] = useState(false);
  const [message, setMessage] = useState("");
  const user = auth.data;
  const accountRole = user?.role;
  const role: ViewRole =
    selectedRole ??
    (user?.role === "admin"
      ? "admin"
      : user?.role === "driver"
        ? "driver"
        : "customer");
  const tab = selectedTab ?? MENUS[role][0].id;
  const hasRole =
    role === "customer" ||
    (role === "admin" && accountRole === "admin") ||
    (role === "driver" && accountRole === "driver");
  const demo =
    role !== "admin" &&
    (demoRequested || (role !== "customer" && (!user || !hasRole)));
  const snapshot = trpc.workspace.snapshot.useQuery(undefined, {
    enabled: !!user && !demo && hasRole,
    refetchInterval: 8000,
    retry: 1,
  });
  const rawData = demo ? getDemoWorkspace(role) : (snapshot.data ?? null);
  const data =
    rawData && role === "customer" && !demo && user
      ? {
          ...rawData,
          rides: rawData.rides.filter((ride) => ride.customerId === user.id),
        }
      : rawData &&
          role === "driver" &&
          demo &&
          tab === "profile" &&
          !demoRequested
        ? { ...rawData, profile: null, rides: [], offers: [] }
        : rawData;
  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await Auth.removeSessionToken();
      await Auth.clearUserInfo();
      await utils.auth.me.invalidate();
      utils.workspace.snapshot.reset();
      setRole(null);
      setTab(null);
      setDemoRequested(false);
    },
  });
  function login(targetRole?: ViewRole) {
    const nextRole =
      targetRole === "customer" ||
      targetRole === "driver" ||
      targetRole === "admin"
        ? targetRole
        : role;
    setMessage("");
    setAuthPanelRole(nextRole);
    setAuthPanelVisible(true);
  }
  function changeRole(next: ViewRole) {
    setRole(next);
    setTab(MENUS[next][0].id);
    setDemoRequested(false);
    setMessage("");
    if (
      next !== "customer" &&
      (!user ||
        (next === "admin" && accountRole !== "admin") ||
        (next === "driver" && accountRole !== "driver"))
    ) {
      login(next);
    }
  }
  const title =
    MENUS[role].find((menu) => menu.id === tab)?.title ?? "Đặt tài xế";
  const versionTag = demo
    ? "Dữ liệu minh họa"
    : user
      ? "Dữ liệu dùng chung"
      : "Bản dựng thử nghiệm";
  return (
    <View
      style={[s.root, { paddingTop: Platform.OS === "web" ? 0 : insets.top }]}
    >
      <Head>
        <title>
          {role === "customer"
            ? "Lái Xe Hộ — Đặt tài xế, biết giá trước, về nhà an tâm"
            : `${title} — Lái Xe Hộ`}
        </title>
        <meta
          name="description"
          content="Đặt tài xế lái chính chiếc xe của bạn. Báo giá tự động, theo dõi trạng thái hành trình và đồng bộ thông tin trên website, app khách và app tài xế."
        />
        <meta
          name="robots"
          content={
            role !== "customer" || tab === "trips" || tab === "payments"
              ? "noindex,nofollow"
              : "index,follow"
          }
        />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Lái Xe Hộ" />
        <meta property="og:title" content="Lái Xe Hộ — Về nhà an tâm" />
        <meta
          property="og:description"
          content="Đặt người lái đáng tin. Xem chi phí trước khi đặt và theo dõi từng trạng thái hành trình."
        />
        <meta
          property="og:image"
          content="https://files.manuscdn.com/user_upload_by_module/session_file/310519663856371269/jtdZdaVGFCqaRYMe.png"
        />
        <meta name="twitter:card" content="summary" />
      </Head>
      {desktop && (
        <View style={s.sidebar}>
          <View style={{ paddingVertical: 28, paddingHorizontal: 27 }}>
            <Brand />
          </View>
          <Text style={s.menuLabel}>{ROLE_LABELS[role].toUpperCase()}</Text>
          <View style={{ paddingHorizontal: 16, gap: 6 }}>
            {MENUS[role].map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setTab(item.id)}
                style={({ pressed }) => [
                  s.menuItem,
                  tab === item.id && s.menuSelected,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Icon
                  name={item.icon}
                  color={tab === item.id ? COLORS.primary : "#899F92"}
                  size={19}
                />
                <Text
                  style={[
                    s.menuTitle,
                    tab === item.id && {
                      color: COLORS.primary,
                      fontWeight: "700",
                    },
                  ]}
                >
                  {item.title}
                </Text>
                {tab === item.id && <View style={s.activeDot} />}
              </Pressable>
            ))}
          </View>
          <View style={{ flex: 1 }} />
          <View style={s.driverCallout}>
            <View style={s.calloutIcon}>
              <Icon name="car-sport-outline" size={23} color={COLORS.primary} />
            </View>
            <Text style={s.calloutTitle}>
              {role === "customer"
                ? "Bạn là tài xế?"
                : "Một hệ thống. Mọi hành trình."}
            </Text>
            <Text style={s.calloutText}>
              {role === "customer"
                ? "Đăng ký đồng hành và nhận những cuốc xe phù hợp."
                : "Website và app cùng kết nối một nguồn dữ liệu."}
            </Text>
            <Pressable
              onPress={() => {
                if (role === "customer") {
                  changeRole("driver");
                  setTab("profile");
                } else {
                  changeRole("customer");
                }
              }}
            >
              <Text style={s.calloutLink}>
                {role === "customer"
                  ? "Đăng ký ngay  →"
                  : "Đến website khách  →"}
              </Text>
            </Pressable>
          </View>
          <View
            style={{
              padding: 22,
              borderTopWidth: 1,
              borderColor: "#EFF3EF",
              gap: 8,
            }}
          >
            <View
              style={{ flexDirection: "row", gap: 7, alignItems: "center" }}
            >
              <View style={s.avatar}>
                <Text
                  style={{
                    color: COLORS.primary,
                    fontSize: 11,
                    fontWeight: "700",
                  }}
                >
                  {user?.name?.slice(0, 1).toUpperCase() ?? "K"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 12, fontWeight: "600", color: COLORS.ink }}
                  numberOfLines={1}
                >
                  {user?.name ?? "Khách truy cập"}
                </Text>
                <Text
                  style={{ fontSize: 9, color: COLORS.muted, marginTop: 3 }}
                >
                  {user ? "Tài khoản nội bộ" : "Chưa đăng nhập"}
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 9, color: "#B0BFB4" }}>
              Lái Xe Hộ · phiên bản MVP 1.0
            </Text>
          </View>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View
          style={[s.header, !desktop && { paddingHorizontal: 17, height: 62 }]}
        >
          {desktop ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Text style={s.breadcrumb}>Lái Xe Hộ</Text>
              <Icon name="chevron-forward" size={12} color="#B7C2BB" />
              <Text style={{ color: "#54725F", fontSize: 12 }}>{title}</Text>
            </View>
          ) : (
            <Brand compact />
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {desktop && (
              <Pill label={versionTag} tone={demo ? "amber" : "green"} />
            )}
            {user ? (
              <Button
                title="Đăng xuất"
                variant="ghost"
                onPress={() => logout.mutate()}
                loading={logout.isPending}
              />
            ) : (
              <Button
                title="Đăng nhập"
                variant="secondary"
                icon="log-in-outline"
                onPress={login}
              />
            )}
          </View>
        </View>
        <View style={[s.roleBar, { paddingHorizontal: desktop ? 34 : 17 }]}>
          <View style={s.roles}>
            {(["customer", "driver", "admin"] as const).map((r) => (
              <Pressable
                key={r}
                onPress={() => changeRole(r)}
                style={[s.roleButton, role === r && s.roleActive]}
              >
                <Icon
                  name={
                    r === "customer"
                      ? "person-outline"
                      : r === "driver"
                        ? "car-outline"
                        : "shield-checkmark-outline"
                  }
                  size={15}
                  color={role === r ? COLORS.primary : "#81998B"}
                />
                <Text
                  style={{
                    color: role === r ? COLORS.primary : "#81998B",
                    fontSize: 11,
                    fontWeight: role === r ? "700" : "500",
                  }}
                >
                  {ROLE_LABELS[r]}
                </Text>
              </Pressable>
            ))}
          </View>
          {desktop && (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Icon name="location-outline" size={14} color={COLORS.muted} />
              <Text style={{ fontSize: 11, color: COLORS.muted }}>
                TP. Hồ Chí Minh
              </Text>
            </View>
          )}
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            s.content,
            { padding: desktop ? 34 : 18, paddingBottom: desktop ? 38 : 30 },
          ]}
        >
          {message ? <Notice tone="red" text={message} /> : null}
          {demo && (
            <Notice
              tone="amber"
              text="CHẾ ĐỘ MINH HỌA · Dữ liệu mẫu chỉ đọc, không phải cuốc xe đang hoạt động. Đăng nhập đúng vai trò để sử dụng chức năng vận hành."
            />
          )}
          {!demo && snapshot.error && (
            <View style={{ gap: 8 }}>
              <Notice
                tone="red"
                text={`Không tải được dữ liệu: ${snapshot.error.message}`}
              />
              <Button
                title="Tải lại dữ liệu"
                variant="secondary"
                onPress={() => snapshot.refetch()}
              />
            </View>
          )}
          {auth.isLoading && (
            <View
              style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
            >
              <ActivityIndicator color={COLORS.primary} size="small" />
              <Text style={s.breadcrumb}>Đang kiểm tra phiên đăng nhập…</Text>
            </View>
          )}
          {tab === "payments" ? (
            <PaymentsHistory
              demo={demo}
              authenticated={!!user}
              onLogin={login}
            />
          ) : role === "customer" ? (
            <CustomerWorkspace
              data={data}
              demo={demo}
              onLogin={login}
              tab={tab}
              authenticated={!!user}
              onNavigate={setTab}
            />
          ) : role === "driver" ? (
            <DriverWorkspace
              data={data}
              demo={demo}
              onLogin={login}
              tab={tab}
            />
          ) : tab === "account" ? (
            <AdminAccountWorkspace
              user={user}
              onLogout={() => logout.mutate()}
            />
          ) : (
            <AdminWorkspace data={data} demo={demo} onLogin={login} tab={tab} />
          )}
          <View style={s.footer}>
            <Text style={s.footerText}>
              © 2026 Lái Xe Hộ. Đặt người lái, về nhà an tâm.
            </Text>
            <Pressable
              onPress={() => {
                if (role !== "admin") setDemoRequested(!demoRequested);
              }}
            >
              <Text style={[s.footerText, { color: COLORS.primary }]}>
                {role === "admin"
                  ? "Tài khoản quản trị riêng"
                  : demoRequested
                    ? "Thoát dữ liệu minh họa"
                    : "Xem dữ liệu minh họa"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
        {!desktop && (
          <View
            style={[s.bottomNav, { paddingBottom: Math.max(insets.bottom, 9) }]}
          >
            {MENUS[role].map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setTab(item.id)}
                style={s.bottomItem}
              >
                <Icon
                  name={item.icon}
                  color={tab === item.id ? COLORS.primary : "#9FAFA4"}
                  size={21}
                />
                <Text
                  style={{
                    fontSize: 8,
                    marginTop: 5,
                    color: tab === item.id ? COLORS.primary : "#8A9F91",
                    fontWeight: tab === item.id ? "700" : "500",
                  }}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
      {authPanelVisible ? (
        <LocalAuthPanel
          initialRole={authPanelRole}
          onClose={() => setAuthPanelVisible(false)}
          onSuccess={async () => {
            setAuthPanelVisible(false);
            setDemoRequested(false);
            await utils.auth.me.invalidate();
          }}
        />
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", backgroundColor: COLORS.bg },
  sidebar: {
    width: 224,
    backgroundColor: "white",
    borderRightWidth: 1,
    borderColor: "#E8EFE8",
  },
  logo: {
    width: 35,
    height: 35,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  logoDot: {
    width: 5,
    height: 5,
    backgroundColor: "#B7DE80",
    borderRadius: 3,
    position: "absolute",
    top: 5,
    right: 4,
  },
  menuLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#A6B4AB",
    letterSpacing: 1.2,
    paddingHorizontal: 28,
    marginTop: 20,
    marginBottom: 18,
  },
  menuItem: {
    paddingHorizontal: 13,
    paddingVertical: 14,
    gap: 12,
    borderRadius: 9,
    flexDirection: "row",
    alignItems: "center",
  },
  menuSelected: { backgroundColor: "#EAF6EC" },
  menuTitle: { fontSize: 12, color: "#728C7D", flex: 1 },
  activeDot: {
    backgroundColor: COLORS.primary,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  driverCallout: {
    margin: 18,
    padding: 15,
    backgroundColor: "#F6F9F4",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E7EEDC",
    gap: 9,
  },
  calloutIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#E6F2DF",
    alignItems: "center",
    justifyContent: "center",
  },
  calloutTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.ink,
    lineHeight: 19,
  },
  calloutText: { fontSize: 10, color: "#8A9D89", lineHeight: 17 },
  calloutLink: {
    color: COLORS.primary,
    fontWeight: "700",
    fontSize: 10,
    marginTop: 5,
  },
  avatar: {
    width: 33,
    height: 33,
    borderRadius: 20,
    backgroundColor: "#EAF4E9",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    height: 72,
    paddingHorizontal: 34,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderColor: "#E9EFE9",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  breadcrumb: { fontSize: 12, color: "#91A393" },
  roleBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "#E4ECE3",
    backgroundColor: "#FBFCFA",
    paddingVertical: 13,
  },
  roles: { flexDirection: "row", gap: 5 },
  roleButton: {
    flexDirection: "row",
    gap: 6,
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  roleActive: { backgroundColor: "#EAF5EC" },
  content: { gap: 22, maxWidth: 1600, width: "100%", alignSelf: "center" },
  footer: {
    paddingTop: 26,
    borderTopWidth: 1,
    borderColor: "#E3EBE0",
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  footerText: { fontSize: 10, color: "#9AAC9D" },
  bottomNav: {
    backgroundColor: "white",
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: "#E4ECE3",
    paddingTop: 10,
  },
  bottomItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
});
