import { StyleSheet, Text, View } from "react-native";
import { trpc } from "@/lib/trpc";
import { formatDate, formatMoney } from "@/shared/domain";
import { PAYMENT_LABELS } from "@/shared/payments";
import {
  Button,
  Card,
  COLORS,
  Empty,
  Notice,
  Pill,
  SectionTitle,
} from "@/components/laiho/ui";

type Props = { demo: boolean; authenticated: boolean; onLogin: () => void };
export function PaymentsHistory({ demo, authenticated, onLogin }: Props) {
  const status = trpc.payments.status.useQuery(undefined, { staleTime: 30000 });
  const history = trpc.payments.history.useQuery(undefined, {
    enabled: authenticated && !demo,
    refetchInterval: 10000,
    retry: false,
  });
  return (
    <View style={{ gap: 20 }}>
      <SectionTitle
        title="Lịch sử thanh toán"
        subtitle="Dữ liệu từ cổng được xác minh và lưu theo từng cuốc."
      />
      <Notice
        text={
          status.data?.available
            ? status.data.mode === "test"
              ? "Cổng ở chế độ thử nghiệm. Không dùng thẻ thật; không thu tiền thật."
              : "Cổng đang cấu hình live. Chỉ thanh toán sau khi kiểm tra số tiền tại cổng."
            : (status.data?.reason ?? "Đang kiểm tra cấu hình cổng…")
        }
        tone={status.data?.available ? "blue" : "amber"}
      />
      {demo ? (
        <Card>
          <Empty
            title="Demo không có giao dịch thật"
            subtitle="Đăng nhập bằng tài khoản của bạn để xem lịch sử được cấp quyền."
          />
          <Button title="Đăng nhập" onPress={onLogin} />
        </Card>
      ) : !authenticated ? (
        <Card>
          <Empty
            title="Đăng nhập để xem thanh toán"
            subtitle="Chỉ khách sở hữu, tài xế được phân công và Admin có quyền xem."
          />
          <Button title="Đăng nhập" onPress={onLogin} />
        </Card>
      ) : history.error ? (
        <Notice text={history.error.message} tone="red" />
      ) : history.isLoading ? (
        <Notice text="Đang tải lịch sử thanh toán…" />
      ) : history.data?.length ? (
        history.data.map((item) => (
          <Card key={item.id} style={{ gap: 11 }}>
            <View style={s.row}>
              <Text style={s.code}>{item.rideCode}</Text>
              <Pill
                label={PAYMENT_LABELS[item.status]}
                tone={item.status === "paid" ? "green" : "amber"}
              />
            </View>
            <Text style={s.amount}>{formatMoney(item.amount)}</Text>
            <Text style={s.copy}>
              {formatDate(item.createdAt)} · {item.provider} ·{" "}
              {item.currency.toUpperCase()}
            </Text>
            {item.paidAt ? (
              <Text style={s.copy}>Đã xác nhận: {formatDate(item.paidAt)}</Text>
            ) : null}
          </Card>
        ))
      ) : (
        <Card>
          <Empty
            title="Chưa có thanh toán trực tuyến"
            subtitle="Sau chuyến hoàn tất, mở chi tiết cuốc để trả tiền khi cổng đã được merchant kết nối."
          />
        </Card>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  code: { color: COLORS.ink, fontSize: 16, fontWeight: "700" },
  amount: { color: COLORS.primary, fontSize: 23, fontWeight: "800" },
  copy: { color: COLORS.muted, fontSize: 12, lineHeight: 19 },
});
