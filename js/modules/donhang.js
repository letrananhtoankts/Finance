// js/modules/donhang.js
// Tab Đơn hàng: theo dự án có 1 "Đơn hàng tổng" (tổng dự án cần) và các đơn đặt thực tế
// (đơn 1, 2, 3...) có tiền cọc. Khối lượng tính theo TẤN (SL × trọng lượng chủng loại).
// Lượng đã giao của dự án là con số CHUNG theo dự án — không gắn xe nào vào đơn nào;
// app chỉ cảnh báo khi lượng đã giao chạm 90% / 95% / vượt 100% tổng các đơn đã đặt.
import { supabase } from '../core/config.js';
import { fmtVND, fmtDate, esc, todayStr } from '../core/utils.js';
import { enhanceSelect } from '../core/searchSelect.js';
import { openModal, closeModal } from '../core/modal.js';

const STATUS = {
  da_dat: ['Đã đặt', 'tam'], da_coc: ['Đã cọc', 'chinh'], hoan_tat: ['Hoàn tất', 'chinh'], huy: ['Hủy', 'tre'],
};
const fmtTon = (t) => (Math.round(t * 100) / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);

export async function render(container, profile, isStale = () => false) {
  const canEdit = ['admin', 'sale', 'ke_toan'].includes(profile.role);

  container.innerHTML = `
    <div class="page-head">
      <div><h1>Đơn hàng</h1><div class="sub">Đơn hàng tổng của dự án và các đơn đặt thực tế (có cọc) — kiểm soát lượng đã giao so với lượng đã đặt</div></div>
    </div>
    <div class="form-row" style="grid-template-columns:minmax(220px,420px);"><div><label>Dự án</label><select id="fProject"></select></div></div>
    <div id="body" class="loading">Đang tải...</div>`;

  const [{ data: c }, { data: p }] = await Promise.all([
    supabase.from('categories').select('*').order('group_id').order('sort_order'),
    supabase.from('projects').select('*').eq('status', 'active').order('name'),
  ]);
  if (isStale()) return;
  const categories = c ?? [], projects = p ?? [];
  const cat = (id) => categories.find(x => x.id === id);
  const tonOf = (categoryId, qty) => ((cat(categoryId)?.weight_kg ?? 0) * qty) / 1000;

  const sel = container.querySelector('#fProject');
  sel.innerHTML = projects.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  enhanceSelect(sel, { placeholder: 'Gõ số hoặc tên dự án…' });
  if (!projects.length) { container.querySelector('#body').innerHTML = '<div class="empty-state">Chưa có dự án nào</div>'; return; }

  let state = null; // dữ liệu dự án đang xem

  async function load() {
    const pid = sel.value;
    const body = container.querySelector('#body');
    body.innerHTML = '<div class="loading">Đang tải...</div>';
    const [needs, orders, notes] = await Promise.all([
      supabase.from('project_equipment_needs').select('*').eq('project_id', pid),
      supabase.from('project_orders').select('*, project_order_lines(*)').eq('project_id', pid).order('order_no'),
      supabase.from('transfer_notes').select('id, status, transfer_note_items(category_id, sl_xuat, sl_thuc_nhan)')
        .eq('to_location_type', 'du_an').eq('to_location_id', pid),
    ]);
    if (isStale()) return;
    const err = needs.error || orders.error || notes.error;
    if (err) { body.innerHTML = `<div class="error-box">${esc(err.message)}${/project_orders/.test(err.message) ? ' — cần chạy file SQL đơn hàng trên Supabase.' : ''}</div>`; return; }

    // Đã giao tới dự án (tấn): phiếu chính thức dùng SL thực nhận, phiếu tạm dùng SL xuất.
    let delivered = 0;
    (notes.data ?? []).forEach(n => (n.transfer_note_items ?? []).forEach(it => {
      const q = n.status === 'chinh_thuc' ? (it.sl_thuc_nhan ?? it.sl_xuat) : it.sl_xuat;
      delivered += tonOf(it.category_id, Number(q) || 0);
    }));
    state = { pid, needs: needs.data ?? [], orders: orders.data ?? [], delivered };
    draw();
  }

  const orderTons = (o) => (o.project_order_lines ?? []).reduce((s, l) => s + tonOf(l.category_id, Number(l.qty)), 0);

  function draw() {
    const body = container.querySelector('#body');
    const { needs, orders, delivered } = state;
    const totalNeedTon = needs.reduce((s, n) => s + tonOf(n.category_id, Number(n.total_needed_qty) || 0), 0);
    const active = orders.filter(o => o.status !== 'huy');
    const orderedTon = active.reduce((s, o) => s + orderTons(o), 0);
    const usedPct = pct(delivered, orderedTon);

    let alert = '';
    if (orderedTon === 0 && delivered > 0) alert = `<div class="error-box">Đã giao ${fmtTon(delivered)} tấn nhưng chưa có đơn hàng nào — cần lập đơn hàng.</div>`;
    else if (delivered > orderedTon && orderedTon > 0) alert = `<div class="error-box"><b>VƯỢT ĐƠN HÀNG:</b> đã giao ${fmtTon(delivered)} tấn, lớn hơn tổng đơn đã đặt ${fmtTon(orderedTon)} tấn (${usedPct.toFixed(0)}%). Cần đặt đơn hàng mới để bù.</div>`;
    else if (usedPct >= 95) alert = `<div class="note-box" style="border-left-color:#C0392B;"><b>Đã dùng ${usedPct.toFixed(0)}% đơn đã đặt</b> — sắp hết, cần đặt đơn tiếp theo ngay.</div>`;
    else if (usedPct >= 90) alert = `<div class="note-box"><b>Đã dùng ${usedPct.toFixed(0)}% đơn đã đặt</b> — chuẩn bị đơn hàng tiếp theo.</div>`;

    const barColor = usedPct > 100 ? 'var(--red)' : usedPct >= 95 ? '#E67E22' : usedPct >= 90 ? 'var(--amber)' : 'var(--green)';
    const need2 = totalNeedTon > 0 ? ` · đã đặt ${pct(orderedTon, totalNeedTon).toFixed(0)}% tổng cần` : '';

    // Phân bổ lượng đã giao lần lượt vào đơn 1, 2, 3... (chỉ để minh họa còn bao nhiêu mỗi đơn)
    let remain = delivered;
    const cards = orders.map(o => {
      const t = orderTons(o);
      const isCancel = o.status === 'huy';
      const used = isCancel ? 0 : Math.min(remain, t);
      if (!isCancel) remain -= used;
      const [stLabel, stCls] = STATUS[o.status] ?? [o.status, 'tam'];
      const lines = (o.project_order_lines ?? []).map(l => `<tr><td>${esc(cat(l.category_id)?.name ?? '(?)')}</td><td class="num">${Number(l.qty).toLocaleString('vi-VN')} ${esc(cat(l.category_id)?.unit ?? '')}</td><td class="num">${fmtTon(tonOf(l.category_id, Number(l.qty)))}</td></tr>`).join('');
      return `<div class="panel" style="margin-bottom:14px; ${isCancel ? 'opacity:.55;' : ''}">
        <div class="panel-head">
          <h3>Đơn số ${o.order_no} <span class="badge ${stCls}" style="margin-left:6px;">${stLabel}</span></h3>
          <div>${canEdit ? `<button class="btn secondary small" data-edit-order="${o.id}">Sửa</button> <button class="btn secondary small" data-del-order="${o.id}">Xóa</button>` : ''}</div>
        </div>
        <div class="panel-body">
          <div style="display:flex; gap:24px; flex-wrap:wrap; font-size:.84rem; margin-bottom:10px;">
            <div>Ngày đặt: <b>${fmtDate(o.ngay_dat)}</b></div>
            <div>Dự kiến giao: <b>${fmtDate(o.ngay_giao_du_kien)}</b></div>
            <div>Khối lượng: <b>${fmtTon(t)} tấn</b></div>
            <div>Tiền cọc: <b>${fmtVND(o.deposit_amount)}</b> ${o.deposit_paid ? `<span class="badge chinh">Đã thu ${o.deposit_date ? fmtDate(o.deposit_date) : ''}</span>` : '<span class="badge tam">Chưa thu</span>'}</div>
          </div>
          ${isCancel ? '' : `<div style="height:8px; background:var(--gray-tint); border-radius:4px; overflow:hidden; margin-bottom:4px;"><div style="height:100%; width:${Math.min(100, pct(used, t))}%; background:${barColor};"></div></div>
          <div style="font-size:.74rem; color:var(--ink-soft); margin-bottom:8px;">Đã dùng ${fmtTon(used)} / ${fmtTon(t)} tấn (tính theo lượng đã giao chung của dự án, lần lượt từ đơn 1)</div>`}
          <table><thead><tr><th>Chủng loại</th><th class="num">Số lượng</th><th class="num">Tấn</th></tr></thead><tbody>${lines || '<tr><td colspan="3" class="empty-state">Chưa có dòng nào</td></tr>'}</tbody></table>
          ${o.note ? `<div class="note-box">${esc(o.note)}</div>` : ''}
        </div></div>`;
    }).join('');

    body.innerHTML = `
      ${alert}
      <div class="panel" style="margin-bottom:16px;"><div class="panel-body">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <h3 style="margin:0;">Đơn hàng tổng của dự án</h3>
          ${canEdit ? '<button class="btn secondary small" id="btnEditTotal">Sửa đơn hàng tổng</button>' : ''}
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin:12px 0;">
          <div><div style="font-size:.74rem; color:var(--ink-soft);">Tổng dự án cần</div><div style="font-size:1.3rem; font-weight:600;">${fmtTon(totalNeedTon)} tấn</div></div>
          <div><div style="font-size:.74rem; color:var(--ink-soft);">Đã đặt (${active.length} đơn)</div><div style="font-size:1.3rem; font-weight:600;">${fmtTon(orderedTon)} tấn</div></div>
          <div><div style="font-size:.74rem; color:var(--ink-soft);">Đã giao tới dự án</div><div style="font-size:1.3rem; font-weight:600;">${fmtTon(delivered)} tấn</div></div>
          <div><div style="font-size:.74rem; color:var(--ink-soft);">Còn lại trong đơn đã đặt</div><div style="font-size:1.3rem; font-weight:600; color:${orderedTon - delivered < 0 ? 'var(--red)' : 'inherit'};">${fmtTon(orderedTon - delivered)} tấn</div></div>
        </div>
        <div style="height:10px; background:var(--gray-tint); border-radius:5px; overflow:hidden;"><div style="height:100%; width:${Math.min(100, usedPct)}%; background:${barColor};"></div></div>
        <div style="font-size:.76rem; color:var(--ink-soft); margin-top:4px;">Đã giao ${usedPct.toFixed(0)}% so với tổng đơn đã đặt${need2}. Cảnh báo vàng từ 90%, cam từ 95%, đỏ khi vượt 100%.</div>
      </div></div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin:18px 0 10px;">
        <h3 style="margin:0;">Các đơn hàng</h3>
        ${canEdit ? '<button class="btn" id="btnNewOrder">+ Thêm đơn hàng</button>' : ''}
      </div>
      ${cards || '<div class="empty-state">Chưa có đơn hàng nào cho dự án này</div>'}`;

    body.querySelector('#btnEditTotal')?.addEventListener('click', openTotalModal);
    body.querySelector('#btnNewOrder')?.addEventListener('click', () => openOrderModal(null));
    body.querySelectorAll('[data-edit-order]').forEach(b => b.addEventListener('click', () => openOrderModal(state.orders.find(o => o.id === b.dataset.editOrder))));
    body.querySelectorAll('[data-del-order]').forEach(b => b.addEventListener('click', async () => {
      const o = state.orders.find(x => x.id === b.dataset.delOrder);
      if (!confirm(`Xóa đơn số ${o.order_no}? (Nên chọn trạng thái Hủy nếu muốn giữ lịch sử)`)) return;
      const { error } = await supabase.from('project_orders').delete().eq('id', o.id);
      if (error) { alert('Lỗi xóa: ' + error.message); return; }
      load();
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
      closeModal(); load();
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
      closeModal(); load();
    });
  }

  sel.addEventListener('change', load);
  await load();
}
