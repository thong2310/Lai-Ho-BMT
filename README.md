# Lái Xe Hộ

Expo/React Native/TypeScript dùng chung backend Express/tRPC và MySQL. Website, ứng dụng khách và ứng dụng tài xế là trải nghiệm theo vai trò từ cùng codebase; không phải hai APK/iOS release đã phát hành.

## Chạy và kiểm tra

`pnpm dev` chạy Metro/Web 8081 và API 3000. Có thể chạy `pnpm dev:metro` và `pnpm dev:server` thành hai tiến trình độc lập. `pnpm check` kiểm tra TypeScript, `pnpm test` chạy unit test, `pnpm db:push` sinh/áp dụng migration chỉ khi schema thay đổi. `pnpm exec expo export --platform web --output-dir dist-web` xuất website; `pnpm build` build backend. Development và production dùng cùng database; không seed tài xế/cuốc/giao dịch/GPS giả vào hệ thống.

## Khách hàng

Ở **Đặt tài xế**, tìm địa chỉ trên Google Maps hoặc chọn điểm thường dùng. Chọn kết quả để lưu đúng tọa độ; nếu chỉ nhập văn bản, bấm **Xác định địa chỉ & tính tuyến**. **Dùng vị trí của tôi** xin quyền GPS khi bạn thao tác để điền điểm đón. Khách không tự phát GPS liên tục. Bản đồ hiển thị điểm đón A xanh, điểm đến B vàng và tuyến đường đường bộ. Quãng đường/ETA từ Google Directions được server ký; báo giá và giá cuốc được server tính lại/lưu snapshot, không nhận giá hay customerId tự truyền.

Nếu Maps không có kết quả, chuyển sang **Km thủ công**; đây là số km ước tính chưa xác minh, không giả lộ trình hay tọa độ. Bổ sung điện thoại, loại xe, đi ngay/đặt trước (giờ Việt Nam) và ghi chú. Đăng nhập Manus trước khi đặt; Admin điều phối cuốc mới. Tab **Chuyến của tôi** mở chi tiết gồm timeline, GPS tài xế khi tài xế bật chia sẻ và thẻ thanh toán.

Thanh toán VNPay sandbox chỉ mở cho khách sở hữu cuốc **đã hoàn tất**. Tài xế/Admin không tự đánh dấu đã trả tiền. Nút mở trang VNPay trong trình duyệt trên web/native. Tab **Thanh toán** chứa lịch sử cuốc, giá, ngày và trạng thái. **Làm mới trạng thái IPN** tải dữ liệu đã được server xác minh; không thực hiện VNPay querydr và không tự coi redirect/params URL là chứng từ.

## Tài xế và quản trị

Tài xế đăng nhập, vào **Hồ sơ tài xế**, khai báo tên/điện thoại/GPLX/kinh nghiệm/khu vực/thông tin xe. Admin duyệt thủ công trước khi được online/nhận cuốc. **Cuốc chờ** nhận/từ chối lời mời; cuốc đã nhận chuyển tuần tự đã nhận → đang đến → đã gặp khách → đang chạy → hoàn tất. Thu nhập vẫn là phần cước snapshot, không phải khoản tiền tự động chuyển về ngân hàng.

Ở cuốc đang thực hiện, **Bật chia sẻ GPS** xin quyền vị trí foreground. Chỉ tài xế đã xác minh được phân công cuốc đó có thể phát GPS. Tài xế **Dừng chia sẻ**, đóng màn hình, chuyển app/tab ra nền hoặc kết thúc chuyến thì watcher dừng; không tự bật lại khi quay về. Khách/tài xế/Admin đúng quyền xem tọa độ cuối, thời điểm server nhận và độ chính xác. Dữ liệu hơn 2 phút được đánh dấu cũ, hơn 15 phút không trả vị trí. Không có GPS nền khi khóa màn hình hay đóng app.

Admin được cấp role phía server (chủ dự án/OAuth hoặc tài khoản được cấp quyền), không phải nút đổi giao diện. Admin xem thống kê, cuốc/timeline/GPS/thanh toán, duyệt/từ chối/tạm khóa hồ sơ có lý do, đẩy cuốc tới tài xế đủ điều kiện, điều phối lại trước khi chạy, cấu hình bảng giá và nhật ký. Không có tự động chi trả/hoàn tiền/đối soát ngân hàng.

## Kích hoạt VNPay sandbox

Người dùng đã chọn VNPay sandbox sau khi Stripe được quản lý báo khu vực không hỗ trợ. Form khóa merchant đã được người dùng hủy ngày 25/10/2026. Do đó cổng hiện **chưa kích hoạt**; không tạo URL giao dịch hay dữ liệu đã thanh toán giả, không thu tiền thật. Khi có tài khoản merchant và bạn yêu cầu, nhập `VNPAY_TMN_CODE` và `VNPAY_HASH_SECRET` qua form bảo mật. Không gửi khóa trong chat/source/Git/log. Cần đồng bộ môi trường và khởi động lại API sau khi lưu khóa.

VNPay sandbox dùng cố định `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html`. Merchant đăng ký IPN HTTPS tới API origin hiện hành + `/api/payments/vnpay/ipn`. Origin được lấy từ biến runtime (`EXPO_PUBLIC_API_BASE_URL` cho API, `EXPO_WEB_PREVIEW_URL` cho frontend); không suy ra từ Host client. Khi publish/native release sau này, cấu hình origin HTTPS tương ứng và cập nhật IPN merchant; không lưu hostname Preview tạm vào source.

VNPay 2.1.0 ký HMAC SHA512. Amount gửi VNPay là VND × 100. Chỉ IPN chữ ký hợp lệ, đúng merchant/TxnRef/số tiền, ResponseCode và TransactionStatus cùng `00` mới ghi paid. Callback lặp không thu/ghi tiền lần nữa, paid không lùi về failed. Return URL chỉ hiển thị chờ xác minh. Chưa có khóa merchant nên chưa thực hiện giao dịch sandbox hay vòng callback end-to-end thật.

## Giá, đồng bộ và bảo mật

Giá khởi tạo VND: mở cuốc 80.000đ, 16.000đ/km, sàn 120.000đ; đêm 40.000đ (22:00–06:00), cao điểm 20.000đ (07:00–09:00, 17:00–19:00; Asia/Ho_Chi_Minh). Xe số sàn thêm 20.000đ, cao cấp 30.000đ; hoa hồng khởi tạo 20%. Admin có thể thay đổi. Đây là cấu hình sản phẩm, không phải bảng giá của hãng dịch vụ thực. ETA/quãng đường Google là ước tính; chưa gồm phí cầu đường/đỗ xe phát sinh.

Snapshot nghiệp vụ polling khoảng 8 giây, GPS khoảng 5 giây khi màn hình hoạt động; không phải WebSocket hoặc push notification. JWT kiểm tra chữ ký/hạn/appId, OAuth có nonce/state, web cookie cross-site phù hợp Preview, native token trong SecureStore. Server guards giới hạn đúng người trong cuốc; transaction nhận cuốc chống nhận trùng. Chế độ demo `lib/demo.ts` chỉ xem, không ghi MySQL, không mô phỏng đăng nhập, tiền hay điểm GPS hiện tại.

## Phạm vi kiểm tra và phát hành

Maps proxy geocoding/Directions thật đã trả HTTP 200/Google OK; migration GPS/thanh toán additive đã áp dụng. Kiểm thử unit dùng mocks riêng cho chữ ký, giá, quyền và trạng thái; không tạo giao dịch thử lên database chung. Kiểm tra cuối: TypeScript và lint tệp TypeScript đã đổi sạch, 83/83 unit test trong 13 tệp qua; Expo Web export và backend build thành công. Endpoint HTTP Web/health/Maps hoạt động, route token bị sửa bị từ chối; read-only validator đã truy vết các luồng và lỗi được sửa với hồi quy. Không xem kiểm thử web là bằng chứng GPS trên iPhone/Android.

Chưa kiểm thử vòng OAuth nhà cung cấp thật, GPS trên điện thoại vật lý, merchant VNPay checkout/IPN end-to-end hoặc tải đồng thời ngoài đời thực. Chưa có background tracking, SMS/OTP, thông báo đẩy, upload/eKYC đối soát GPLX, bảo hiểm dịch vụ, hoàn tiền hay chi trả tự động. Cần hoàn tất điều khoản/quy trình vận hành trước phục vụ khách thật.

Dashboard **Connect Expo** chuẩn bị Expo Go; đăng nhập cùng tài khoản Expo và dùng QR Dashboard. Khi chạy trong Expo Go, OAuth dùng callback `exp/exps://.../--/oauth/callback`; khi chạy bản native standalone, OAuth dùng scheme riêng của app. Nếu đang mở bundle cũ, reload Expo Go sau khi cập nhật. Build APK/AAB/iOS/TestFlight từ checkpoint bằng Dashboard. Chưa có release artifact/App Store/Google Play chỉ từ việc source build qua.

## Cấu trúc

`app/(tabs)/index.tsx` shell và menu vai trò; `app/payments/return.tsx` return không tự xác nhận paid. `features/` Customer/Driver/Admin/RideDetail/PaymentsHistory; `components/laiho/` UI chung, LocationSearch, RideMap theo nền tảng, RideTracking và RidePayment. `hooks/` quyền GPS/lifecycle foreground; `shared/` domain/mobility/payment DTO.

`server/domain-router.ts` và `domain-db.ts` nghiệp vụ cuốc; `server/maps/` geocoding/Directions/route token/map embed; `server/location-router.ts` quyền GPS; `server/payments/` signer/checkout/IPN/guards. `drizzle/` schema/chuỗi migration. Icon và hero gốc giữ trong bundle và logo HTTPS.
