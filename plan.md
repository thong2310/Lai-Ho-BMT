# Kế hoạch triển khai Lái Xe Hộ

## Mục tiêu sản phẩm

Xây dựng **Lái Xe Hộ** bằng một codebase Expo/React Native/TypeScript dùng chung backend và MySQL, chạy trên Web (website khách + dashboard admin) và iOS/Android (app trải nghiệm khách/tài xế). Mỗi vai trò sẽ nhìn thấy giao diện, dữ liệu và thao tác đúng quyền của mình; mọi thay đổi cuốc xe, tài xế, báo giá và xác minh đều nằm trong cùng cơ sở dữ liệu để đồng bộ tức thời khi làm mới dữ liệu.

Phiên bản bàn giao đầu tiên là một MVP vận hành được với dữ liệu demo: có thể tạo báo giá, đặt cuốc, đưa cuốc vào hàng chờ, điều phối đến tài xế, nhận/từ chối cuốc, chuyển trạng thái chuyến, quản lý tài xế và xác minh trong Admin. Nó không tự nhận là dịch vụ gọi xe đang vận hành ngoài đời thực: vị trí định tuyến chính xác, eKYC, thông báo đẩy/SMS, thanh toán và định vị GPS nền cần tích hợp nhà cung cấp và thông tin pháp lý/vận hành sau đó.

## Phạm vi chức năng

### 1. Khách hàng — website và app khách

- Trang chủ với form **Đặt tài xế lái hộ**: điểm đón, điểm đến, thời điểm chạy, loại xe, số điện thoại và ghi chú.
- Báo giá tức thời, minh bạch: phí mở cuốc + quãng đường × đơn giá/km + phụ phí giờ cao điểm/ban đêm (nếu có), hiển thị từng thành phần, quãng đường ước tính và thời gian tài xế đến.
- Gợi ý các khu vực TP.HCM để demo quãng đường; khách cũng có thể nhập số km ước lượng. Sau này, lớp tính khoảng cách sẽ thay bằng kết quả Google Maps/nhà cung cấp bản đồ, không phải làm lại luồng đặt cuốc.
- Tạo cuốc sau khi xác nhận báo giá; theo dõi timeline: chờ điều phối → đã đẩy cuốc → tài xế đã nhận → đang đến → đang chạy → hoàn tất/hủy.
- Trang "Chuyến của tôi" với số tiền, tài xế, biển số/xe, ghi chú và lịch sử trạng thái.

### 2. App tài xế

- Onboarding đăng ký làm tài xế: thông tin cá nhân, số điện thoại, bằng lái, giấy tờ xe, kinh nghiệm, khu vực hoạt động và trạng thái hồ sơ.
- Bảng "Cuốc chờ" dành cho tài xế đã xác minh: xem điểm đón/điểm đến, giờ chạy, khoảng cách, giá/thu nhập hiển thị, khoảng cách tới điểm đón và thời hạn phản hồi.
- Nhận hoặc từ chối cuốc; khi nhận thành công, cuốc không còn sẵn với tài xế khác.
- Cập nhật trạng thái theo các bước "Đã nhận", "Đang đến", "Đã gặp khách", "Đang chạy", "Hoàn tất"; xem thu nhập và các cuốc gần đây.
- Tài xế chưa được xác minh chỉ thấy hồ sơ và trạng thái xét duyệt, không thể nhận cuốc.

### 3. Admin điều hành

- Tổng quan vận hành: cuốc hôm nay, cuốc đang chờ, cuốc đang chạy, tài xế online/đã xác minh và doanh thu ước tính.
- Quản lý toàn bộ cuốc xe: lọc theo trạng thái, tìm theo mã cuốc, mở chi tiết và timeline.
- **Đẩy cuốc**: chọn một/một nhóm tài xế đủ điều kiện hoặc tự động đề xuất theo khu vực/điểm đánh giá; lưu lịch sử từng lần điều phối.
- **Nhận cuốc**: quan sát tài xế nhận/từ chối, gán lại cuốc khi cần và cập nhật trạng thái điều phối.
- Quản lý tài xế: danh sách, hồ sơ, điểm đánh giá demo, khu vực, trạng thái hoạt động, bật/tắt khả năng nhận cuốc.
- **Xác minh**: hàng chờ hồ sơ, xem dữ liệu giấy tờ đã khai báo, duyệt/từ chối và lưu lý do. Cơ chế đầu tiên là xét duyệt thủ công của Admin; không mô phỏng một nhà cung cấp eKYC bên ngoài như thể đã xác minh thật.
- Quản lý bảng giá: phí mở cuốc, đơn giá/km, ngưỡng giờ cao điểm, phụ phí và mức sàn; báo giá mới dùng quy tắc đang có hiệu lực.
- Nhật ký vận hành các thay đổi nhạy cảm: tạo cuốc, đẩy cuốc, gán tài xế, duyệt/từ chối tài xế, chuyển trạng thái.

### 4. Đồng bộ và phân quyền

- Dùng Manus OAuth có sẵn để đăng nhập; sau lần đăng nhập đầu tiên, người dùng chọn/hoàn thiện vai trò Khách hoặc đăng ký Tài xế. Chủ dự án có vai trò Admin theo starter.
- tRPC + MySQL là nguồn dữ liệu chung. Màn hình tự làm mới sau mọi mutation; polling nhẹ cho danh sách cuốc trong MVP. Kết nối realtime WebSocket/Push có thể thêm khi có yêu cầu vận hành thực tế.
- Mọi API cập nhật chuyến, điều phối, xét duyệt và cấu hình giá kiểm tra vai trò phía server. Giao diện chỉ phản ánh quyền, không phải lớp bảo mật duy nhất.

## Thiết kế được chọn

### Ba hướng có thể cân nhắc

1. **Neo-mobility Việt Nam** (xác suất 0,08): xanh ngọc điện, thẻ sáng, trạng thái vận hành dễ quét — **chọn hướng này**.
2. **Premium chauffeur** (xác suất 0,06): than chì, đồng ánh kim, không khí concierge cao cấp.
3. **Utilitarian dispatch** (xác suất 0,04): trắng/xám, mật độ dữ liệu cao, ưu tiên dashboard vận hành.

### Hướng triển khai: Neo-mobility Việt Nam

- **Design movement:** Mobility dashboard hiện đại, gần gũi ứng dụng đặt xe Việt Nam nhưng tránh mô phỏng thương hiệu có sẵn.
- **Core principles:** hành động đặt/nhận cuốc luôn rõ ràng; trạng thái an toàn và dễ quét; giá minh bạch; ưu tiên thao tác một tay trên điện thoại.
- **Color philosophy:** xanh ngọc đậm tạo cảm giác tin cậy và chuyển động; vàng hổ phách dành cho trạng thái chờ/cần chú ý; xanh lá xác nhận thành công; nền xanh đen nhạt giảm chói khi theo dõi vận hành.
- **Layout paradigm:** mobile ưu tiên một cột với khối "cuốc hiện tại" nổi bật, thanh điều hướng đáy; Web Admin mở rộng thành thanh điều hướng trái + khu vực điều phối chính, không nhồi toàn bộ vào card lưới.
- **Signature elements:** đường hành trình có hai điểm đầu-cuối; chip trạng thái màu; mô-típ "vạch làn" mảnh làm đường ngăn khu vực.
- **Interaction philosophy:** giá thay đổi ngay khi chỉnh form; hành động không thể đảo ngược có bước xác nhận ngắn; trạng thái cuốc thay đổi bằng các nút tuần tự thay vì một menu mơ hồ.
- **Animation:** micro-animation 160–220ms cho báo giá, chip trạng thái và chuyển màn; không dùng chuyển động liên tục gây mất tập trung lúc điều phối.
- **Typography system:** sans-serif hệ thống với tiêu đề đậm, số tiền dùng tabular figures/đậm, mô tả 13–15px và tương phản đạt mức dễ đọc.
- **Brand essence:** "Đặt người lái đáng tin, về nhà an tâm." — chủ động, minh bạch, chăm sóc.
- **Brand voice:** rõ ràng và an tâm. Ví dụ: "Chúng tôi đã tính trước chi phí cho bạn." và "Cuốc này đang chờ một tài xế phù hợp nhận lời."
- **Wordmark & logo:** biểu tượng vô lăng tối giản ôm lấy chữ L, có điểm sáng như bánh xe đang lăn; không dựa vào chữ mặc định thuần túy.
- **Signature brand color:** `#0C8B78` (Xanh Lái Hộ).

## Kiến trúc kỹ thuật

- **Client:** Expo Router, React Native, NativeWind, React Query và tRPC; responsive trên Expo Web cho website/admin và native cho mobile.
- **API:** Express/tRPC trong starter, bảo vệ procedure bằng session Manus OAuth và guard theo vai trò.
- **Data:** Drizzle/MySQL. Cơ sở dữ liệu chung cho cả Web và app.
- **Báo giá:** `quoteService` thuần phía server với `PricingRule`; dữ liệu khởi tạo theo VND, luôn trả `breakdown` để UI hiển thị minh bạch.
- **Điều phối:** tạo ride ở trạng thái `PENDING_DISPATCH`; admin tạo dispatch offer cho tài xế; mutation `acceptOffer` dùng transaction/điều kiện trạng thái để không giao một cuốc cho hai người.
- **Tài sản app:** logo/app icon riêng của Lái Xe Hộ trước checkpoint.

## Mô hình dữ liệu triển khai

- `users`: tài khoản OAuth, giữ vai trò `user` của starter cho khách và bổ sung `driver | admin`.
- `drivers`: hồ sơ, khu vực, trạng thái sẵn sàng, số GPLX, ghi chú giấy tờ tự khai, xác minh và lý do. Chưa triển khai upload giấy tờ/eKYC, không lưu tài liệu cá nhân giả.
- `pricing_settings`: cấu hình hiệu lực cho bảng giá và phụ phí.
- `rides`: mã cuốc, điểm đón/điểm đến, km, giờ hẹn, báo giá snapshot, trạng thái, khách/tài xế.
- `offers`: lần đẩy cuốc, người nhận, trạng thái gửi/nhận/từ chối/hết hạn.
- `ride_events`: timeline và audit log theo cuốc.

## Cấu trúc project triển khai

```text
app/
  (tabs)/                 # Shell responsive và điều hướng trạng thái theo vai trò
  oauth/                  # Callback đăng nhập native có kiểm tra state
features/
  CustomerWorkspace.tsx   # Đặt cuốc, báo giá, lịch sử, trợ giúp
  DriverWorkspace.tsx     # Hồ sơ, lời mời, cuốc đang chạy, thu nhập
  AdminWorkspace.tsx      # Dashboard, điều phối, xét duyệt, giá, nhật ký
  RideDetail.tsx          # Chi tiết và timeline/lời mời dùng chung
components/
  laiho/ui.tsx            # Button, input, trạng thái, thẻ, hành trình, empty state
lib/
  demo.ts                 # Fixture minh họa chỉ đọc, không ghi vào database
  trpc.ts                 # API client dùng chung Web/native
server/
  routers.ts              # Gộp auth/system và API nghiệp vụ
  domain-router.ts        # Guard/validation booking, driver, admin, workspace
  domain-db.ts            # Query, ownership, transaction và DTO
  services/quote.ts       # Quy tắc báo giá minh bạch
  services/rules.ts       # Trạng thái, khả dụng, giá và kiểm tra dữ liệu
  _core/oauth-state.ts    # State/nonce và allowlist callback
shared/
  domain.ts               # Status, DTO, địa điểm gợi ý và định dạng dùng chung
drizzle/
  schema.ts               # Schema Drizzle + migration sinh ra
plan.md
TODO.md
```

## Luồng bàn giao và giới hạn tích hợp

1. Thiết lập schema/migration không phá hủy và dữ liệu giá khởi tạo có kiểm soát.
2. Xây API/guards và seed dữ liệu demo rõ nhãn để hiển thị luồng Customer–Driver–Admin.
3. Xây giao diện web/mobile responsive, bao gồm đầy đủ ba không gian vai trò.
4. Chạy migration, typecheck/lint và kiểm tra API/luồng chính; tạo checkpoint Manus. App Expo sẽ sẵn sàng quét/chạy trên Expo Go, còn APK/iOS release cần được khởi chạy từ Dashboard sau checkpoint.

Các tích hợp cần bổ sung thông tin/quyền nhà cung cấp trước khi dùng thực tế: Google Maps hoặc nhà cung cấp định tuyến (khoảng cách/thời gian chính xác), eKYC/đối soát GPLX, cổng thanh toán, SMS/OTP, thông báo đẩy và chính sách bảo vệ dữ liệu cá nhân. Tôi sẽ không tự tạo khóa hoặc tuyên bố đã kết nối các dịch vụ đó.
