import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Button, COLORS, Icon, Notice } from "@/components/laiho/ui";
import * as Auth from "@/lib/_core/auth";
import { trpc } from "@/lib/trpc";
import type { ViewRole } from "@/shared/domain";

type AuthRole = ViewRole;
type AuthMode = "login" | "register";

type AuthResponse = {
  sessionToken?: string;
  token?: string;
  app_session_id?: string;
  user?: {
    id?: number;
    openId?: string;
    name?: string | null;
    email?: string | null;
    loginMethod?: string | null;
    authSource?: string | null;
    role?: string | null;
    lastSignedIn?: string | Date | null;
    lastLogin?: string | Date | null;
  };
};

type MutationHook = {
  useMutation: () => {
    mutateAsync: (input: Record<string, unknown>) => Promise<AuthResponse>;
    isPending: boolean;
  };
};

type LocalAuthRoutes = {
  localRegisterCustomer: MutationHook;
  localRegisterDriver: MutationHook;
  localLogin: MutationHook;
};

const ROLE_LABELS: Record<AuthRole, string> = {
  customer: "Khách hàng",
  driver: "Tài xế",
  admin: "Quản trị",
};

function AuthInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  keyboardType?: "default" | "email-address";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
        autoCorrect={false}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9DAEA7"
        secureTextEntry={secureTextEntry}
        style={[styles.input, multiline && styles.multilineInput]}
        value={value}
      />
    </View>
  );
}

function responseUser(response: AuthResponse): Auth.User {
  const value = response.user;
  if (!value?.id || !value.email) {
    throw new Error(
      "Tài khoản đã xác thực nhưng dữ liệu người dùng chưa đầy đủ.",
    );
  }
  return {
    id: value.id,
    openId: value.openId ?? `local-${value.id}`,
    name: value.name ?? null,
    email: value.email,
    loginMethod: value.loginMethod ?? value.authSource ?? "local",
    lastSignedIn: new Date(value.lastSignedIn ?? value.lastLogin ?? Date.now()),
  };
}

export type LocalAuthPanelProps = {
  onSuccess: (user?: Auth.User) => void;
  initialRole: ViewRole;
  onClose: () => void;
};

export function LocalAuthPanel({
  onSuccess,
  initialRole,
  onClose,
}: LocalAuthPanelProps) {
  const utils = trpc.useUtils();
  const routes = trpc.auth as unknown as LocalAuthRoutes;
  const login = routes.localLogin.useMutation();
  const registerCustomer = routes.localRegisterCustomer.useMutation();
  const registerDriver = routes.localRegisterDriver.useMutation();
  const [role, setRole] = useState<AuthRole>(initialRole);
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [driverNote, setDriverNote] = useState("");
  const [error, setError] = useState("");

  const isRegister = mode === "register" && role !== "admin";
  const pending =
    login.isPending || registerCustomer.isPending || registerDriver.isPending;
  const roleLabel = ROLE_LABELS[role] ?? ROLE_LABELS.customer;

  const chooseRole = (nextRole: AuthRole) => {
    setRole(nextRole);
    setMode("login");
    setError("");
  };

  const submit = async () => {
    setError("");
    if (!email.trim() || !email.includes("@")) {
      setError("Vui lòng nhập email hợp lệ.");
      return;
    }
    if (password.length < 8) {
      setError("Mật khẩu cần có ít nhất 8 ký tự.");
      return;
    }
    if (isRegister && password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    if (isRegister && !name.trim()) {
      setError("Vui lòng nhập họ và tên.");
      return;
    }
    if (role === "driver" && isRegister && !driverNote.trim()) {
      setError("Vui lòng nhập thông tin đăng ký tài xế.");
      return;
    }

    try {
      const input = { email: email.trim().toLowerCase(), password, role };
      const response = isRegister
        ? role === "driver"
          ? await registerDriver.mutateAsync({
              ...input,
              name: name.trim(),
              driverRegistrationText: driverNote.trim(),
              driverNote: driverNote.trim(),
            })
          : await registerCustomer.mutateAsync({
              ...input,
              name: name.trim(),
            })
        : await login.mutateAsync(input);
      const user = responseUser(response);
      const token =
        response.sessionToken ?? response.token ?? response.app_session_id;
      if (token) await Auth.setSessionToken(token);
      await Auth.setUserInfo(user);
      await utils.auth.me.invalidate();
      onSuccess(user);
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể hoàn tất xác thực. Vui lòng thử lại.",
      );
    }
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <View style={styles.panel}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>TÀI KHOẢN NỘI BỘ</Text>
                <Text style={styles.title}>
                  {isRegister ? "Tạo tài khoản" : "Đăng nhập"}
                </Text>
                <Text style={styles.subtitle}>
                  Chọn đúng không gian để tiếp tục hành trình.
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Đóng bảng tài khoản"
                onPress={onClose}
                style={styles.close}
              >
                <Icon name="close" size={22} color={COLORS.ink} />
              </Pressable>
            </View>

            <View style={styles.roleRow}>
              {(Object.keys(ROLE_LABELS) as AuthRole[]).map((value) => (
                <Pressable
                  key={value}
                  onPress={() => chooseRole(value)}
                  style={[
                    styles.roleButton,
                    role === value && styles.roleButtonActive,
                  ]}
                >
                  <Icon
                    name={
                      value === "customer"
                        ? "person-outline"
                        : value === "driver"
                          ? "car-outline"
                          : "shield-checkmark-outline"
                    }
                    size={16}
                    color={role === value ? COLORS.primary : COLORS.muted}
                  />
                  <Text
                    style={[
                      styles.roleText,
                      role === value && styles.roleTextActive,
                    ]}
                  >
                    {ROLE_LABELS[value]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {role !== "admin" ? (
              <View style={styles.modeRow}>
                <Pressable
                  onPress={() => setMode("login")}
                  style={[
                    styles.modeButton,
                    mode === "login" && styles.modeActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.modeText,
                      mode === "login" && styles.modeTextActive,
                    ]}
                  >
                    Đăng nhập
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setMode("register")}
                  style={[
                    styles.modeButton,
                    mode === "register" && styles.modeActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.modeText,
                      mode === "register" && styles.modeTextActive,
                    ]}
                  >
                    {role === "driver" ? "Đăng ký tài xế" : "Tạo tài khoản"}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Notice
                text="Tài khoản quản trị được cấp riêng và chỉ hỗ trợ đăng nhập."
                tone="blue"
              />
            )}

            {error ? <Notice text={error} tone="red" /> : null}
            {isRegister ? (
              <AuthInput
                label="Họ và tên"
                onChangeText={setName}
                placeholder="Nguyễn Văn A"
                value={name}
              />
            ) : null}
            <AuthInput
              label="Email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="ban@example.com"
              value={email}
            />
            <AuthInput
              label="Mật khẩu"
              onChangeText={setPassword}
              placeholder="Ít nhất 8 ký tự"
              secureTextEntry
              value={password}
            />
            {isRegister ? (
              <AuthInput
                label="Xác nhận mật khẩu"
                onChangeText={setConfirmPassword}
                placeholder="Nhập lại mật khẩu"
                secureTextEntry
                value={confirmPassword}
              />
            ) : null}
            {isRegister && role === "driver" ? (
              <AuthInput
                label="Thông tin đăng ký tài xế"
                multiline
                onChangeText={setDriverNote}
                placeholder="Khu vực, kinh nghiệm, bằng lái và thông tin xe"
                value={driverNote}
              />
            ) : null}
            <Button
              icon={isRegister ? "person-add-outline" : "log-in-outline"}
              loading={pending}
              onPress={submit}
              title={
                isRegister
                  ? "Tạo tài khoản"
                  : `Đăng nhập ${roleLabel.toLowerCase()}`
              }
            />
            <Text style={styles.privacy}>
              Thông tin được xử lý bởi tài khoản nội bộ của Lái Xe Hộ.
            </Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    backgroundColor: "rgba(14,36,28,0.48)",
  },
  panel: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "94%",
    borderRadius: 20,
    backgroundColor: COLORS.white,
  },
  content: { gap: 16, padding: 24 },
  header: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  headerCopy: { flex: 1, gap: 6 },
  close: { padding: 4 },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  title: {
    color: COLORS.ink,
    fontSize: 27,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  subtitle: { color: COLORS.muted, fontSize: 13, lineHeight: 20 },
  roleRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  roleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: "#F4F7F4",
  },
  roleButtonActive: { backgroundColor: "#E5F4ED" },
  roleText: { color: COLORS.muted, fontSize: 11, fontWeight: "600" },
  roleTextActive: { color: COLORS.primary, fontWeight: "800" },
  modeRow: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    backgroundColor: "#F2F6F2",
    borderRadius: 10,
  },
  modeButton: { flex: 1, alignItems: "center", borderRadius: 7, padding: 10 },
  modeActive: { backgroundColor: COLORS.white },
  modeText: { color: COLORS.muted, fontSize: 12, fontWeight: "600" },
  modeTextActive: { color: COLORS.primary, fontWeight: "800" },
  field: { gap: 7 },
  label: { color: "#526F63", fontSize: 12, fontWeight: "600" },
  input: {
    minHeight: 47,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#F8FAF8",
    color: COLORS.ink,
    fontSize: 14,
  },
  multilineInput: { minHeight: 88, textAlignVertical: "top" },
  privacy: {
    color: "#9AAC9D",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
  },
});
