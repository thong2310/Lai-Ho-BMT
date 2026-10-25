import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Button,
  Card,
  COLORS,
  Field,
  Notice,
  Pill,
  SectionTitle,
} from "@/components/laiho/ui";
import { trpc } from "@/lib/trpc";
import type * as Auth from "@/lib/_core/auth";

type AccountUser = Auth.User & {
  role?: string | null;
  authSource?: string | null;
};

type Props = {
  user: AccountUser | null | undefined;
  onLogout: () => void;
};

export function AdminAccountWorkspace({ user, onLogout }: Props) {
  const changePassword = trpc.auth.admin.changePassword.useMutation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    setMessage("");
    setError("");
    if (newPassword.length < 8) {
      setError("Mật khẩu mới cần có ít nhất 8 ký tự.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Đã cập nhật mật khẩu tài khoản quản trị.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Chưa thể đổi mật khẩu. Tính năng cần route auth.changePassword từ backend.",
      );
    }
  };

  if (!user || user.role !== "admin") {
    return (
      <View style={styles.stack}>
        <Card>
          <SectionTitle
            title="Tài khoản quản trị"
            subtitle="Khu vực này chỉ dành cho tài khoản quản trị đã đăng nhập."
          />
          <Notice
            text="Hãy đăng nhập bằng tài khoản quản trị để xem thông tin tài khoản."
            tone="amber"
          />
          <Button title="Đăng xuất" variant="ghost" onPress={onLogout} />
        </Card>
      </View>
    );
  }

  const lastLogin =
    user.lastSignedIn instanceof Date
      ? user.lastSignedIn
      : new Date(user.lastSignedIn);
  const lastLoginText = Number.isNaN(lastLogin.getTime())
    ? "Chưa có dữ liệu"
    : lastLogin.toLocaleString("vi-VN", {
        dateStyle: "medium",
        timeStyle: "short",
      });

  return (
    <View style={styles.stack}>
      <SectionTitle
        title="Tài khoản"
        subtitle="Thông tin tài khoản quản trị đang dùng trong hệ thống."
      />
      <Card>
        <View style={styles.identityHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user.name ?? user.email ?? "A").slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={styles.identityCopy}>
            <Text style={styles.name}>{user.name || "Chưa cập nhật tên"}</Text>
            <Text style={styles.email}>
              {user.email || "Chưa cập nhật email"}
            </Text>
          </View>
          <Pill label="Quản trị" tone="green" />
        </View>
        <View style={styles.detailGrid}>
          <Detail label="Vai trò" value={user.role ?? "admin"} />
          <Detail
            label="Nguồn xác thực"
            value={user.authSource ?? user.loginMethod ?? "local"}
          />
          <Detail label="Email" value={user.email ?? "Chưa có dữ liệu"} />
          <Detail label="Đăng nhập gần nhất" value={lastLoginText} />
        </View>
      </Card>

      <Card>
        <SectionTitle
          title="Đổi mật khẩu"
          subtitle="Xác nhận mật khẩu hiện tại trước khi lưu mật khẩu mới."
        />
        {message ? <Notice text={message} /> : null}
        {error ? <Notice text={error} tone="red" /> : null}
        <Field
          label="Mật khẩu hiện tại"
          secureTextEntry
          value={currentPassword}
          onChangeText={setCurrentPassword}
        />
        <Field
          label="Mật khẩu mới"
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
        />
        <Field
          label="Xác nhận mật khẩu mới"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
        <Button
          title="Cập nhật mật khẩu"
          loading={changePassword.isPending}
          onPress={submit}
          icon="key-outline"
        />
      </Card>
      <Button
        title="Đăng xuất tài khoản quản trị"
        variant="danger"
        onPress={onLogout}
        icon="log-out-outline"
      />
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 18 },
  identityHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5F5F1",
  },
  avatarText: { color: COLORS.primary, fontSize: 22, fontWeight: "800" },
  identityCopy: { flex: 1, gap: 3 },
  name: { color: COLORS.ink, fontSize: 18, fontWeight: "800" },
  email: { color: COLORS.muted, fontSize: 13 },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  detail: { minWidth: 160, flex: 1, gap: 4 },
  detailLabel: { color: COLORS.muted, fontSize: 11, fontWeight: "600" },
  detailValue: { color: COLORS.ink, fontSize: 13, fontWeight: "700" },
});
