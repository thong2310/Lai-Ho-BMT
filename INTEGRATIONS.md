# Thanh toán và GPS — nguồn kỹ thuật/trạng thái

Google Maps proxy đã trả HTTP 200 và Google `OK` cho geocoding Nhà hát Thành phố Hồ Chí Minh và tuyến tới Landmark 81 trong ngày 25/10/2026. Tuyến trả 4.664m/785 giây ở thời điểm kiểm tra, không phải cam kết ETA cố định. Không ghi key trong tài liệu.

Provision Stripe được quản lý đã bị từ chối `country_not_supported`; không có test/live key hay webhook được cấp. Người dùng đang chọn cổng merchant thay thế qua câu hỏi; phần Maps/GPS triển khai độc lập. Không tự tạo tài khoản Stripe ở khu vực khác.

Tài liệu đối chiếu: [Expo Location](https://docs.expo.dev/versions/latest/sdk/location/) xác nhận `watchPositionAsync` chỉ hoạt động foreground và cần quyền người dùng. [Stripe currencies](https://docs.stripe.com/currencies) phân biệt minor units/zero-decimal/minimum; không chuyển VND thành USD giả định và không nhân tiền tùy tiện. Native GPS chưa kiểm thử trên thiết bị thật. Quyền background không bật.

## VNPay sandbox được chọn

Người dùng chọn VNPay sandbox ngày 25/10/2026. Tài liệu chính thức: [Thanh toán PAY/IPN](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html). Version 2.1.0; HMACSHA512 trên query đã sắp xếp/encode theo mẫu Node; `vnp_Amount` bằng giá VND nhân 100. IPN là GET qua HTTPS; kiểm tra chữ ký trước cập nhật, kiểm tra số tiền/TMN Code/TxnRef; paid chỉ khi cả ResponseCode và TransactionStatus `00`. IPN response JSON RspCode/Message: 00 cập nhật, 02 đã cập nhật; 01/04/97/99 retry phía VNPay. Return URL không phải IPN và không tự thay đổi trạng thái paid.

Endpoint cổng thử nghiệm: `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html`. Cần `VNPAY_TMN_CODE` và `VNPAY_HASH_SECRET` nhận từ merchant qua form bảo mật. IPN phải được đăng ký trong tài khoản merchant tới endpoint HTTPS `/api/payments/vnpay/ipn`; không có giao dịch nào được tạo khi khóa chưa được cấp. Không thu thẻ hay chuyển tiền thật trong sandbox.

## Origin bản đồ tương tác

Kiểm tra HTTP ngày 25/10/2026 cho thấy browser-key Maps không chấp nhận origin của API 3000 (`project origin not matched`), nhưng chấp nhận frontend Preview runtime. Vì vậy Web dùng HTML Maps trong iframe `srcDoc` kế thừa origin frontend; native dùng WebView HTML với `baseUrl` frontend runtime. HTML/config chỉ có browser key công khai, không có server credential. Không hardcode hostname Preview. Khi đổi domain/phát hành phải kiểm tra lại origin browser-key và cấu hình runtime; chưa coi kiểm tra HTTP header là kiểm thử GPS/bản đồ thực trên thiết bị.
