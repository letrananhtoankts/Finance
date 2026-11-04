// js/modules/users.js
// Chi admin - quan ly tai khoan nguoi dung. Sale duoc gan NHIEU khach hang (sale_partner_assignments)
// va/hoac gan rieng tung du an (sale_project_assignments) - RLS tu gioi han Sale chi thay du lieu da duoc gan.
import { supabase } from '../core/config.js';
import { requireRole, roleLabel } from '../core/auth.js';
import { openModal, closeModal } from '../core/modal.js';
import { esc } from '../core/utils.js';

const SUPABASE_URL = 'https://shgorgwdphqyxdfwufvu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoZ29yZ3dkcGhxeXhkZnd1ZnZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2NjMwMDgsImV4cCI6MjEwNDIzOTAwOH0.OdUuwrmC_Uc3pEL8pKHR9r_uvQIX_0-3Q5IT81I-XNw';

// ID đăng nhập = phần trước @ của email nội bộ; nhân viên không cần hộp thư thật.
const LOGIN_DOMAIN = 'truongthinhequip.com';
const loginId = (email) => (email ?? '').replace('@' + LOGIN_DOMAIN, '');

const ROLES = ['kho', 'sale', 'ke_toan', 'bgd', 'admin'];

export async function render(container, profile, isStale = () => false) {
  if (!requireRole(profile, ['admin'])) {
    container.innerHTML = `<div class="error-box">Chỉ Admin mới truy cập được mục này.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="page-head">
      <div><h1>Người dùng</h1><div class="sub">Tài khoản đăng nhập — Sale được gán theo khách hàng (nhiều khách) và/hoặc gán riêng từng dự án</div></div>
      <button class="btn" id="btnNewUser">+ Thêm người dùng</button>
    </div>
    <div class="panel"><div class="panel-body" style="padding:0"><table id="userTable"><tbody><tr><td class="loading">Đang tải...</td></tr></tbody></table></div></div>
  `;

  const { data: pt } = await supabase.from('partners').select('*').order('name');
  if (isStale()) return;
  const partnerList = pt ?? [];
  const { data: pj } = await supabase.from('projects').select('id, name, code, partner_id').order('name');
  if (isStale()) return;
  const projectList = pj ?? [];

  let partnerAssign = {}, projectAssign = {};

  function assignSummary(u) {
    if (u.role !== 'sale') return '—';
    const pn = (partnerAssign[u.id] ?? []).map(id => partnerList.find(p => p.id === id)?.name).filter(Boolean);
    const jn = (projectAssign[u.id] ?? []).map(id => projectList.find(p => p.id === id)?.name).filter(Boolean);
    if (!pn.length && !jn.length) return '— chưa gán —';
    return [pn.length ? `<b>Khách:</b> ${pn.map(esc).join(', ')}` : '', jn.length ? `<b>Dự án riêng:</b> ${jn.map(esc).join(', ')}` : ''].filter(Boolean).join('<br>');
  }

  async function loadUsers() {
    const [{ data, error }, { data: spa }, { data: spra }] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('sale_partner_assignments').select('user_id, partner_id'),
      supabase.from('sale_project_assignments').select('user_id, project_id'),
    ]);
    if (isStale()) return;
    partnerAssign = {}; projectAssign = {};
    (spa ?? []).forEach(r => (partnerAssign[r.user_id] ??= []).push(r.partner_id));
    (spra ?? []).forEach(r => (projectAssign[r.user_id] ??= []).push(r.project_id));
    const table = container.querySelector('#userTable');
    if (error) { table.innerHTML = `<tr><td class="error-box">${error.message}</td></tr>`; return; }

    const rows = (data ?? []).map(u => `<tr>
      <td><b>${esc(u.full_name ?? '(chưa đặt tên)')}</b></td>
      <td>${esc(loginId(u.email))}</td>
      <td>${esc(roleLabel(u.role))}</td>
      <td style="font-size:.82rem;">${assignSummary(u)}</td>
      <td><button class="btn secondary small" data-edit-user="${u.id}">Sửa</button></td>
    </tr>`).join('');

    table.innerHTML = `<thead><tr><th>Họ tên</th><th>ID đăng nhập</th><th>Vai trò</th><th>Phụ trách</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="empty-state">Chưa có người dùng nào</td></tr>'}</tbody>`;

    table.querySelectorAll('[data-edit-user]').forEach(btn =>
      btn.addEventListener('click', () => openUserModal((data ?? []).find(u => u.id === btn.dataset.editUser))));
  }

  // Ghi đè toàn bộ phân công của 1 người: xóa cũ rồi thêm theo danh sách đang tick.
  async function saveAssignments(userId, partnerIds, projectIds) {
    const d1 = await supabase.from('sale_partner_assignments').delete().eq('user_id', userId);
    if (d1.error) throw d1.error;
    const d2 = await supabase.from('sale_project_assignments').delete().eq('user_id', userId);
    if (d2.error) throw d2.error;
    if (partnerIds.length) {
      const { error } = await supabase.from('sale_partner_assignments').insert(partnerIds.map(partner_id => ({ user_id: userId, partner_id })));
      if (error) throw error;
    }
    if (projectIds.length) {
      const { error } = await supabase.from('sale_project_assignments').insert(projectIds.map(project_id => ({ user_id: userId, project_id })));
      if (error) throw error;
    }
  }

  function openUserModal(existing) {
    const isNew = !existing;
    const bodyHtml = `
      <div class="field"><label>Họ tên</label><input type="text" id="uFullName" value="${esc(existing?.full_name ?? '')}"></div>
      <div class="field"><label>ID đăng nhập</label><input type="text" id="uEmail" value="${esc(loginId(existing?.email))}" placeholder="VD: nguyenvana (viết liền, không dấu)" autocapitalize="none" ${isNew ? '' : 'disabled'}></div>
      ${isNew ? `<div class="field"><label>Mật khẩu tạm</label><input type="text" id="uPassword" placeholder="Ít nhất 6 ký tự"></div>` : ''}
      <div class="field"><label>Vai trò</label>
        <select id="uRole">${ROLES.map(r => `<option value="${r}" ${existing?.role === r ? 'selected' : ''}>${esc(roleLabel(r))}</option>`).join('')}</select>
      </div>
      <div class="field" id="uPartnerField" style="display:${existing?.role === 'sale' ? 'block' : 'none'};">
        <label>Khách hàng phụ trách (chọn nhiều)</label>
        <input type="text" class="ck-filter" data-filter-for="uPartners" placeholder="Gõ số hoặc tên khách hàng để lọc…" style="margin-bottom:6px;">
        <div id="uPartners" style="max-height:170px; overflow-y:auto; border:1px solid var(--line); border-radius:6px; padding:6px 10px;">
          ${partnerList.map(p => `<label style="display:flex; gap:8px; align-items:center; margin:4px 0; font-size:.84rem; color:var(--ink);"><input type="checkbox" style="width:auto; flex:none; margin:0;" value="${p.id}" ${(partnerAssign[existing?.id] ?? []).includes(p.id) ? 'checked' : ''}> ${esc(p.name)}</label>`).join('') || '<span style="color:var(--ink-soft);">Chưa có khách hàng</span>'}
        </div>
        <label style="margin-top:12px;">Dự án gán riêng (thêm ngoài các khách hàng ở trên)</label>
        <input type="text" class="ck-filter" data-filter-for="uProjects" placeholder="Gõ số hoặc tên dự án để lọc…" style="margin-bottom:6px;">
        <div id="uProjects" style="max-height:200px; overflow-y:auto; border:1px solid var(--line); border-radius:6px; padding:6px 10px;">
          ${projectList.map(j => `<label style="display:flex; gap:8px; align-items:center; margin:4px 0; font-size:.84rem; color:var(--ink);"><input type="checkbox" style="width:auto; flex:none; margin:0;" value="${j.id}" ${(projectAssign[existing?.id] ?? []).includes(j.id) ? 'checked' : ''}> ${esc(j.name)} <span style="color:var(--ink-soft); font-size:.74rem;">— ${esc(partnerList.find(p => p.id === j.partner_id)?.name ?? '')}</span></label>`).join('') || '<span style="color:var(--ink-soft);">Chưa có dự án</span>'}
        </div>
        <div class="note-box" style="margin-top:8px;">Sale thấy và thao tác được dữ liệu (dự án, phiếu, bảng kê, hao hụt, giá) của <b>mọi dự án thuộc khách hàng được tick</b>, cộng thêm <b>đúng các dự án được gán riêng</b>. Sale chỉ được gán riêng 1 dự án của khách hàng khác sẽ chỉ thấy dự án đó, không thấy các dự án còn lại của khách hàng ấy.</div>
      </div>
      <div id="uError" class="error-box" style="display:none;"></div>
    `;
    const footerHtml = `<button class="btn secondary" id="uCancel">Hủy</button><button class="btn" id="uSubmit">${isNew ? 'Tạo tài khoản' : 'Lưu thay đổi'}</button>`;
    const dialog = openModal({ title: isNew ? 'Thêm người dùng' : `Sửa — ${existing.full_name ?? existing.email}`, bodyHtml, footerHtml });

    // Ô gõ lọc cho danh sách tick khách hàng / dự án (danh sách dài, khỏi kéo lên xuống)
    const stripVi = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    dialog.querySelectorAll('.ck-filter').forEach(inp => inp.addEventListener('input', () => {
      const tokens = stripVi(inp.value).split(/\s+/).filter(Boolean);
      dialog.querySelectorAll(`#${inp.dataset.filterFor} label`).forEach(l => {
        const txt = stripVi(l.textContent);
        l.style.display = tokens.every(t => txt.includes(t)) ? 'flex' : 'none';
      });
    }));

    dialog.querySelector('#uRole').addEventListener('change', (e) => {
      dialog.querySelector('#uPartnerField').style.display = e.target.value === 'sale' ? 'block' : 'none';
    });

    dialog.querySelector('#uCancel').addEventListener('click', closeModal);
    dialog.querySelector('#uSubmit').addEventListener('click', async () => {
      const full_name = dialog.querySelector('#uFullName').value.trim();
      const role = dialog.querySelector('#uRole').value;
      const pickedPartners = role === 'sale' ? [...dialog.querySelectorAll('#uPartners input:checked')].map(i => i.value) : [];
      const pickedProjects = role === 'sale' ? [...dialog.querySelectorAll('#uProjects input:checked')].map(i => i.value) : [];
      const errBox = dialog.querySelector('#uError');
      errBox.style.display = 'none';

      if (!full_name) { errBox.textContent = 'Nhập họ tên.'; errBox.style.display = 'block'; return; }

      const submitBtn = dialog.querySelector('#uSubmit');
      submitBtn.disabled = true; submitBtn.textContent = 'Đang lưu...';

      try {
        if (isNew) {
          const idRaw = dialog.querySelector('#uEmail').value.trim().toLowerCase();
          const email = idRaw.includes('@') ? idRaw : idRaw + '@' + LOGIN_DOMAIN;
          const password = dialog.querySelector('#uPassword').value;
          if (!idRaw || !password || password.length < 6) throw new Error('Nhập đủ ID và mật khẩu (ít nhất 6 ký tự).');

          const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
          const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
          const { data: signUpData, error: signUpError } = await tempClient.auth.signUp({ email, password });
          if (signUpError) throw signUpError;
          const newUserId = signUpData.user?.id;
          if (!newUserId) throw new Error('Không lấy được ID tài khoản vừa tạo.');

          const { error: profileError } = await supabase.from('profiles').insert({
            id: newUserId, full_name, email, role,
          });
          if (profileError) throw profileError;
          await saveAssignments(newUserId, pickedPartners, pickedProjects);
        } else {
          const { error: updateError } = await supabase.from('profiles')
            .update({ full_name, role, assigned_partner_id: null }).eq('id', existing.id);
          if (updateError) throw updateError;
          await saveAssignments(existing.id, pickedPartners, pickedProjects);
        }

        closeModal();
        loadUsers();
      } catch (err) {
        errBox.textContent = 'Lỗi: ' + err.message;
        errBox.style.display = 'block';
        submitBtn.disabled = false; submitBtn.textContent = isNew ? 'Tạo tài khoản' : 'Lưu thay đổi';
      }
    });
  }

  container.querySelector('#btnNewUser').addEventListener('click', () => openUserModal(null));
  await loadUsers();
}
