// js/core/shell.js
// Topbar + sidebar (nhóm mục) + hash routing. main.js chỉ cần gọi initShell(profile).
// Mỗi module trong js/modules/ export 1 hàm render(container, profile, isStale) duy nhất.
// Trên di động: sidebar ẩn sau nút 3 gạch (☰), cộng thêm 1 thanh 4 tab quan trọng
// nhất cố định ở đáy màn hình để bấm nhanh — giống app VELA Hồ Sơ TC.

import { roleLabel, signOut, changeOwnPassword, MIN_PASSWORD_LENGTH } from './auth.js';
import { openModal, closeModal } from './modal.js';

const ROUTE_GROUPS = [
  {
    label: 'Tổng quan',
    routes: [{ key: '', module: 'dashboard', label: 'Tổng quan', icon: '◈', quick: true, hideForRoles: ['sale'] }],
  },
  {
    label: 'Nghiệp vụ',
    routes: [
      { key: 'taisan', module: 'taisan', label: 'Tài sản', icon: '▤', quick: true },
      { key: 'doitac', module: 'doitac', label: 'Đối tác', icon: '◫' },
      { key: 'giaonhan', module: 'giaonhan', label: 'Giao nhận', icon: '⇄', quick: true },
      { key: 'bangke', module: 'bangke', label: 'Bảng kê', icon: '▦', quick: true },
      { key: 'haohut', module: 'haohut', label: 'Hao hụt', icon: '⚠' },
      { key: 'kehoach', module: 'kehoach', label: 'Kế hoạch', icon: '◷' },
    ],
  },
  {
    label: 'Quản trị',
    adminOnly: true,
    routes: [
      { key: 'danhmuc', module: 'danhmuc', label: 'Danh mục', icon: '☰' },
      { key: 'users', module: 'users', label: 'Người dùng', icon: '⚙' },
    ],
  },
];

let currentRole = null;

// Route nào bị ẩn với vai trò hiện tại (VD Sale không thấy Tổng quan).
function isHidden(r) {
  return !!(r.hideForRoles && r.hideForRoles.includes(currentRole));
}

function allRoutes() {
  return ROUTE_GROUPS.flatMap(g => g.routes).filter(r => !isHidden(r));
}

// Trang mở đầu của từng vai trò: Sale vào thẳng Giao nhận, các vai trò khác vào Tổng quan.
function homeKey() {
  return currentRole === 'sale' ? 'giaonhan' : '';
}

// Bỏ phần tham số sau dấu "?" (nếu có, VD "giaonhan?note=xxx") trước khi so khớp route —
// để link chia sẻ kèm tham số vẫn nhận đúng trang, không bị coi là route lạ.
function currentRouteKey() {
  const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return allRoutes().some(r => r.key === hash) ? hash : homeKey();
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarBackdrop')?.classList.remove('open');
}

function renderTopbar(profile) {
  document.getElementById('topbar').innerHTML = `
    <button id="btnMobileMenu" class="mobile-menu-btn" aria-label="Menu">☰</button>
    <div class="brand"><span class="dot"></span><span class="name">TRƯỜNG THỊNH</span></div>
    <div class="user">
      <span>${profile.full_name}</span>
      <span class="role-chip">${roleLabel(profile.role)}</span>
      <button id="btnChangePw">Đổi mật khẩu</button>
      <button id="btnSignOut">Đăng xuất</button>
    </div>
  `;
  document.getElementById('btnSignOut').addEventListener('click', signOut);
  document.getElementById('btnChangePw').addEventListener('click', openChangePasswordModal);
  document.getElementById('btnMobileMenu').addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('sidebarBackdrop')?.classList.add('open');
  });
}

function openChangePasswordModal() {
  openModal({
    title: 'Đổi mật khẩu',
    bodyHtml: `
      <div class="field"><label>Mật khẩu hiện tại</label><input type="password" id="pwCurrent" autocomplete="current-password"></div>
      <div class="field"><label>Mật khẩu mới (tối thiểu ${MIN_PASSWORD_LENGTH} ký tự)</label><input type="password" id="pwNew" autocomplete="new-password"></div>
      <div class="field"><label>Nhập lại mật khẩu mới</label><input type="password" id="pwNew2" autocomplete="new-password"></div>
      <div id="pwMsg"></div>
    `,
    footerHtml: `<button class="btn secondary" id="pwCancel">Hủy</button><button class="btn" id="pwSave">Đổi mật khẩu</button>`,
    onMount: (dlg) => {
      const msg = dlg.querySelector('#pwMsg');
      const saveBtn = dlg.querySelector('#pwSave');
      dlg.querySelector('#pwCancel').addEventListener('click', closeModal);
      saveBtn.addEventListener('click', async () => {
        const cur = dlg.querySelector('#pwCurrent').value;
        const n1 = dlg.querySelector('#pwNew').value;
        const n2 = dlg.querySelector('#pwNew2').value;
        if (!cur || !n1) { msg.innerHTML = '<div class="error-box">Vui lòng nhập đầy đủ các ô.</div>'; return; }
        if (n1 !== n2) { msg.innerHTML = '<div class="error-box">Hai ô mật khẩu mới không khớp.</div>'; return; }
        saveBtn.disabled = true;
        msg.innerHTML = '';
        try {
          await changeOwnPassword(cur, n1);
          msg.innerHTML = '<div class="info-box">Đã đổi mật khẩu thành công.</div>';
          saveBtn.style.display = 'none';
          dlg.querySelector('#pwCancel').textContent = 'Đóng';
        } catch (err) {
          msg.innerHTML = `<div class="error-box">${err.message}</div>`;
          saveBtn.disabled = false;
        }
      });
    },
  });
}

function renderSidebar(profile, activeKey) {
  const groupsHtml = ROUTE_GROUPS
    .filter(g => !g.adminOnly || profile.role === 'admin')
    .map(g => ({ ...g, routes: g.routes.filter(r => !isHidden(r)) }))
    .filter(g => g.routes.length > 0)
    .map(g => `
      <div class="group-label">${g.label}</div>
      <nav class="nav">
        ${g.routes.map(r => `<a href="#/${r.key}" data-route="${r.key}" class="${r.key === activeKey ? 'active' : ''}">
          <span class="ico">${r.icon}</span>${r.label}
        </a>`).join('')}
      </nav>
    `).join('');

  document.getElementById('sidebar').innerHTML = groupsHtml;
  document.querySelectorAll('#sidebar .nav a').forEach(a => a.addEventListener('click', closeSidebar));
}

// Thanh 4 tab quan trọng nhất, cố định ở đáy màn hình — chỉ hiện trên di động (CSS lo phần ẩn/hiện).
function renderBottomNav(activeKey) {
  let bar = document.getElementById('bottomNav');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'bottomNav';
    document.body.appendChild(bar);
  }
  const quickRoutes = allRoutes().filter(r => r.quick);
  bar.innerHTML = quickRoutes.map(r => `<a href="#/${r.key}" data-route="${r.key}" class="${r.key === activeKey ? 'active' : ''}">
    <span class="ico">${r.icon}</span><span>${r.label}</span>
  </a>`).join('');
}

function ensureSidebarBackdrop() {
  if (document.getElementById('sidebarBackdrop')) return;
  const backdrop = document.createElement('div');
  backdrop.id = 'sidebarBackdrop';
  backdrop.addEventListener('click', closeSidebar);
  document.body.appendChild(backdrop);
}

let renderToken = 0;

async function loadRoute(profile) {
  const myToken = ++renderToken;
  const isStale = () => myToken !== renderToken;

  const key = currentRouteKey();
  const route = allRoutes().find(r => r.key === key);
  const content = document.getElementById('content');
  content.innerHTML = '<div class="loading">Đang tải...</div>';

  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.route === key));
  document.querySelectorAll('#bottomNav a').forEach(a => a.classList.toggle('active', a.dataset.route === key));
  closeSidebar();

  try {
    const mod = await import(`../modules/${route.module}.js`);
    if (isStale()) return;
    await mod.render(content, profile, isStale);
  } catch (err) {
    if (isStale()) return;
    console.error(err);
    content.innerHTML = `<div class="error-box">Lỗi tải trang "${route.label}": ${err.message}</div>`;
  }
}

export function initShell(profile) {
  currentRole = profile.role;
  ensureSidebarBackdrop();
  renderTopbar(profile);
  renderSidebar(profile, currentRouteKey());
  renderBottomNav(currentRouteKey());
  // Link cũ trỏ vào trang đã ẩn (VD #/ với Sale) -> đưa về trang mở đầu.
  const rawHash = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  if (rawHash !== currentRouteKey() && !(rawHash === '' && currentRouteKey() === '')) {
    window.location.hash = '#/' + currentRouteKey();
  }
  window.addEventListener('hashchange', () => {
    loadRoute(profile);
    renderBottomNav(currentRouteKey());
  });
  loadRoute(profile);
}
