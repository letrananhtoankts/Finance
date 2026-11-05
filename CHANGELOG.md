# Nhật ký cập nhật

## [Chưa phát hành] — Bố cục file Excel bảng kê
- Dòng "Hợp đồng nguyên tắc… số…, ký ngày…" chuyển xuống ngay dưới tên công trình; dòng "Từ ngày – Đến ngày" nằm dưới nữa, căn giữa.
- Khối **TỔNG PHÁT SINH TRONG KỲ / THUẾ VAT / TỔNG THANH TOÁN**: nhãn gộp ô và căn phải, số căn phải — không còn bị cắt chữ.
- "BÊN CHO THUÊ / BÊN THUÊ" và "(Ký, ghi rõ họ tên)" căn giữa, chừa sẵn khoảng trống bên dưới để ký tay khi in.
- Không thay đổi CSDL.

## [Chưa phát hành] — Chuẩn hóa cách ghi tên
- Tên khách hàng/đối tác tự **IN HOA** (VD: CÔNG TY CỔ PHẦN ABC); tên dự án tự **viết hoa chữ cái đầu mỗi từ** (VD: Dự Án Diamond Sky). Tự định dạng khi rời ô nhập và khi lưu.
- Tùy chọn: file `sql/2026-11-05_chuan-hoa-ten.sql` sửa các tên đã có (có câu xem trước).

## [Chưa phát hành] — Sale tạo dự án; đổi tên kho
- **Sale được tạo dự án** (trước đây báo "violates row-level security policy"). Dự án Sale tạo ra tự được gán cho chính Sale đó nên vẫn thấy. **Cần chạy file SQL `sql/2026-11-05_sale-tao-du-an.sql`.**
- Kho "Kho lớn" đổi tên thành **Kho Trường Thịnh-BD** (cùng file SQL).

## [Chưa phát hành] — Đơn hàng làm lại theo dự án
- **Đơn hàng** mở ra **danh sách dự án** (Sale chỉ thấy dự án mình phụ trách) kèm Tổng cần / Đã đặt / **Đã cấp về** (tấn), % cấp/đặt và cảnh báo màu: xanh (an toàn), vàng (≥90%), cam (≥95%), đỏ (vượt đơn hoặc chưa có đơn mà đã có hàng về). Dự án nguy hiểm xếp lên đầu; có ô gõ tìm.
- Bấm một dự án: **bảng theo dõi đơn hàng** đúng mẫu — Chủng loại | Tổng cần | ĐH01, ĐH02… | Tổng đặt | **Đã cấp về** | Còn lại | Cấp/Đặt, tô màu từng dòng; các đơn sổ dọc bên dưới (bấm để mở, sửa/xóa).
- **Đã cấp về** = tổng SL xuất của các phiếu giao nhận nhập vào dự án (không trừ hàng trả đi, khác tồn kho).
- Không thay đổi CSDL.

## [Chưa phát hành] — Giao nhận theo dự án
- **Giao nhận** mở ra **danh sách dự án** (Sale chỉ thấy dự án mình phụ trách), có ô gõ tìm; mỗi dự án hiện số phiếu nhập vào, xuất ra, số phiếu chờ xác nhận, ngày phiếu gần nhất. Dự án có phiếu chờ xác nhận xếp lên đầu.
- Bấm một dự án để xem phiếu: **NHẬP VÀO dự án** nằm trên, **XUẤT RA khỏi dự án** nằm dưới; mỗi phần xếp theo thời gian (nút đổi Mới nhất/Cũ nhất ở trên).
- Phiếu điều chuyển giữa hai dự án hiện ở **cả hai dự án** (nhập vào ở dự án nhận, xuất ra ở dự án gửi).
- Link chia sẻ phiếu (`?note=`) vẫn mở thẳng đúng phiếu. Không thay đổi CSDL.

## [Chưa phát hành] — Cập nhật hiện ngay sau khi Merge
- Service worker (v3): luôn hỏi lại máy chủ khi tải file, nên bản mới hiện ngay thay vì phải chờ ~10 phút do trình duyệt giữ file cũ.
- Không thay đổi CSDL.

## [Chưa phát hành] — Lọc dự án bằng cách gõ
- Các ô chọn dự án (**Giao nhận** lọc + chọn nơi xuất/nhập, **Hao hụt**, **Đơn hàng**, **Bảng kê → dòng điều chỉnh**) đổi từ danh sách kéo thành **ô gõ để lọc**: gõ số hoặc một phần tên (không cần dấu), bấm hoặc Enter để chọn; phím mũi tên lên/xuống chọn.
- **Người dùng**: danh sách tick khách hàng và dự án có ô gõ lọc.
- Không thay đổi CSDL.

## [Chưa phát hành] — Tab Đơn hàng
- **Đơn hàng** (mục mới): mỗi dự án có **đơn hàng tổng** (tổng dự án cần, dùng chung số liệu với Kế hoạch) và các **đơn đặt thực tế** (đơn 1, 2, 3...) có dòng chủng loại, tiền cọc, ngày thu cọc, trạng thái.
- Khối lượng tính theo **tấn** (số lượng × trọng lượng chủng loại). Lượng **đã giao tới dự án** là con số chung của dự án (không gắn xe nào vào đơn nào).
- Cảnh báo: **vàng từ 90%, cam từ 95%, đỏ khi vượt 100%** tổng đơn đã đặt — cần đặt đơn mới để bù.
- Sale (dự án được phân), Kế toán, Admin được nhập; các vai trò khác chỉ xem.
- **Cần chạy SQL** `sql/2026-11-04_don-hang.sql` trên Supabase TRƯỚC khi Merge (thêm 2 bảng).

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
