# Lái Xe Hộ — các kết quả bàn giao

- [x] **Website và app khách:** cùng codebase Expo responsive; form đặt tài xế có điểm đón/đến, giờ chạy, loại xe, điện thoại, ghi chú; báo giá tự cập nhật gồm phí mở cuốc, km × đơn giá, phụ phí và mức sàn; hiển thị rõ nguồn km, giữ chế độ ước tính thủ công và bổ sung tuyến đường Google Maps thật; xác nhận tạo cuốc và trang chuyến của tôi có timeline, giá snapshot và hủy khi phù hợp.
- [x] **Đăng ký và app tài xế:** onboarding tên, điện thoại, GPLX, kinh nghiệm, khu vực và thông tin xe; trạng thái hồ sơ; tài xế chưa được duyệt không nhận cuốc; tài xế được duyệt bật/tắt sẵn sàng, xem lời mời, nhận/từ chối, chuyển trạng thái tuần tự đã nhận → đang đến → đã gặp khách → đang chạy → hoàn tất; lịch sử và thu nhập dựa trên cuốc hoàn tất.
- [x] **Admin bao quát tất cả tính năng:** tổng quan cuốc hôm nay/chờ/đang chạy, tài xế online/đã xác minh và doanh thu ước tính; tìm/lọc/xem cuốc và timeline; đẩy cuốc đến một hoặc nhiều tài xế đủ điều kiện hoặc đề xuất theo khu vực; quan sát nhận/từ chối và điều phối lại; quản lý hồ sơ/khu vực/sẵn sàng tài xế, duyệt/từ chối thủ công có lý do; quản lý bảng giá hiệu lực và nhật ký vận hành.
- [x] **Đồng bộ dữ liệu và bảo mật:** Manus OAuth thật; Admin chỉ chủ dự án hoặc tài khoản có quyền server; MySQL nguồn dữ liệu chung cho Web và native; tRPC guards/ownership; polling và invalidation sau mutation; transaction nhận cuốc chống hai tài xế nhận cùng cuốc và chống tài xế nhận nhiều cuốc đang chạy; dữ liệu minh họa rõ nhãn không giả đăng nhập hay giả hoạt động thực.
- [ ] **Nhận diện và bàn giao:** giao diện tiếng Việt xanh Lái Hộ #0C8B78, responsive Web/mobile; icon native riêng, logoUrl HTTPS; starter Expo giữ nguyên appSlug/scheme/bundle IDs và ports 8081+3000; migration schema thành công, typecheck và unit test; read-only validation agent; checkpoint được ghi nhận; Preview chạy cả Metro và API; không tuyên bố APK/iOS release, eKYC/SMS/GPS nền/thu tiền live đã triển khai.

## Bằng chứng và giới hạn

Bản MVP ban đầu: 53/53 unit test qua, TypeScript và lint tệp thay đổi sạch. Expo Web export và backend build qua. HTTP Metro/health/quote/pricing 200; snapshot thiếu đăng nhập 401. Migration schema đã áp dụng; chuỗi migration sửa lệnh tạo trùng có kiểm thử tĩnh. Read-only validator đã truy vết luồng và các lỗi cụ thể của lượt rà soát đã được sửa kèm regression test.

Chưa thực hiện vòng OAuth nhà cung cấp thật, kiểm thử điện thoại vật lý, replay migration trên database mới độc lập hoặc thử tải nhận cuốc đồng thời trên database dùng chung. Checkbox bàn giao còn chờ xác nhận checkpoint; các thành phần nhận diện/build/runtime đã có bằng chứng.

## Mở rộng thanh toán và GPS

- [ ] **Thanh toán trực tuyến khách/tài xế:** VNPay sandbox mở trong browser trên web/native; chỉ khách sở hữu cuốc hoàn tất được trả giá server snapshot; user/ride/TxnRef linkage; session chống tạo trùng; không lưu thẻ; IPN GET `/api/payments/vnpay/ipn` kiểm tra HMAC SHA512, merchant, giá VND × 100 và TxnRef và deduplication; return chờ xử lý/hủy không giả paid; lịch sử thanh toán gồm cuốc, ngày, tiền, trạng thái; tài xế/Admin xem trạng thái đúng quyền; trạng thái sandbox/live minh bạch.
- [x] **Bản đồ và báo giá:** Google Maps thật cho website/app; tìm địa chỉ và lấy vị trí khách làm điểm đón; tuyến đường/quãng đường/thời gian từ Directions; báo giá và booking dùng route token server xác minh; marker đón/đến và polyline; khi lỗi có thông báo không giả kết quả, chế độ số km thủ công rõ nhãn giữ luồng cũ.
- [x] **GPS khách/tài xế đồng bộ:** xin quyền foreground khi người dùng thao tác; tài xế bật/tắt phát vị trí cho cuốc đã được phân công; khách theo dõi vị trí cuối + độ chính xác + thời điểm, không gọi là GPS live khi cũ; khóa ownership/actor server; tự dừng watcher khi background/kết thúc/hủy/gán lại; không tracking nền và không tự phát GPS khách liên tục; chỉ người trong cuốc và Admin xem, chỉ trả vị trí còn hạn.
- [ ] **Tích hợp/bàn giao mở rộng:** schema additive không seed người/cuốc/tiền/GPS giả; service Maps thật kiểm tra; VNPay sandbox merchant được cấu hình hoặc ghi rõ blocker; TypeScript/lint/unit test/export/backend build; read-only validator; push main và phân biệt checkpoint/publication; không tuyên bố live money, native-device hay webhook checkout e2e đã kiểm thử khi chưa có bằng chứng.

### Bằng chứng mở rộng

TypeScript sạch; 83/83 unit test trong 13 tệp qua; ESLint các tệp TypeScript đã thay đổi/tạo mới không có lỗi/cảnh báo mã. Export Expo Web có trang payment return và backend build qua; HTTP Web/health 200. Maps browser script dùng frontend origin HTTP 200, Directions/quãng đường thật, báo giá server dùng km đã ký và từ chối token sửa HTTP 400; GPS chưa đăng nhập HTTP 401. Migration 0004/0005/0006 đã áp dụng và drizzle-kit check qua. Read-only validator đã truy vết các vai trò; lỗi map origin và origin thanh toán thứ hai đã được sửa với test hồi quy. Phiên GPS server thu hồi token khi dừng, nên request cũ không bật lại chia sẻ.

Mã UI/API/HMAC/IPN VNPay đã tích hợp; cổng chưa hoạt động do form merchant bị người dùng hủy và chưa có TMN Code/Hash Secret. Thanh toán còn mở để phản ánh việc chưa kích hoạt/chưa chạy checkout-IPN sandbox end-to-end, không mở lại form tự động. Không thử GPS/native trên điện thoại vật lý; không thu tiền live, GPS nền, payout/refund. Bàn giao còn chờ thẻ xác nhận checkpoint, source được chuẩn bị để push canonical main; chưa publish.

## Tài khoản nội bộ (không Manus OAuth)

- [x] **Khách hàng:** trang tài khoản có luồng đăng nhập và tạo tài khoản email/mật khẩu riêng; email chuẩn hóa, mật khẩu tối thiểu 8 ký tự, scrypt + salt, session Web/native riêng; không trả password hash.
- [x] **Tài xế:** trang tài khoản có đăng nhập và đăng ký tài xế riêng; đăng ký không tự cấp admin và hồ sơ tài xế vẫn chờ duyệt vận hành.
- [x] **Quản trị:** chỉ có đăng nhập admin, không có đăng ký admin công khai; trang Tài khoản hiển thị hồ sơ thật, đăng xuất và đổi mật khẩu. Bootstrap admin một lần qua secret `LOCAL_ADMIN_*` đã được nhập bảo mật; không chứa bí mật trong repo.
- [x] **Phân quyền/bảo mật:** API chỉ chấp nhận session local ký bằng `LOCAL_AUTH_SESSION_SECRET`; web cookie `__Host-laiho_session_*` hợp lệ Preview HTTPS, native Bearer/SecureStore; admin procedures vẫn server guard. OAuth app route không còn đăng ký trong API runtime.
