import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { trpc } from "@/lib/trpc";
import { checkoutReturnOrigin, openCheckout } from "@/lib/checkout";
import { formatDate, formatMoney, type Ride } from "@/shared/domain";
import { PAYMENT_LABELS } from "@/shared/payments";
import { Button, Card, COLORS, Notice, Pill, SectionTitle } from "./ui";

type Props = { ride: Ride; demo?: boolean; readOnly?: boolean };
export function RidePayment({ ride, demo = false, readOnly = false }: Props) {
  const overview = trpc.payments.overview.useQuery(
    { rideId: ride.id },
    { enabled: !demo, refetchInterval: 8000, retry: false },
  );
  const checkout = trpc.payments.checkout.useMutation();
  const reconcile = trpc.payments.reconcile.useMutation();
  const utils = trpc.useUtils();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const payment = overview.data?.payment;
  const config = overview.data?.configuration;
  async function pay() {
    if (
      demo ||
      readOnly ||
      checkout.isPending ||
      !overview.data?.canPay ||
      !config?.available
    )
      return;
    setError("");
    try {
      const session = await checkout.mutateAsync({
        rideId: ride.id,
        returnOrigin: checkoutReturnOrigin(),
      });
      setNotice(
        "Đang mở cổng trong trình duyệt. Trở lại ứng dụng để kiểm tra; chỉ kết quả được server xác minh mới là đã thanh toán.",
      );
      await openCheckout(session.url);
      await Promise.all([
        utils.payments.overview.invalidate({ rideId: ride.id }),
        utils.payments.history.invalidate(),
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Chưa mở được cổng thanh toán.",
      );
    }
  }
  async function check() {
    if (demo || readOnly || reconcile.isPending) return;
    setError("");
    try {
      await reconcile.mutateAsync({ rideId: ride.id });
      await Promise.all([
        overview.refetch(),
        utils.payments.history.invalidate(),
      ]);
      setNotice(
        "Đã tải lại trạng thái IPN được server xác minh. Nếu chưa có kết quả, vui lòng chờ thông báo từ VNPay.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Chưa kiểm tra được trạng thái.",
      );
    }
  }
  return (
    <Card style={{ gap: 13 }}>
      <SectionTitle
        title="Thanh toán cuốc"
        subtitle={
          demo
            ? "Dữ liệu minh họa không tạo giao dịch"
            : config?.mode === "test"
              ? "Cổng thử nghiệm · Không thu tiền thật"
              : config?.mode === "live"
                ? "Cổng trực tuyến · Xác minh phía server"
                : "Merchant chưa được cấu hình"
        }
      />
      <View style={s.row}>
        <Text style={s.amount}>
          {formatMoney(payment?.amount ?? ride.price)}
        </Text>
        <Pill
          label={PAYMENT_LABELS[payment?.status ?? "unpaid"]}
          tone={payment?.status === "paid" ? "green" : "amber"}
        />
      </View>
      {payment?.paidAt ? (
        <Text style={s.copy}>
          Xác nhận lúc {formatDate(payment.paidAt)} · {payment.provider}
        </Text>
      ) : null}
      {error || overview.error ? (
        <Notice
          tone="red"
          text={error || overview.error?.message || "Chưa lấy được trạng thái."}
        />
      ) : null}
      {notice ? <Notice text={notice} tone="blue" /> : null}
      {demo ? (
        <Notice
          text="Chế độ chỉ xem: không tạo thanh toán, không mô phỏng đã trả tiền."
          tone="amber"
        />
      ) : !config?.available ? (
        <Notice
          text={config?.reason ?? "Đang kiểm tra kết nối cổng thanh toán…"}
          tone="amber"
        />
      ) : null}
      {ride.status !== "completed" && payment?.status !== "paid" ? (
        <Text style={s.copy}>
          Thanh toán trực tuyến mở sau khi chuyến hoàn tất. Giá là snapshot của
          cuốc.
        </Text>
      ) : null}
      {!readOnly &&
      !demo &&
      overview.data?.canPay &&
      payment?.status !== "paid" ? (
        <Button
          title={
            payment?.status === "pending"
              ? "Tiếp tục tại cổng thanh toán"
              : "Thanh toán trực tuyến"
          }
          onPress={pay}
          icon="card-outline"
          loading={checkout.isPending}
          disabled={!config?.available || checkout.isPending}
        />
      ) : null}
      {!readOnly &&
      !demo &&
      config?.available &&
      payment &&
      payment.status !== "paid" ? (
        <Button
          title="Làm mới trạng thái IPN"
          variant="secondary"
          onPress={check}
          loading={reconcile.isPending}
        />
      ) : null}
      {readOnly ? (
        <Text style={s.copy}>
          Chỉ xem trạng thái. Tài xế không thu thẻ và không tự đánh dấu đã thanh
          toán.
        </Text>
      ) : (
        <Text style={s.copy}>
          Không lưu số thẻ/CVV. Đóng cổng hoặc quay về trang thành công không tự
          xác nhận đã trả tiền.
        </Text>
      )}
    </Card>
  );
}
const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  amount: { color: COLORS.primary, fontSize: 23, fontWeight: "800" },
  copy: { color: COLORS.muted, fontSize: 12, lineHeight: 19 },
});
