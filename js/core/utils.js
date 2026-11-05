// js/core/utils.js
// Hàm tiện ích dùng chung — mọi module import từ đây, không viết lặp lại.

export function fmtVND(n) {
  return Math.round(n || 0).toLocaleString('vi-VN') + ' đ';
}

export function fmtNum(n) {
  return Math.round(n || 0).toLocaleString('vi-VN');
}

export function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('vi-VN');
}

export function daysBetween(a, b) {
  return Math.floor((new Date(b) - new Date(a)) / 86400000);
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysStr(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function uid(prefix) {
  return prefix + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
}

// Escape chuỗi trước khi render vào HTML — tránh rủi ro injection từ dữ liệu người dùng nhập
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Quy ước ghi tên (thống nhất toàn công ty):
// - Tên khách hàng/đối tác: IN HOA toàn bộ, VD "CÔNG TY CỔ PHẦN ABC"
// - Tên dự án: viết hoa chữ cái đầu mỗi từ, VD "Dự Án Diamond Sky" (các chữ còn lại giữ nguyên để không làm hỏng mã như ST14, VCN)
export function normPartnerName(s) {
  return String(s ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('vi');
}
export function normProjectName(s) {
  return String(s ?? '').trim().replace(/\s+/g, ' ')
    .split(' ').map(w => (w ? w.charAt(0).toLocaleUpperCase('vi') + w.slice(1) : w)).join(' ');
}
// Tự định dạng ô nhập khi người dùng rời ô (blur)
export function autoNormalize(input, fn) {
  input?.addEventListener('blur', () => { input.value = fn(input.value); });
}
