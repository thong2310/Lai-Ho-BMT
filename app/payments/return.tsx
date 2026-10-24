import { useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Card, COLORS, Notice, Pill } from "@/components/laiho/ui";
import { trpc } from "@/lib/trpc";
import { PAYMENT_LABELS } from "@/shared/payments";
import { formatMoney } from "@/shared/domain";

export default function PaymentReturn() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    rideId?: string;
    cancelled?: string;
  }>();
  const rideId = Number(params.rideId);
  const validId = Number.isSafeInteger(rideId) && rideId > 0;
  const user = trpc.auth.me.useQuery();
  const result = trpc.payments.overview.useQuery(
    { rideId: validId ? rideId : 1 },
    { enabled: validId && !!user.data, refetchInterval: 5000, retry: false },
  );
  const reconcile = trpc.payments.reconcile.useMutation();
  const [error, setError] = useState("");
  async function refresh() {
    setError("");
    try {
      await reconcile.mutateAsync({ rideId });
      await result.refetch();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Chưa kiểm tra được giao dịch.",
      );
    }
  }
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Head>
        <title>Kết quả thanh toán — Lái Xe Hộ</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <Card style={s.card}>
        <Text style={s.title}>Trở về từ cổng thanh toán</Text>
        <Notice
          text={
            params.cancelled === "1"
              ? "Bạn đã quay lại từ cổng. Việc đóng/hủy phiên không tự ghi nhận thanh toán thất bại; có thể kiểm tra hoặc thử lại trong chi tiết cuốc."
              : "Ứng dụng đang chờ server xác minh kết quả tại cổng. Địa chỉ trang trở về không phải bằng chứng đã trả tiền."
          }
          tone="blue"
        />
        {!validId ? (
          <Notice tone="red" text="Mã cuốc trong liên kết không hợp lệ." />
        ) : !user.data ? (
          <Notice
            text="Nếu mở cổng từ điện thoại, đóng trình duyệt và trở lại app để xem trạng thái. Nếu dùng website, đăng nhập cùng tài khoản rồi mở chi tiết cuốc."
            tone="amber"
          />
        ) : result.data ? (
          <View style={{ gap: 12 }}>
            <Pill
              label={PAYMENT_LABELS[result.data.payment?.status ?? "unpaid"]}
              tone={result.data.payment?.status === "paid" ? "green" : "amber"}
            />
            {result.data.payment ? (
              <Text style={s.amount}>
                {formatMoney(result.data.payment.amount)}
              </Text>
            ) : null}
            {result.data.configuration.available &&
            result.data.payment &&
            result.data.payment.status !== "paid" ? (
              <Button
                title="Làm mới trạng thái IPN"
                onPress={refresh}
                loading={reconcile.isPending}
              />
            ) : null}
          </View>
        ) : (
          <Notice
            text={
              result.error?.message ?? "Đang tải trạng thái được cấp quyền…"
            }
            tone={result.error ? "red" : "blue"}
          />
        )}
        {error ? <Notice tone="red" text={error} /> : null}
        <Button
          title="Về ứng dụng Lái Xe Hộ"
          variant="secondary"
          onPress={() => router.replace("/")}
        />
      </Card>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  page: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: COLORS.bg,
  },
  card: { gap: 20, maxWidth: 560, width: "100%" },
  title: { color: COLORS.ink, fontSize: 25, fontWeight: "800" },
  amount: { color: COLORS.primary, fontSize: 23, fontWeight: "700" },
});
