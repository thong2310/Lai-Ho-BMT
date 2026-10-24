# Lái Xe Hộ — các kết quả bàn giao

- [x] **Website và app khách:** cùng codebase Expo responsive; form đặt tài xế có điểm đón/đến, giờ chạy, loại xe, điện thoại, ghi chú; báo giá tự cập nhật gồm phí mở cuốc, km × đơn giá, phụ phí và mức sàn; hiển thị rõ km ước tính chưa tích hợp định tuyến thực; xác nhận tạo cuốc và trang chuyến của tôi có timeline, giá snapshot và hủy khi phù hợp.
- [x] **Đăng ký và app tài xế:** onboarding tên, điện thoại, GPLX, kinh nghiệm, khu vực và thông tin xe; trạng thái hồ sơ; tài xế chưa được duyệt không nhận cuốc; tài xế được duyệt bật/tắt sẵn sàng, xem lời mời, nhận/từ chối, chuyển trạng thái tuần tự đã nhận → đang đến → đã gặp khách → đang chạy → hoàn tất; lịch sử và thu nhập dựa trên cuốc hoàn tất.
- [x] **Admin bao quát tất cả tính năng:** tổng quan cuốc hôm nay/chờ/đang chạy, tài xế online/đã xác minh và doanh thu ước tính; tìm/lọc/xem cuốc và timeline; đẩy cuốc đến một hoặc nhiều tài xế đủ điều kiện hoặc đề xuất theo khu vực; quan sát nhận/từ chối và điều phối lại; quản lý hồ sơ/khu vực/sẵn sàng tài xế, duyệt/từ chối thủ công có lý do; quản lý bảng giá hiệu lực và nhật ký vận hành.
- [x] **Đồng bộ dữ liệu và bảo mật:** Manus OAuth thật; Admin chỉ chủ dự án hoặc tài khoản có quyền server; MySQL nguồn dữ liệu chung cho Web và native; tRPC guards/ownership; polling và invalidation sau mutation; transaction nhận cuốc chống hai tài xế nhận cùng cuốc và chống tài xế nhận nhiều cuốc đang chạy; dữ liệu minh họa rõ nhãn không giả đăng nhập hay giả hoạt động thực.
- [ ] **Nhận diện và bàn giao:** giao diện tiếng Việt xanh Lái Hộ #0C8B78, responsive Web/mobile; icon native riêng, logoUrl HTTPS; starter Expo giữ nguyên appSlug/scheme/bundle IDs và ports 8081+3000; migration schema thành công, typecheck và unit test; read-only validation agent; checkpoint được ghi nhận; Preview chạy cả Metro và API; không tuyên bố APK/iOS release, Maps/eKYC/SMS/thanh toán/GPS nền đã triển khai.

## Bằng chứng và giới hạn

53/53 unit test qua, TypeScript và lint tệp thay đổi sạch. Expo Web export và backend build qua. HTTP Metro/health/quote/pricing 200; snapshot thiếu đăng nhập 401. Migration schema đã áp dụng; chuỗi migration sửa lệnh tạo trùng có kiểm thử tĩnh. Read-only validator đã truy vết luồng và các lỗi cụ thể của lượt rà soát đã được sửa kèm regression test.

Chưa thực hiện vòng OAuth nhà cung cấp thật, kiểm thử điện thoại vật lý, replay migration trên database mới độc lập hoặc thử tải nhận cuốc đồng thời trên database dùng chung. Checkbox bàn giao còn chờ xác nhận checkpoint; các thành phần nhận diện/build/runtime đã có bằng chứng.
