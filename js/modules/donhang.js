// js/modules/donhang.js
// Tab Đơn hàng: theo dự án có 1 "Đơn hàng tổng" (tổng dự án cần) và các đơn đặt thực tế
// (đơn 1, 2, 3...) có tiền cọc. Khối lượng tính theo TẤN (SL × trọng lượng chủng loại).
// Màn 1: danh sách dự án (xanh/vàng/cam/đỏ theo % đã cấp so với đã đặt).
// Màn 2 (bấm vào dự án): bảng theo dõi đơn hàng (Tổng cần | ĐH1..n | Tổng đặt | ĐÃ CẤP VỀ | Còn lại) + các đơn sổ dọc.
// "Đã cấp về" = tổng SL XUẤT của mọi phiếu giao nhận NHẬP VÀO dự án (không trừ hàng trả đi — khác tồn kho).
// Không gắn xe/phiếu nào vào đơn nào; chỉ so tổng cấp với tổng các đơn đã đặt.
import { supabase } from '../core/config.js';
import { fmtVND, fmtDate, esc, todayStr } from '../core/utils.js';
import { openModal, closeModal } from '../core/modal.js';

const STATUS = {
  da_dat: ['Đã đặt', 'tam'], da_coc: ['Đã cọc', 'chinh'], hoan_tat: ['Hoàn tất', 'chinh'], huy: ['Hủy', 'tre'],
};
const fmtTon = (t) => (Math.round(t * 100) / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);

const LV = {
  red:    ['VƯỢT ĐƠN', '#C0392B', '#FBEAE8'],
  orange: ['Sắp hết (≥95%)', '#D35400', '#FDEBDD'],
  amber:  ['Chú ý (≥90%)', '#9A7D0A', '#FEF5D0'],
  green:  ['An toàn', '#1E8449', '#E6F4EA'],
  none:   ['Chưa có hàng về', '#7F8C8D', '#F2F3F4'],
};
const RANK = { red: 0, orange: 1, amber: 2, green: 3, none: 4 };
function level(delivered, ordered) {
  if (!(ordered > 0)) return delivered > 0 ? 'red' : 'none';
  const p = pct(delivered, ordered);
  return p > 100 ? 'red' : p >= 95 ? 'orange' : p >= 90 ? 'amber' : 'green';
}
const chip = (lv, text) => `<span style="display:inline-block; padding:2px 9px; border-radius:10px; font-size:.74rem; font-weight:600; color:${LV[lv][1]}; background:${LV[lv][2]};">${text ?? LV[lv][0]}</span>`;
const strip = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

export async function render(container, profile, isStale = () => false) {
  const canEdit = ['admin', 'sale', 'ke_toan'].includes(profile.role);

  container.innerHTML = `
    <div class="page-head">
      <div><h1>Đơn hàng</h1><div class="sub">Theo dõi đơn hàng từng dự án: đơn tổng, các đơn đặt (có cọc) và lượng đã cấp về dự án</div></div>
    </div>
    <div id="nav"></div>
    <div id="body" class="loading">Đang tải...</div>`;

  const [{ data: c }, { data: p }] = await Promise.all([
    supabase.from('categories').select('*').order('group_id').order('sort_order'),
    supabase.from('projects').select('*').eq('status', 'active').order('name'),
  ]);
  if (isStale()) return;
  const categories = c ?? [], projects = p ?? [];
  const cat = (id) => categories.find(x => x.id === id);
  const tonOf = (categoryId, qty) => ((cat(categoryId)?.weight_kg ?? 0) * qty) / 1000;
  const body = () => container.querySelector('#body');
  const nav = () => container.querySelector('#nav');
  let state = null;

  async function fetchAllNotes(filterPid) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      let q = supabase.from('transfer_notes').select('id, to_location_id, transfer_note_items(category_id, sl_xuat)')
        .eq('to_location_type', 'du_an');
      if (filterPid) q = q.eq('to_location_id', filterPid);
      const { data, error } = await q.range(from, from + 999);
      if (error) return { error };
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return { data: out };
  }

  // ============ MÀN 1: danh sách dự án ============
  async function openList() {
    state = null;
    nav().innerHTML = '';
    body().innerHTML = '<div class="loading">Đang tải...</div>';
    const [needs, orders, notes] = await Promise.all([
      supabase.from('project_equipment_needs').select('project_id, category_id, total_needed_qty'),
      supabase.from('project_orders').select('project_id, status, project_order_lines(category_id, qty)'),
      fetchAllNotes(null),
    ]);
    if (isStale()) return;
    const err = needs.error || orders.error || notes.error;
    if (err) { body().innerHTML = `<div class="error-box">${esc(err.message)}${/project_orders/.test(err.message) ? ' — cần chạy file SQL đơn hàng trên Supabase.' : ''}</div>`; return; }

    const agg = {};
    projects.forEach(pj => { agg[pj.id] = { need: 0, ordered: 0, delivered: 0, n: 0 }; });
    (needs.data ?? []).forEach(r => { if (agg[r.project_id]) agg[r.project_id].need += tonOf(r.category_id, Number(r.total_needed_qty) || 0); });
    (orders.data ?? []).forEach(o => {
      const a = agg[o.project_id]; if (!a || o.status === 'huy') return;
      a.n++;
      (o.project_order_lines ?? []).forEach(l => { a.ordered += tonOf(l.category_id, Number(l.qty)); });
    });
    (notes.data ?? []).forEach(n => {
      const a = agg[n.to_location_id]; if (!a) return;
      (n.transfer_note_items ?? []).forEach(it => { a.delivered += tonOf(it.category_id, Number(it.sl_xuat) || 0); });
    });
    const rows = projects.map(pj => ({ pj, ...agg[pj.id], lv: level(agg[pj.id].delivered, agg[pj.id].ordered) }))
      .sort((x, y) => RANK[x.lv] - RANK[y.lv] || x.pj.name.localeCompare(y.pj.name, 'vi'));

    const cnt = (k) => rows.filter(r => r.lv === k).length;
    const draw = (text) => {
      const tokens = strip(text).split(/\s+/).filter(Boolean);
      const shown = rows.filter(r => tokens.every(t => strip(r.pj.name + ' ' + (r.pj.code ?? '')).includes(t)));
      container.querySelector('#projBody').innerHTML = shown.map(r => `
        <tr data-open="${r.pj.id}" style="cursor:pointer; background:${r.lv === 'green' || r.lv === 'none' ? 'transparent' : LV[r.lv][2]};">
          <td><b style="color:var(--red-dark);">${esc(r.pj.name)}</b></td>
          <td class="num">${r.n}</td>
          <td class="num">${fmtTon(r.need)}</td>
          <td class="num">${fmtTon(r.ordered)}</td>
          <td class="num"><b>${fmtTon(r.delivered)}</b></td>
          <td class="num">${r.ordered > 0 ? pct(r.delivered, r.ordered).toFixed(0) + '%' : '—'}</td>
          <td>${chip(r.lv)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty-state">Không có dự án nào khớp</td></tr>';
      container.querySelectorAll('[data-open]').forEach(tr => tr.addEventListener('click', () => openProject(tr.dataset.open)));
    };
    body().className = '';
    body().innerHTML = `
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
        ${['red', 'orange', 'amber', 'green'].map(k => `<div style="padding:8px 14px; border-radius:8px; background:${LV[k][2]}; color:${LV[k][1]}; font-weight:600; font-size:.84rem;">${LV[k][0]}: ${cnt(k)}</div>`).join('')}
      </div>
      <div class="toolbar"><input type="text" id="projSearch" placeholder="Gõ số hoặc tên dự án để tìm…" style="max-width:420px; width:100%;"></div>
      <div class="panel"><div class="panel-body" style="padding:0">
        <table><thead><tr><th>Dự án</th><th class="num">Số đơn đặt</th><th class="num">Tổng cần (tấn)</th><th class="num">Đã đặt (tấn)</th><th class="num">Đã cấp về (tấn)</th><th class="num">Cấp / Đặt</th><th>Cảnh báo</th></tr></thead>
        <tbody id="projBody"></tbody></table>
      </div></div>
      <div class="note-box" style="margin-top:12px;">Đã cấp về = tổng hàng các phiếu giao nhận <b>nhập vào dự án</b> (không trừ hàng trả đi). Vàng từ 90%, cam từ 95%, đỏ khi vượt 100% tổng đơn đã đặt.</div>`;
    draw('');
    container.querySelector('#projSearch').addEventListener('input', (e) => draw(e.target.value));
  }

  // ============ MÀN 2: 1 dự án ============
  async function openProject(pid) {
    const pj = projects.find(x => x.id === pid);
    nav().innerHTML = `<div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:12px;">
      <button class="btn secondary small" id="navBack">← Tất cả dự án</button><h2 style="margin:0;">${esc(pj?.name ?? '')}</h2></div>`;
    nav().querySelector('#navBack').addEventListener('click', openList);
    body().innerHTML = '<div class="loading">Đang tải...</div>';
    const [needs, orders, notes] = await Promise.all([
      supabase.from('project_equipment_needs').select('*').eq('project_id', pid),
      supabase.from('project_orders').select('*, project_order_lines(*)').eq('project_id', pid).order('order_no'),
      fetchAllNotes(pid),
    ]);
    if (isStale()) return;
    const err = needs.error || orders.error || notes.error;
    if (err) { body().innerHTML = `<div class="error-box">${esc(err.message)}</div>`; return; }
    const deliveredQty = new Map();
    (notes.data ?? []).forEach(n => (n.transfer_note_items ?? []).forEach(it => {
      deliveredQty.set(it.category_id, (deliveredQty.get(it.category_id) ?? 0) + (Number(it.sl_xuat) || 0));
    }));
    state = { pid, needs: needs.data ?? [], orders: orders.data ?? [], deliveredQty };
    draw();
  }

  const orderTons = (o) => (o.project_order_lines ?? []).reduce((s, l) => s + tonOf(l.category_id, Number(l.qty)), 0);

  function draw() {
    const { needs, orders, deliveredQty } = state;
    const active = orders.filter(o => o.status !== 'huy');
    const needQty = new Map(needs.map(n => [n.category_id, Number(n.total_needed_qty) || 0]));
    const ordQty = (o, id) => Number((o.project_order_lines ?? []).find(l => l.category_id === id)?.qty) || 0;

    const catIds = categories.map(x => x.id).filter(id => needQty.has(id) || deliveredQty.has(id) || active.some(o => ordQty(o, id) > 0));
    const sumTon = (fn) => catIds.reduce((s, id) => s + tonOf(id, fn(id)), 0);
    const totalNeed = sumTon(id => needQty.get(id) ?? 0);
    const orderedTon = sumTon(id => active.reduce((s, o) => s + ordQty(o, id), 0));
    const deliveredTon = sumTon(id => deliveredQty.get(id) ?? 0);
    const lv = level(deliveredTon, orderedTon);
    const usedPct = pct(deliveredTon, orderedTon);

    let alert = '';
    if (lv === 'red') alert = orderedTon > 0
      ? `<div class="error-box"><b>VƯỢT ĐƠN HÀNG:</b> đã cấp về ${fmtTon(deliveredTon)} tấn, lớn hơn tổng đơn đã đặt ${fmtTon(orderedTon)} tấn (${usedPct.toFixed(0)}%). Cần đặt đơn mới để bù.</div>`
      : `<div class="error-box">Đã cấp về ${fmtTon(deliveredTon)} tấn nhưng chưa có đơn hàng nào — cần lập đơn hàng.</div>`;
    else if (lv === 'orange') alert = `<div class="note-box" style="border-left-color:#D35400;"><b>Đã cấp ${usedPct.toFixed(0)}% tổng đơn đã đặt</b> — sắp hết, cần đặt đơn tiếp theo ngay.</div>`;
    else if (lv === 'amber') alert = `<div class="note-box"><b>Đã cấp ${usedPct.toFixed(0)}% tổng đơn đã đặt</b> — chuẩn bị đơn hàng tiếp theo.</div>`;

    const bar = LV[lv][1];
    const stat = (label, val, extra = '') => `<div><div style="font-size:.74rem; color:var(--ink-soft);">${label}</div><div style="font-size:1.3rem; font-weight:600; ${extra}">${val}</div></div>`;
    const summary = `
      <div class="panel" style="margin-bottom:16px;"><div class="panel-body">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-bottom:12px;">
          ${stat('Đơn hàng tổng (cần)', fmtTon(totalNeed) + ' tấn')}
          ${stat(`Đã đặt (${active.length} đơn)`, fmtTon(orderedTon) + ' tấn')}
          ${stat('Đã cấp về', fmtTon(deliveredTon) + ' tấn', `color:${bar};`)}
          ${stat('Còn lại trong đơn đã đặt', fmtTon(orderedTon - deliveredTon) + ' tấn', orderedTon - deliveredTon < 0 ? 'color:var(--red);' : '')}
          ${stat('Chưa đặt so với đơn tổng', fmtTon(Math.max(0, totalNeed - orderedTon)) + ' tấn')}
        </div>
        <div style="height:10px; background:var(--gray-tint); border-radius:5px; overflow:hidden;"><div style="height:100%; width:${Math.min(100, usedPct)}%; background:${bar};"></div></div>
        <div style="font-size:.76rem; color:var(--ink-soft); margin-top:4px;">Đã cấp ${orderedTon > 0 ? usedPct.toFixed(0) + '%' : '—'} so với tổng đơn đã đặt ${chip(lv)}</div>
      </div></div>`;

    // Bảng theo dõi: Tổng cần | ĐH1..n | Tổng đặt | Đã cấp về | Còn lại
    const f = (n) => (n ? n.toLocaleString('vi-VN') : '');
    const rowsHtml = catIds.map((id, i) => {
      const k = cat(id), need = needQty.get(id) ?? 0;
      const perOrder = active.map(o => ordQty(o, id));
      const ord = perOrder.reduce((a, b) => a + b, 0), del = deliveredQty.get(id) ?? 0;
      const rl = level(del, ord);
      const left = ord - del;
      const bg = rl === 'green' || rl === 'none' ? '' : `background:${LV[rl][2]};`;
      return `<tr>
        <td>${i + 1}</td><td>${esc(k?.name ?? '(?)')}</td><td>${esc(k?.unit ?? '')}</td>
        <td class="num">${f(need)}</td>
        ${perOrder.map(q => `<td class="num">${f(q)}</td>`).join('')}
        <td class="num"><b>${f(ord)}</b></td>
        <td class="num" style="${bg} color:${LV[rl][1]}; font-weight:700;">${f(del)}</td>
        <td class="num" style="${bg} color:${left < 0 ? 'var(--red)' : 'inherit'};">${ord || del ? left.toLocaleString('vi-VN') : ''}</td>
        <td class="num" style="${bg}">${ord > 0 ? pct(del, ord).toFixed(0) + '%' : (del > 0 ? 'chưa đặt' : '')}</td></tr>`;
    }).join('');
    const tonRow = `<tr style="font-weight:700; background:var(--gray-tint);"><td colspan="3">TỔNG (tấn)</td>
      <td class="num">${fmtTon(totalNeed)}</td>
      ${active.map(o => `<td class="num">${fmtTon(orderTons(o))}</td>`).join('')}
      <td class="num">${fmtTon(orderedTon)}</td><td class="num">${fmtTon(deliveredTon)}</td>
      <td class="num">${fmtTon(orderedTon - deliveredTon)}</td><td class="num">${orderedTon > 0 ? usedPct.toFixed(0) + '%' : ''}</td></tr>`;
    const matrix = `
      <div class="panel" style="margin-bottom:16px;">
        <div class="panel-head"><h3>Bảng theo dõi đơn hàng</h3>
          <div>${canEdit ? '<button class="btn secondary small" id="btnEditTotal">Sửa đơn hàng tổng</button> <button class="btn small" id="btnNewOrder">+ Thêm đơn hàng</button>' : ''}</div></div>
        <div class="panel-body" style="padding:0; overflow-x:auto;">
          <table><thead><tr><th>STT</th><th>Chủng loại</th><th>ĐVT</th><th class="num">Tổng cần</th>
            ${active.map(o => `<th class="num">ĐH${String(o.order_no).padStart(2, '0')}</th>`).join('')}
            <th class="num">Tổng đặt</th><th class="num">Đã cấp về</th><th class="num">Còn lại</th><th class="num">Cấp/Đặt</th></tr></thead>
          <tbody>${rowsHtml || `<tr><td colspan="${8 + active.length}" class="empty-state">Chưa có dữ liệu — bấm "Sửa đơn hàng tổng" để nhập tổng dự án cần</td></tr>`}${catIds.length ? tonRow : ''}</tbody></table>
        </div></div>`;

    // Các đơn sổ dọc (mở/đóng từng đơn)
    let remain = deliveredTon;
    const cards = orders.map(o => {
      const t = orderTons(o), isCancel = o.status === 'huy';
      const used = isCancel ? 0 : Math.min(remain, t);
      if (!isCancel) remain -= used;
      const [stLabel, stCls] = STATUS[o.status] ?? [o.status, 'tam'];
      const lines = (o.project_order_lines ?? []).map(l => `<tr><td>${esc(cat(l.category_id)?.name ?? '(?)')}</td><td class="num">${Number(l.qty).toLocaleString('vi-VN')} ${esc(cat(l.category_id)?.unit ?? '')}</td><td class="num">${fmtTon(tonOf(l.category_id, Number(l.qty)))}</td></tr>`).join('');
      return `<details class="panel" style="margin-bottom:10px; ${isCancel ? 'opacity:.55;' : ''}">
        <summary style="cursor:pointer; padding:12px 16px; display:flex; gap:14px; align-items:center; flex-wrap:wrap;">
          <b>Đơn số ${o.order_no}</b> <span class="badge ${stCls}">${stLabel}</span>
          <span style="font-size:.84rem;">${fmtDate(o.ngay_dat)} · ${fmtTon(t)} tấn · cọc ${fmtVND(o.deposit_amount)} ${o.deposit_paid ? '<span class="badge chinh">Đã thu</span>' : '<span class="badge tam">Chưa thu</span>'}</span>
        </summary>
        <div class="panel-body">
          <div style="display:flex; gap:24px; flex-wrap:wrap; font-size:.84rem; margin-bottom:10px;">
            <div>Ngày đặt: <b>${fmtDate(o.ngay_dat)}</b></div><div>Dự kiến giao: <b>${fmtDate(o.ngay_giao_du_kien)}</b></div>
            <div>Khối lượng: <b>${fmtTon(t)} tấn</b></div>
            <div>Tiền cọc: <b>${fmtVND(o.deposit_amount)}</b> ${o.deposit_paid && o.deposit_date ? '(thu ' + fmtDate(o.deposit_date) + ')' : ''}</div>
          </div>
          ${isCancel ? '' : `<div style="height:8px; background:var(--gray-tint); border-radius:4px; overflow:hidden; margin-bottom:4px;"><div style="height:100%; width:${Math.min(100, pct(used, t))}%; background:${bar};"></div></div>
          <div style="font-size:.74rem; color:var(--ink-soft); margin-bottom:8px;">Đã cấp ${fmtTon(used)} / ${fmtTon(t)} tấn (lượng cấp chung của dự án, tính lần lượt từ đơn 1)</div>`}
          <table><thead><tr><th>Chủng loại</th><th class="num">Số lượng</th><th class="num">Tấn</th></tr></thead><tbody>${lines || '<tr><td colspan="3" class="empty-state">Chưa có dòng nào</td></tr>'}</tbody></table>
          ${o.note ? `<div class="note-box">${esc(o.note)}</div>` : ''}
          ${canEdit ? `<div style="margin-top:10px;"><button class="btn secondary small" data-edit-order="${o.id}">Sửa</button> <button class="btn secondary small" data-del-order="${o.id}">Xóa</button></div>` : ''}
        </div></details>`;
    }).join('');

    body().className = '';
    body().innerHTML = `${alert}${summary}${matrix}
      <h3 style="margin:18px 0 10px;">Chi tiết từng đơn hàng</h3>
      ${cards || '<div class="empty-state">Chưa có đơn hàng nào cho dự án này</div>'}`;

    const bd = body();
    bd.querySelector('#btnEditTotal')?.addEventListener('click', openTotalModal);
    bd.querySelector('#btnNewOrder')?.addEventListener('click', () => openOrderModal(null));
    bd.querySelectorAll('[data-edit-order]').forEach(b => b.addEventListener('click', () => openOrderModal(state.orders.find(o => o.id === b.dataset.editOrder))));
    bd.querySelectorAll('[data-del-order]').forEach(b => b.addEventListener('click', async () => {
      const o = state.orders.find(x => x.id === b.dataset.delOrder);
      if (!confirm(`Xóa đơn số ${o.order_no}? (Nên chọn trạng thái Hủy nếu muốn giữ lịch sử)`)) return;
      const { error } = await supabase.from('project_orders').delete().eq('id', o.id);
      if (error) { alert('Lỗi xóa: ' + error.message); return; }
      openProject(state.pid);
    }));
  }

  // Bảng nhập dòng: chủng loại + số lượng, có tổng tấn tạm tính.
  function linesEditor(initial) {
    const rowHtml = (l = {}) => `<tr>
      <td><select class="ln-cat">${categories.map(x => `<option value="${x.id}" ${x.id === l.category_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td>
      <td><input type="number" class="ln-qty" min="1" value="${l.qty ?? ''}" style="width:110px;"></td>
      <td class="num ln-ton">0</td>
      <td><button type="button" class="btn secondary small ln-del">Xóa</button></td></tr>`;
    return {
      html: `<table class="approval-table"><thead><tr><th>Chủng loại</th><th>Số lượng</th><th class="num">Tấn</th><th></th></tr></thead>
        <tbody id="lnBody">${(initial.length ? initial : [{}]).map(rowHtml).join('')}</tbody></table>
        <button type="button" class="btn secondary small" id="lnAdd" style="margin-top:8px;">+ Thêm dòng</button>
        <div style="margin-top:10px; font-weight:600;">Tổng: <span id="lnTotal">0</span> tấn</div>`,
      bind(dlg) {
        const recalc = () => {
          let tot = 0;
          dlg.querySelectorAll('#lnBody tr').forEach(tr => {
            const t = tonOf(tr.querySelector('.ln-cat').value, parseFloat(tr.querySelector('.ln-qty').value) || 0);
            tr.querySelector('.ln-ton').textContent = fmtTon(t); tot += t;
          });
          dlg.querySelector('#lnTotal').textContent = fmtTon(tot);
        };
        const wire = (tr) => {
          tr.querySelector('.ln-cat').addEventListener('change', recalc);
          tr.querySelector('.ln-qty').addEventListener('input', recalc);
          tr.querySelector('.ln-del').addEventListener('click', () => { tr.remove(); recalc(); });
        };
        dlg.querySelectorAll('#lnBody tr').forEach(wire);
        dlg.querySelector('#lnAdd').addEventListener('click', () => {
          const tb = dlg.querySelector('#lnBody'); tb.insertAdjacentHTML('beforeend', rowHtml()); wire(tb.lastElementChild); recalc();
        });
        recalc();
      },
      read(dlg) {
        const m = new Map();
        dlg.querySelectorAll('#lnBody tr').forEach(tr => {
          const id = tr.querySelector('.ln-cat').value, q = parseFloat(tr.querySelector('.ln-qty').value) || 0;
          if (q > 0) m.set(id, (m.get(id) ?? 0) + q); // cùng chủng loại 2 dòng thì cộng lại
        });
        return [...m].map(([category_id, qty]) => ({ category_id, qty }));
      },
    };
  }

  function openTotalModal() {
    const ed = linesEditor(state.needs.map(n => ({ category_id: n.category_id, qty: n.total_needed_qty })));
    const dlg = openModal({
      title: 'Đơn hàng tổng — tổng dự án cần', wide: true,
      bodyHtml: `<div class="info-box">Cùng số liệu "Tổng dự án cần" ở mục Kế hoạch — sửa ở đâu cũng được.</div>${ed.html}`,
      footerHtml: '<button class="btn secondary" id="oCancel">Hủy</button><button class="btn" id="oSave">Lưu</button>',
    });
    ed.bind(dlg);
    dlg.querySelector('#oCancel').addEventListener('click', closeModal);
    dlg.querySelector('#oSave').addEventListener('click', async () => {
      const rows = ed.read(dlg);
      const keep = rows.map(r => r.category_id);
      const { error } = await supabase.from('project_equipment_needs').upsert(
        rows.map(r => ({ project_id: state.pid, category_id: r.category_id, total_needed_qty: r.qty, updated_by: profile.id })),
        { onConflict: 'project_id,category_id' });
      if (error) { alert('Lỗi lưu: ' + error.message); return; }
      const removed = state.needs.filter(n => !keep.includes(n.category_id)).map(n => n.id);
      if (removed.length) await supabase.from('project_equipment_needs').delete().in('id', removed);
      closeModal(); openProject(state.pid);
    });
  }

  function openOrderModal(existing) {
    const isNew = !existing;
    const nextNo = (state.orders.reduce((m, o) => Math.max(m, o.order_no), 0)) + 1;
    const ed = linesEditor((existing?.project_order_lines ?? []).map(l => ({ category_id: l.category_id, qty: l.qty })));
    const dlg = openModal({
      title: isNew ? 'Thêm đơn hàng' : `Sửa đơn số ${existing.order_no}`, wide: true,
      bodyHtml: `
        <div class="field-row">
          <div class="field"><label>Số đơn</label><input type="number" id="oNo" min="1" value="${existing?.order_no ?? nextNo}"></div>
          <div class="field"><label>Trạng thái</label><select id="oStatus">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${(existing?.status ?? 'da_dat') === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Ngày đặt</label><input type="date" id="oDat" value="${existing?.ngay_dat ?? todayStr()}"></div>
          <div class="field"><label>Dự kiến giao</label><input type="date" id="oGiao" value="${existing?.ngay_giao_du_kien ?? ''}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Tiền cọc (VNĐ)</label><input type="number" id="oCoc" min="0" value="${existing?.deposit_amount ?? 0}"></div>
          <div class="field"><label>Ngày thu cọc</label><input type="date" id="oCocDate" value="${existing?.deposit_date ?? ''}"></div>
        </div>
        <div class="field"><label><input type="checkbox" id="oCocPaid" ${existing?.deposit_paid ? 'checked' : ''} style="width:auto; flex:none; margin:0 6px 0 0;">Đã thu cọc</label></div>
        <div class="field"><label>Ghi chú</label><input type="text" id="oNote" value="${esc(existing?.note ?? '')}"></div>
        ${ed.html}`,
      footerHtml: '<button class="btn secondary" id="oCancel">Hủy</button><button class="btn" id="oSave">Lưu đơn hàng</button>',
    });
    ed.bind(dlg);
    dlg.querySelector('#oCancel').addEventListener('click', closeModal);
    dlg.querySelector('#oSave').addEventListener('click', async () => {
      const lines = ed.read(dlg);
      if (!lines.length) { alert('Đơn hàng cần ít nhất 1 dòng chủng loại có số lượng.'); return; }
      const v = (id) => dlg.querySelector(id).value;
      const payload = {
        project_id: state.pid, order_no: parseInt(v('#oNo')) || nextNo, status: v('#oStatus'),
        ngay_dat: v('#oDat') || null, ngay_giao_du_kien: v('#oGiao') || null,
        deposit_amount: parseFloat(v('#oCoc')) || 0, deposit_date: v('#oCocDate') || null,
        deposit_paid: dlg.querySelector('#oCocPaid').checked, note: v('#oNote').trim() || null,
      };
      let orderId = existing?.id;
      if (isNew) {
        const { data, error } = await supabase.from('project_orders').insert({ ...payload, created_by: profile.id }).select('id').single();
        if (error) { alert(/duplicate|unique/i.test(error.message) ? 'Số đơn này đã có trong dự án.' : 'Lỗi lưu: ' + error.message); return; }
        orderId = data.id;
      } else {
        const { error } = await supabase.from('project_orders').update(payload).eq('id', orderId);
        if (error) { alert(/duplicate|unique/i.test(error.message) ? 'Số đơn này đã có trong dự án.' : 'Lỗi lưu: ' + error.message); return; }
        await supabase.from('project_order_lines').delete().eq('order_id', orderId);
      }
      const { error: lerr } = await supabase.from('project_order_lines').insert(lines.map(l => ({ order_id: orderId, ...l })));
      if (lerr) { alert('Lỗi lưu dòng hàng: ' + lerr.message); return; }
      closeModal(); openProject(state.pid);
    });
  }

  await openList();
}
