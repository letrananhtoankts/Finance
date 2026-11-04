# Nhật ký cập nhật

## [Chưa phát hành] — Hiện ảnh giao nhận dưới phiếu
- **Giao nhận → chi tiết phiếu**: ảnh giao nhận hiện thành các ô xem trước ngay dưới phiếu (nhiều tấm), bấm vào ô để mở ảnh lớn; PDF hiện ô biểu tượng.
- Có ô **+ Thêm ảnh** để tải thêm nhiều ảnh/file một lần.
- Không thay đổi CSDL.

## [Chưa phát hành] — Sale không thấy Tổng quan
- Vai trò **Sale**: ẩn mục **Tổng quan** (tổng giá trị tài sản công ty) ở thanh bên và thanh dưới điện thoại.
- Sale đăng nhập vào thẳng **Giao nhận**; link cũ trỏ vào Tổng quan cũng tự chuyển sang Giao nhận.
- Các vai trò khác không đổi. Không thay đổi CSDL.

## [Chưa phát hành] — Sửa lỗi hiển thị ô tick ở màn Người dùng
- Ô tick chọn khách hàng / dự án gán riêng bị kéo giãn và lệch xa tên; đã đặt lại kích thước đúng.

## [Chưa phát hành] — Đăng nhập bằng ID
- **Đăng nhập:** ô nhập đổi thành "ID đăng nhập"; ID không có `@` được tự thêm đuôi `@truongthinhequip.com`. Vẫn đăng nhập được bằng email đầy đủ.
- **Người dùng:** tạo tài khoản bằng ID; cột hiển thị ID.
- Lưu ý: địa chỉ ghép ra không phải hộp thư thật nên không dùng "quên mật khẩu qua email" — admin đặt lại mật khẩu.

## [Chưa phát hành] — Danh mục chuẩn Trường Thịnh (bảng giá 01/10/2026)
- **Danh mục**: thêm 2 cột **Trọng lượng (kg, ±5%)** và **Lớp mạ** (kẽm nóng/kẽm lạnh/sơn dầu/gang đúc/xi mạ); xem và sửa được ở từng thiết bị.
- Thêm **Xà gồ vuông 50x50x1.8, L=1500** (trị giá 84.000, 4,2 kg).
- Sửa trị giá **Xà gồ hộp L=1500**: 123.000 → 124.000.
- Gộp mã trùng: `XGH1500B` → `XGH1500`; `CD1200` → `NECD1200` (toàn bộ phiếu, tài sản, đơn giá, kế hoạch chuyển sang mã giữ lại).
- Sắp xếp lại thứ tự và nạp trọng lượng + lớp mạ cho cả 50 chủng loại theo bảng giá chuẩn.
- **Cần chạy SQL** `sql/2026-11-04_danh-muc-chuan.sql` trên Supabase TRƯỚC khi Merge (thêm cột mới).

## [Chưa phát hành] — Đổi mật khẩu
- Thanh trên cùng (mọi vai trò): thêm nút **Đổi mật khẩu** cạnh nút Đăng xuất.
- Cửa sổ đổi mật khẩu: nhập mật khẩu hiện tại, mật khẩu mới (tối thiểu 8 ký tự), nhập lại để xác nhận.
- Mật khẩu hiện tại được xác minh trước khi đổi; mỗi người chỉ đổi được mật khẩu của chính mình.
- Điện thoại: ẩn tên và nhãn vai trò trên thanh trên để vừa nút mới.
- Không thay đổi CSDL Supabase.

## [Chưa phát hành] — Phân quyền Sale nhiều khách hàng + theo dự án
- **Người dùng**: Sale được tick **nhiều khách hàng** và/hoặc **gán riêng từng dự án**; cột "Phụ trách" hiển thị cả hai.
- **Đối tác → Dự án**: Admin có khối "Sale theo sát dự án này" để gán/bỏ Sale cho từng dự án.
- Quy tắc: Sale thấy mọi dự án của khách hàng được gán + đúng các dự án được gán riêng. Sale chỉ được gán 1 dự án thì chỉ thấy dự án đó.
- **Vá lỗi bảo mật**: (1) Sale từng xem được phiếu giao nhận của mọi khách hàng; (2) Sale tự đổi được vai trò của mình thành Admin. Cả hai đã được chặn ở CSDL.
- Cần chạy `sql/2026-11-03_phan-quyen-sale.sql` trên Supabase TRƯỚC khi Merge (không chạy thì màn Người dùng báo lỗi).

## [Chưa phát hành] — Hai cột "Hàng gửi thanh lý" / "Hàng gửi trả lại"
- **Giao nhận → chi tiết phiếu:** sau cột "SL thực nhận" có thêm 2 cột **Hàng gửi thanh lý** và **Hàng gửi trả lại**. Lúc xác nhận phiếu nhập 2 số này (mặc định 0); không cho tổng 2 số lớn hơn số thực nhận.
- **Tình trạng** chỉ còn **Mới / Cũ** (chọn ở ô thả xuống khi xác nhận, mặc định Mới); cột thu hẹp để nhường chỗ cho 2 cột mới. Phiếu cũ tự quy về Mới/Cũ khi hiển thị.
- **CSDL:** thêm 2 cột `qty_thanh_ly`, `qty_tra_lai` vào `transfer_note_items` (mặc định 0, đã chạy).
- Hiện **chỉ ghi nhận**, chưa trừ vào tồn kho (Tài sản/Tổng quan) và bảng kê.
