# Lái Xe Hộ

Sản phẩm Expo/React Native/TypeScript dùng chung backend Express/tRPC và MySQL. Website và app khách/tài xế là các trải nghiệm theo vai trò từ cùng codebase, không phải hai APK/iOS release đã phát hành.

## Chạy và kiểm tra

`pnpm dev` chạy Metro/Web trên cổng 8081 và API trên cổng 3000. `pnpm check` kiểm tra TypeScript; `pnpm test` chạy kiểm thử; `pnpm db:push` sinh và áp dụng migration đã chủ động thay đổi. `pnpm exec expo export --platform web --output-dir dist-web` build website Expo Web. Migration dùng chung cơ sở dữ liệu giữa development và production; không xóa hoặc seed giả dữ liệu vận hành khi kiểm thử.

Lượt kiểm tra ngày 25/10/2026: TypeScript và lint các tệp đã thay đổi sạch; bộ unit test có kiểm tra quyền, OAuth, CORS, báo giá, trạng thái, expiry/thu hồi offer và hồi quy chuỗi migration. Export Expo Web và build backend thành công. HTTP website, health và báo giá trả 200; snapshot nghiệp vụ trả 401 khi chưa đăng nhập. Chưa thực hiện vòng đăng nhập OAuth thật, kiểm thử trên điện thoại vật lý, replay trên database mới độc lập hoặc tải đồng thời nhận cuốc trên database; các kiểm thử quyền/offer dùng context/domain mock, kiểm tra chuỗi migration là kiểm tra SQL tĩnh, không tạo tài khoản hay cuốc giả trong hệ thống.

## Sử dụng theo vai trò

Khách chọn điểm đón/đến hoặc nhập địa chỉ, xem số km ước tính, chọn loại xe và đi ngay/đặt trước. Báo giá lấy từ API và phân tích từng phí. Đăng nhập Manus thật trước khi đặt; chuyến mới vào trạng thái chờ điều phối. Tab Chuyến của tôi xem dữ liệu cá nhân và timeline. Điểm gợi ý TP.HCM dùng tọa độ cố định và hệ số khoảng cách ước tính, không phải kết quả bản đồ đường bộ.

Tài xế đăng nhập, vào Hồ sơ tài xế để khai báo thông tin, số GPLX và ghi chú đối soát. Người chưa được duyệt không nhận cuốc. Sau khi Admin duyệt, tài xế bật trạng thái sẵn sàng, vào Cuốc chờ và nhận/từ chối lời mời. Cuốc đã nhận chuyển tuần tự sang đang đến, đã gặp khách, đang chạy và hoàn tất. Thu nhập là số tính từ giá snapshot, chưa phải số tiền đã thanh toán.

Admin là chủ dự án được nhận diện từ OAuth/owner của starter hoặc tài khoản được cấp role admin phía server. Tài khoản khách/tài xế không tự chuyển thành admin qua nút đổi giao diện. Quản trị xem toàn bộ dữ liệu, duyệt/từ chối/tạm khóa hồ sơ có lý do, đẩy cuốc đến một hoặc nhiều tài xế đủ điều kiện, điều phối lại trước khi bắt đầu chạy, cập nhật bảng giá và xem nhật ký.

Chế độ minh họa sử dụng fixture riêng `lib/demo.ts`. Dữ liệu không được ghi vào MySQL, không mô phỏng tài khoản đã đăng nhập, không tạo cuốc hay tài xế ngoài đời thực; thao tác vận hành yêu cầu đăng nhập thật.

## Báo giá và đồng bộ

Bảng giá mặc định bằng VND: phí mở cuốc 80.000đ, 16.000đ/km, mức sàn 120.000đ; phụ phí đêm 40.000đ trong 22:00–06:00, cao điểm 20.000đ trong 07:00–09:00 và 17:00–19:00 (Asia/Ho_Chi_Minh). Xe số sàn phụ phí 20.000đ, xe cao cấp 30.000đ. Tỷ lệ hoa hồng cấu hình ban đầu 20%. Đây là giá khởi tạo sản phẩm, không phải bảng giá của nhà cung cấp dịch vụ thật.

Giá booking được tính lại ở server và lưu snapshot, không nhận giá hoặc customerId do frontend tự truyền. Thay đổi bảng giá chỉ ảnh hưởng báo giá mới. Snapshot dữ liệu được làm mới khoảng 8 giây và ngay sau thao tác; đây là polling, chưa phải WebSocket hoặc push notification.

## Bảo mật và giới hạn vận hành

JWT Manus được kiểm tra chữ ký, hạn dùng và appId. Web OAuth có nonce cookie dùng một lần; native có state ký, kiểm tra state đã lưu trong SecureStore rồi mới đổi mã. Các API quản trị có guard server; dữ liệu chuyến giới hạn theo người sở hữu/tài xế được phân công. Nhận cuốc dùng transaction để không hai người nhận cùng cuốc hoặc một người nhận hai cuốc đang hoạt động.

Xác minh trong phiên bản này là xét duyệt thủ công metadata tự khai, chưa có upload giấy tờ hay eKYC đối soát cơ quan cấp GPLX. Chưa tích hợp định tuyến chính xác, vị trí GPS live/nền, SMS/OTP, thông báo đẩy, thanh toán hay bảo hiểm dịch vụ. Cần nhà cung cấp, điều khoản và quy trình vận hành trước khi sử dụng với khách thật. Chưa có kiểm thử vòng OAuth nhà cung cấp thật hoặc trên thiết bị vật lý; unit test không thay thế kiểm thử thiết bị.

## Bàn giao mobile

Preview Web có thể dùng để xem giao diện và kiểm tra API. Với Expo Go, dùng Connect Expo trong Dashboard; nhập thông tin Expo qua form bảo mật của nền tảng và đăng nhập cùng tài khoản trong Expo Go. Sau checkpoint, Dashboard có thể build Android APK/AAB hoặc iOS/TestFlight; mã nguồn sẵn sàng không đồng nghĩa đã có artifact hay đã phát hành lên App Store/Google Play.

## Cấu trúc

`app/(tabs)/index.tsx` là shell responsive; `features/` gồm không gian Customer/Driver/Admin và RideDetail; `components/laiho/` là UI chung. `shared/domain.ts` chứa DTO và trạng thái. `server/domain-router.ts` khai báo API; `server/domain-db.ts` xử lý nghiệp vụ/transaction; `server/services/` xử lý báo giá/quy tắc. `drizzle/` chứa schema/migration. Icon và ảnh hero riêng đã tích hợp vào `assets/images/` và metadata Expo.
