-- Chuẩn hóa tên theo quy ước: đối tác IN HOA; dự án viết hoa chữ cái đầu mỗi từ.
-- (Phần mềm đã tự chuẩn hóa khi tạo mới; file này chỉ sửa dữ liệu đã có.)
-- Xem trước: chạy 2 câu SELECT này trước, thấy ổn rồi mới chạy phần UPDATE.
select name, upper(name) as moi from partners where name <> upper(name);
select name,
  (select string_agg(upper(left(w,1)) || substr(w,2), ' ') from unnest(string_to_array(trim(name), ' ')) w where w <> '') as moi
from projects;

update partners set name = upper(trim(name)) where name <> upper(trim(name));
update projects set name = (select string_agg(upper(left(w,1)) || substr(w,2), ' ') from unnest(string_to_array(trim(name), ' ')) w where w <> '');
