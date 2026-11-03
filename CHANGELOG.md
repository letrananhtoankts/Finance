# Nhật ký cập nhật

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
