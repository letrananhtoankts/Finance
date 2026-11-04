// js/modules/giaonhan.js
import { supabase } from '../core/config.js';
import { todayStr, daysBetween, fmtDate, esc } from '../core/utils.js';
import { renderApprovalCard, bindApprovalConfirm, bindExtraItemEvents } from '../core/approvalUI.js';
import { enhanceSelect } from '../core/searchSelect.js';
import { renderAttachmentRow, bindAttachmentEvents, uploadAttachment } from '../core/attachments.js';
import { openModal, closeModal } from '../core/modal.js';

export async function render(container, profile, isStale = () => false) {
  container.innerHTML = `
    <div class="page-head">
      <div><h1>Giao nhận</h1><div class="sub">Theo dõi theo từng phiếu, xác nhận trong 3 ngày làm việc</div></div>
      <button class="btn" id="btnNewPhieu">+ Tạo phiếu giao nhận mới</button>
    </div>
    <div id="gnNav"></div>
    <div class="note-box">Xác nhận thực nhận: mặc định bằng đúng số hàng xuất, sửa dòng nào bị lệch. Nhận thêm chủng loại không có trong phiếu gốc thì khai báo ở "Dòng phát sinh khi nhận".</div>
    <div id="phieuList" class="loading">Đang tải...</div>
  `;

  const [{ data: c }, { data: p }, { data: w }, { data: vt }, { data: tc }, { data: cv }] = await Promise.all([
    supabase.from('categories').select('*').order('group_id').order('sort_order'),
    supabase.from('projects').select('*').eq('status', 'active').order('name'),
    supabase.from('warehouses').select('*').order('name'),
    supabase.from('vehicle_types').select('*').order('name'),
    supabase.from('transport_carriers').select('*').order('name'),
    supabase.from('company_vehicles').select('*, vehicle_types(name)').order('bien_so'),
  ]);
  if (isStale()) return;
  const categories = c ?? [], projects = p ?? [], warehouses = w ?? [], vehicleTypes = vt ?? [], carriers = tc ?? [], companyVehicles = cv ?? [];

  let currentProject = null;   // null = màn danh sách dự án; có giá trị = đang xem phiếu của 1 dự án
  let sortDesc = true;         // true = mới nhất ở trên

  const catName = (id) => categories.find(c => c.id === id)?.name ?? '(?)';
  const catUnit = (id) => categories.find(c => c.id === id)?.unit ?? '';

  function locationOptions() {
    return `
      <optgroup label="Kho">${warehouses.map(w => `<option value="kho:${w.id}">${w.name}</option>`).join('')}</optgroup>
      <optgroup label="Dự án">${projects.map(p => `<option value="du_an:${p.id}">${p.name}</option>`).join('')}</optgroup>
    `;
  }
  function locationName(type, id) {
    if (type === 'kho') return warehouses.find(w => w.id === id)?.name ?? '(?)';
    if (type === 'du_an') return projects.find(p => p.id === id)?.name ?? '(?)';
    return '(?)';
  }
  function resolveFrom(note) {
    if (note.from_location_type) return locationName(note.from_location_type, note.from_location_id);
    if (note.from_warehouse_id) return warehouses.find(w => w.id === note.from_warehouse_id)?.name ?? '(?)';
    return '(?)';
  }
  function resolveTo(note) {
    if (note.to_location_type) return locationName(note.to_location_type, note.to_location_id);
    if (note.project_id) return projects.find(p => p.id === note.project_id)?.name ?? '(?)';
    return '(?)';
  }

  container.querySelector('#btnNewPhieu').addEventListener('click', () => openNewPhieuModal());

  // ================= TẠO PHIẾU MỚI =================
  async function openNewPhieuModal() {
    const bodyHtml = `
      <div class="field-row">
        <div class="field"><label>Số phiếu (theo đúng số ghi trên giấy tại hiện trường)</label><input type="text" id="mCode" placeholder="VD: 0006302"></div>
        <div class="field"><label>Ngày ký phiếu</label><input type="date" id="mDate" value="${todayStr()}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Nơi xuất</label><select id="mFrom">${locationOptions()}</select></div>
        <div class="field"><label>Nơi nhập</label><select id="mTo">${locationOptions()}</select></div>
      </div>
      <div class="note-box" style="margin-top:0;">Nơi xuất/nhập có thể là Kho hoặc Dự án tùy tình huống — VD dự án trả hàng về thì Nơi xuất chọn Dự án, Nơi nhập chọn Kho.</div>
      <div class="field-row">
        <div class="field"><label>Người giao (bên xuất)</label><input type="text" id="mNguoiGiao" placeholder="Tên người giao"></div>
        <div class="field"><label>Quản lý duyệt (bên xuất)</label><input type="text" id="mQuanLy" placeholder="Tên quản lý"></div>
      </div>
      <div class="field"><label>Loại vận chuyển</label>
        <select id="mVanChuyenType">
          <option value="ngoai">Nhà xe ngoài (thuê ngoài)</option>
          <option value="congty">Xe công ty</option>
        </select>
      </div>
      <div class="field-row" id="mNgoaiFields" style="grid-template-columns:1fr 1fr 1fr;">
        <div class="field"><label>Đơn vị vận chuyển</label><select id="mNhaXe"><option value="">— Chọn —</option>${carriers.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select></div>
        <div class="field"><label>Số xe</label><input type="text" id="mBienSo" list="mBienSoList" placeholder="50E-123.45"><datalist id="mBienSoList"></datalist></div>
        <div class="field"><label>Loại xe</label><select id="mLoaiXe"><option value="">— Chọn —</option>${vehicleTypes.map(v => `<option value="${v.id}">${v.name}</option>`).join('')}</select></div>
      </div>
      <div class="field" id="mCongTyFields" style="display:none;">
        <label>Chọn xe công ty</label>
        <select id="mCompanyVehicle"><option value="">— Chọn —</option>${companyVehicles.map(v => `<option value="${v.id}">${esc(v.bien_so)} — ${esc(v.vehicle_types?.name ?? 'chưa rõ loại')}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Phí vận chuyển (chỉ tính khi Nơi nhập là dự án — nơi nhận hàng sẽ trả phí này)</label><input type="number" id="mTransportFee" placeholder="VD: 5000000"></div>

      <div class="field">
        <label>Dòng hàng</label>
        <table style="margin-top:6px;">
          <thead><tr><th style="width:40px;">STT</th><th>Tên hàng &amp; quy cách</th><th style="width:90px;">ĐVT</th><th class="num" style="width:130px;">SL hàng xuất</th><th style="width:50px;"></th></tr></thead>
          <tbody id="mItemRows"></tbody>
        </table>
        <button class="btn secondary small" id="mAddRow" type="button" style="margin-top:8px;">+ Thêm dòng</button>
      </div>

      <div class="field">
        <label>File đính kèm (phiếu ký scan, ảnh giao nhận)</label>
        <input type="file" id="mFiles" multiple accept=".pdf,image/*">
      </div>
    `;

    const footerHtml = `
      <button class="btn secondary" id="mCancel">Hủy</button>
      <button class="btn" id="mSubmit">Kho ghi nhận tạm</button>
    `;

    const dialog = openModal({ title: 'Tạo phiếu giao nhận mới', bodyHtml, footerHtml, wide: true });
    enhanceSelect(dialog.querySelector('#mFrom'), { placeholder: 'Gõ tên kho hoặc dự án…' });
    enhanceSelect(dialog.querySelector('#mTo'), { placeholder: 'Gõ tên kho hoặc dự án…' });

    function addRow() {
      const tbody = dialog.querySelector('#mItemRows');
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="stt"></td>
        <td><select class="row-cat">${categories.map(c => `<option value="${c.id}" data-unit="${c.unit}">${c.name}</option>`).join('')}</select></td>
        <td class="row-unit">${categories[0]?.unit ?? ''}</td>
        <td><input type="number" class="row-qty" value="100" min="1"></td>
        <td><button class="btn secondary small row-remove" type="button" style="padding:2px 8px;">Xóa</button></td>
      `;
      tbody.appendChild(row);

      row.querySelector('.row-cat').addEventListener('change', (e) => {
        row.querySelector('.row-unit').textContent = e.target.selectedOptions[0].dataset.unit;
      });
      row.querySelector('.row-remove').addEventListener('click', () => { row.remove(); renumberRows(); });
      renumberRows();
    }

    function renumberRows() {
      dialog.querySelectorAll('#mItemRows tr').forEach((row, idx) => {
        row.querySelector('.stt').textContent = idx + 1;
      });
    }

    dialog.querySelector('#mAddRow').addEventListener('click', addRow);
    addRow();

    dialog.querySelector('#mVanChuyenType').addEventListener('change', (e) => {
      const isCongTy = e.target.value === 'congty';
      dialog.querySelector('#mNgoaiFields').style.display = isCongTy ? 'none' : 'grid';
      dialog.querySelector('#mCongTyFields').style.display = isCongTy ? 'block' : 'none';
    });

    dialog.querySelector('#mNhaXe').addEventListener('change', async (e) => {
      const carrierId = e.target.value;
      const listEl = dialog.querySelector('#mBienSoList');
      listEl.innerHTML = '';
      if (!carrierId) return;
      const { data } = await supabase.from('transfer_notes').select('bien_so').eq('nha_xe_id', carrierId).not('bien_so', 'is', null);
      const uniquePlates = [...new Set((data ?? []).map(r => r.bien_so))];
      listEl.innerHTML = uniquePlates.map(plate => `<option value="${plate}"></option>`).join('');
    });

    dialog.querySelector('#mCancel').addEventListener('click', closeModal);

    dialog.querySelector('#mSubmit').addEventListener('click', async () => {
      const rows = Array.from(dialog.querySelectorAll('#mItemRows tr')).map(row => ({
        category_id: row.querySelector('.row-cat').value,
        sl_xuat: parseFloat(row.querySelector('.row-qty').value) || 0,
      })).filter(r => r.sl_xuat > 0);

      if (rows.length === 0) { alert('Thêm ít nhất 1 dòng hàng có số lượng hợp lệ.'); return; }

      const [fromType, fromId] = dialog.querySelector('#mFrom').value.split(':');
      const [toType, toId] = dialog.querySelector('#mTo').value.split(':');
      if (fromType === toType && fromId === toId) { alert('Nơi xuất và Nơi nhập không được trùng nhau.'); return; }

      let direction = 'dieu_chuyen_kho';
      if (fromType === 'kho' && toType === 'du_an') direction = 'xuat_du_an';
      else if (fromType === 'du_an' && toType === 'kho') direction = 'nhap_kho';

      const project_id = fromType === 'du_an' ? fromId : (toType === 'du_an' ? toId : null);

      const code = dialog.querySelector('#mCode').value.trim();
      if (!code) { alert('Nhập số phiếu theo đúng giấy tại hiện trường.'); return; }
      const files = Array.from(dialog.querySelector('#mFiles').files);

      const ngay_ky = dialog.querySelector('#mDate').value;
      const nguoi_giao = dialog.querySelector('#mNguoiGiao').value || null;
      const quan_ly_xuat = dialog.querySelector('#mQuanLy').value || null;
      const transport_fee = parseFloat(dialog.querySelector('#mTransportFee').value) || null;

      // Xe công ty (tự vận chuyển) hoặc nhà xe ngoài — 2 lựa chọn loại trừ nhau
      const isCongTy = dialog.querySelector('#mVanChuyenType').value === 'congty';
      let nha_xe_id = null, bien_so = null, loai_xe_id = null, company_vehicle_id = null;
      if (isCongTy) {
        company_vehicle_id = dialog.querySelector('#mCompanyVehicle').value || null;
        const vehicle = companyVehicles.find(v => v.id === company_vehicle_id);
        bien_so = vehicle?.bien_so ?? null;
        loai_xe_id = vehicle?.loai_xe_id ?? null;
      } else {
        nha_xe_id = dialog.querySelector('#mNhaXe').value || null;
        bien_so = dialog.querySelector('#mBienSo').value || null;
        loai_xe_id = dialog.querySelector('#mLoaiXe').value || null;
      }

      const submitBtn = dialog.querySelector('#mSubmit');
      submitBtn.disabled = true; submitBtn.textContent = 'Đang tạo...';

      const { data: note, error } = await supabase.from('transfer_notes').insert({
        code, direction, ngay_ky,
        from_location_type: fromType, from_location_id: fromId,
        to_location_type: toType, to_location_id: toId,
        project_id,
        nguoi_giao, quan_ly_xuat, nha_xe_id, bien_so, loai_xe_id, company_vehicle_id, transport_fee, status: 'tam', created_by: profile.id,
      }).select().single();
      if (error) { alert('Lỗi tạo phiếu: ' + error.message); submitBtn.disabled = false; submitBtn.textContent = 'Kho ghi nhận tạm'; return; }

      const items = rows.map(r => ({ transfer_note_id: note.id, category_id: r.category_id, sl_xuat: r.sl_xuat }));
      const { error: itemsError } = await supabase.from('transfer_note_items').insert(items);
      if (itemsError) { alert('Lỗi thêm dòng hàng: ' + itemsError.message); submitBtn.disabled = false; submitBtn.textContent = 'Kho ghi nhận tạm'; return; }

      for (const file of files) {
        try { await uploadAttachment(note.id, file, profile.id); }
        catch (err) { alert('Tạo phiếu thành công nhưng lỗi tải file đính kèm: ' + err.message); }
      }

      closeModal();
      loadPhieu();
    });
  }

  // ================= MODAL XỬ LÝ CHÊNH LỆCH (thiếu ở chủng loại quy đổi được) =================
  function resolveDeficitsModal(deficits, surplusPool) {
    return new Promise((resolve) => {
      const bodyHtml = `
        <div class="error-box">Phát hiện ${deficits.length} chủng loại có thể quy đổi đang THIẾU so với số xuất — xử lý quy đổi trước khi xác nhận (hoặc bỏ qua để coi là thiếu thật).</div>
        ${deficits.map((d, idx) => `
          <div style="border:1px solid var(--line); padding:12px; border-radius:6px; margin-bottom:10px;">
            <b>${esc(d.category.name)}</b> — thiếu ${d.deficitQty} ${esc(d.category.unit)}
            <div class="field-row" style="margin-top:8px;">
              <div class="field"><label>Quy đổi từ dòng dư nào?</label>
                <select data-deficit-source="${idx}">
                  <option value="">— Không quy đổi, coi là thiếu thật —</option>
                  ${surplusPool.map((s, sIdx) => `<option value="${sIdx}">${esc(s.category.name)} (dư ${s.qty} ${esc(s.category.unit)})</option>`).join('')}
                </select>
              </div>
              <div class="field"><label>Mét dài quy đổi (nếu có)</label><input type="number" step="0.01" data-deficit-md="${idx}" placeholder="VD 40"></div>
            </div>
          </div>
        `).join('')}
      `;
      const footerHtml = `<button class="btn secondary" id="rdCancel">Hủy, không xác nhận phiếu</button><button class="btn" id="rdSubmit">Xác nhận xử lý</button>`;
      const dialog = openModal({ title: 'Xử lý chênh lệch quy cách', bodyHtml, footerHtml, wide: true });

      dialog.querySelector('#rdCancel').addEventListener('click', () => { closeModal(); resolve(null); });
      dialog.querySelector('#rdSubmit').addEventListener('click', () => {
        const conversions = [];
        const usedSurplusIdx = new Set();
        let unresolvedCount = 0;

        deficits.forEach((d, idx) => {
          const sourceSel = dialog.querySelector(`[data-deficit-source="${idx}"]`);
          const mdInput = dialog.querySelector(`[data-deficit-md="${idx}"]`);
          if (sourceSel.value === '') { unresolvedCount++; return; }
          const sIdx = parseInt(sourceSel.value);
          conversions.push({ deficit: d, surplus: surplusPool[sIdx], qtyMd: parseFloat(mdInput.value) || 0 });
          usedSurplusIdx.add(sIdx);
        });

        if (unresolvedCount > 0) {
          const ok = confirm(`Còn ${unresolvedCount} chủng loại chưa quy đổi — sẽ ghi nhận là THIẾU THẬT, không tự tạo hao hụt (Kho/Sale xử lý riêng sau). Vẫn tiếp tục xác nhận phiếu?`);
          if (!ok) return;
        }

        const remainingSurplus = surplusPool.filter((s, i) => !usedSurplusIdx.has(i));
        closeModal();
        resolve({ conversions, remainingSurplus });
      });
    });
  }

  async function nextAssetSeq(categoryId) {
    const { count } = await supabase.from('asset_units').select('id', { count: 'exact', head: true }).eq('category_id', categoryId);
    return (count ?? 0) + 1;
  }

  // ================= XỬ LÝ XÁC NHẬN (dùng chung cho modal chi tiết) =================
  async function handleConfirm(note, updates, extraItems) {
    const deficits = updates.filter(u => {
      const cat = categories.find(cc => cc.id === u.category_id);
      return cat?.is_convertible && u.sl_thuc_nhan < u.sl_xuat;
    }).map(u => ({ ...u, category: categories.find(cc => cc.id === u.category_id), deficitQty: u.sl_xuat - u.sl_thuc_nhan }));

    const overshoot = updates.filter(u => u.sl_thuc_nhan > u.sl_xuat).map(u => ({
      category: categories.find(cc => cc.id === u.category_id), qty: u.sl_thuc_nhan - u.sl_xuat,
    }));
    const extraSurplus = extraItems.map(e => ({ category: categories.find(cc => cc.id === e.category_id), qty: e.qty }));
    let surplusPool = [...overshoot, ...extraSurplus];

    let conversions = [];
    if (deficits.length > 0) {
      const resolved = await resolveDeficitsModal(deficits, surplusPool);
      if (resolved === null) return false;
      conversions = resolved.conversions;
      surplusPool = resolved.remainingSurplus;
    }

    for (const u of updates) {
      await supabase.from('transfer_note_items').update({
        sl_thuc_nhan: u.sl_thuc_nhan,
        qty_thanh_ly: u.thanh_ly ?? 0,
        qty_tra_lai: u.tra_lai ?? 0,
        tinh_trang: u.tinh_trang ?? 'Mới',
      }).eq('id', u.itemId);
    }

    for (const conv of conversions) {
      await supabase.from('asset_conversions').insert({
        transfer_note_item_id: conv.deficit.itemId,
        category_id_from: conv.surplus.category.id,
        category_id_to: conv.deficit.category.id,
        qty_md: conv.qtyMd,
        performed_by: profile.id,
      });
    }

    for (const s of surplusPool) {
      if (!s.category || s.qty <= 0) continue;
      const status = note.to_location_type === 'kho' ? 'kho' : note.to_location_type === 'du_an' ? 'tai_du_an' : 'kho';
      const warehouse_id = note.to_location_type === 'kho' ? note.to_location_id : null;
      const project_id = note.to_location_type === 'du_an' ? note.to_location_id : null;
      const seqStart = await nextAssetSeq(s.category.id);
      const rows = [];
      for (let i = 0; i < s.qty; i++) {
        rows.push({
          asset_code: `${s.category.code}-${String(seqStart + i).padStart(5, '0')}`,
          category_id: s.category.id, status, warehouse_id, project_id,
          source: 'phat_hien_du',
          source_note: `Trả dư khi xác nhận phiếu ${note.code} ngày ${todayStr()}`,
          created_by: profile.id,
        });
      }
      await supabase.from('asset_units').insert(rows);
    }

    await supabase.from('transfer_notes').update({
      status: 'chinh_thuc', confirmed_by: profile.id, confirmed_at: new Date().toISOString(),
    }).eq('id', note.id);

    return true;
  }

  // ================= MODAL CHI TIẾT 1 PHIẾU =================
  function openDetailModal(note) {
    const categoryOptionsForExtra = categories.map(c => ({ id: c.id, name: c.name, unit: c.unit }));

    const cardHtml = renderApprovalCard({
      id: note.id, code: note.code, ngay_ky: note.ngay_ky, status: note.status, late_flag: note.late_flag,
      meta: `${esc(resolveFrom(note))} → ${esc(resolveTo(note))}`,
      items: note.transfer_note_items.map(it => ({
        id: it.id, label: catName(it.category_id), unit: catUnit(it.category_id),
        sl_xuat: it.sl_xuat, sl_thuc_nhan: it.sl_thuc_nhan, tinh_trang: it.tinh_trang,
        qty_thanh_ly: it.qty_thanh_ly, qty_tra_lai: it.qty_tra_lai,
      })),
      categoryOptions: note.status === 'tam' ? categoryOptionsForExtra : null,
      signInfo: `<span>Người giao: <b>${esc(note.nguoi_giao ?? '—')}</b> · QL duyệt: <b>${esc(note.quan_ly_xuat ?? '—')}</b></span>
                 <span>Người nhận: <b>${esc(note.nguoi_nhan ?? '— chưa ký —')}</b></span>
                 <span>Vận chuyển: <b>${note.company_vehicle_id ? '🚚 Xe công ty' : esc(carriers.find(c => c.id === note.nha_xe_id)?.name ?? note.nha_xe ?? '—')}</b> · Số xe <b>${esc(note.bien_so ?? '—')}</b> · ${esc(vehicleTypes.find(v => v.id === note.loai_xe_id)?.name ?? '—')}${note.transport_fee ? ` · Phí: <b>${Number(note.transport_fee).toLocaleString('vi-VN')} đ</b>` : ''}</span>`,
    });

    const footerHtml = `<button class="btn secondary" id="dCopyLink">🔗 Copy link chia sẻ</button>`;
    const dialog = openModal({ title: `Phiếu ${note.code}`, bodyHtml: cardHtml, footerHtml, wide: true });

    dialog.querySelector('#dCopyLink').addEventListener('click', async () => {
      const url = `${window.location.origin}${window.location.pathname}#/giaonhan?note=${note.id}`;
      try {
        await navigator.clipboard.writeText(url);
        const btn = dialog.querySelector('#dCopyLink');
        const oldText = btn.textContent;
        btn.textContent = '✓ Đã copy';
        setTimeout(() => { btn.textContent = oldText; }, 1500);
      } catch {
        prompt('Copy link này gửi qua Zalo/chat:', url);
      }
    });

    renderAttachmentRow(note.id).then(html => {
      const el = dialog.querySelector(`#attach-${note.id}`);
      if (el) { el.innerHTML = html; bindAttachmentEvents(dialog, profile.id, () => openDetailModal(note)); }
    });

    if (note.status === 'tam') {
      const extraState = bindExtraItemEvents(dialog, [{ id: note.id }]);
      bindApprovalConfirm(dialog, [{ id: note.id, items: note.transfer_note_items }], extraState, async (noteId, updates, extraItems) => {
        const ok = await handleConfirm(note, updates, extraItems);
        if (ok) { closeModal(); loadPhieu(); }
        return ok;
      });
    }
  }

  // ================= DANH SÁCH PHIẾU: bấm Giao nhận -> các dự án -> bấm 1 dự án -> phiếu =================
  // Trong 1 dự án: phiếu NHẬP VÀO dự án nằm trên, phiếu XUẤT RA khỏi dự án nằm dưới,
  // mỗi phần xếp theo thời gian. Phiếu điều chuyển giữa 2 dự án hiện ở CẢ HAI dự án.
  const stripVi = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  const isInto = (n, pid) => (n.to_location_type === 'du_an' && n.to_location_id === pid) || (!n.to_location_type && n.project_id === pid && n.direction === 'xuat_du_an');
  const isOutOf = (n, pid) => (n.from_location_type === 'du_an' && n.from_location_id === pid) || (!n.from_location_type && n.project_id === pid && n.direction === 'nhap_kho');

  // Phiếu tạm quá 3 ngày tự xác nhận (như trước)
  async function autoConfirmLate(notes) {
    for (const note of notes) {
      if (note.status === 'tam' && daysBetween(note.ngay_ky, new Date()) > 3) {
        await Promise.all(note.transfer_note_items.map(it =>
          supabase.from('transfer_note_items').update({ sl_thuc_nhan: it.sl_xuat, tinh_trang: 'Mới' }).eq('id', it.id)
        ));
        await supabase.from('transfer_notes').update({ status: 'chinh_thuc', late_flag: true, confirmed_at: new Date().toISOString() }).eq('id', note.id);
        note.status = 'chinh_thuc'; note.late_flag = true;
        note.transfer_note_items = note.transfer_note_items.map(it => ({ ...it, sl_thuc_nhan: it.sl_xuat }));
      }
    }
  }

  function openNoteFromLink(notes) {
    const match = window.location.hash.match(/[?&]note=([^&]+)/);
    if (!match) return;
    const targetNote = notes.find(n => n.id === match[1]);
    if (targetNote) openDetailModal(targetNote);
  }

  async function loadPhieu() {
    if (currentProject) return loadProjectView();
    return loadProjectList();
  }

  // ---- Màn 1: danh sách dự án (Sale chỉ thấy dự án mình phụ trách nhờ phân quyền) ----
  async function loadProjectList() {
    const nav = container.querySelector('#gnNav');
    const list = container.querySelector('#phieuList');
    nav.innerHTML = '';
    container.querySelector('.note-box')?.style.setProperty('display', 'none');
    list.innerHTML = '<div class="loading">Đang tải...</div>';

    // Link chia sẻ ?note=: mở thẳng dự án chứa phiếu đó
    const linkNote = window.location.hash.match(/[?&]note=([^&]+)/);
    if (linkNote) {
      const { data: n } = await supabase.from('transfer_notes').select('*').eq('id', linkNote[1]).maybeSingle();
      if (isStale()) return;
      const pid = n && (n.to_location_type === 'du_an' ? n.to_location_id : n.from_location_type === 'du_an' ? n.from_location_id : n.project_id);
      if (pid && projects.some(pj => pj.id === pid)) { currentProject = pid; return loadProjectView(); }
    }

    const { data: notes, error } = await supabase.from('transfer_notes')
      .select('id, status, ngay_ky, direction, project_id, from_location_type, from_location_id, to_location_type, to_location_id')
      .order('ngay_ky', { ascending: false }).limit(3000);
    if (isStale()) return;
    if (error) { list.innerHTML = `<div class="error-box">${esc(error.message)}</div>`; return; }

    const stats = {};
    projects.forEach(pj => { stats[pj.id] = { cho: 0, nhap: 0, xuat: 0, last: null }; });
    (notes ?? []).forEach(n => projects.forEach(pj => {
      const into = isInto(n, pj.id), out = isOutOf(n, pj.id);
      if (!into && !out) return;
      const st = stats[pj.id];
      if (into) st.nhap++;
      if (out) st.xuat++;
      if (n.status === 'tam') st.cho++;
      if (!st.last || n.ngay_ky > st.last) st.last = n.ngay_ky;
    }));

    const draw = (text) => {
      const tokens = stripVi(text).split(/\s+/).filter(Boolean);
      const rows = projects
        .filter(pj => tokens.every(t => stripVi(pj.name + ' ' + (pj.code ?? '')).includes(t)))
        .sort((a, b) => (stats[b.id].cho - stats[a.id].cho) || a.name.localeCompare(b.name, 'vi'))
        .map(pj => {
          const st = stats[pj.id];
          return `<tr data-open-project="${pj.id}" style="cursor:pointer;">
            <td><b style="color:var(--red-dark);">${esc(pj.name)}</b></td>
            <td class="num">${st.nhap}</td><td class="num">${st.xuat}</td>
            <td>${st.cho ? `<span class="badge tam">${st.cho} phiếu chờ xác nhận</span>` : '<span style="color:var(--ink-soft);">—</span>'}</td>
            <td>${st.last ? fmtDate(st.last) : '—'}</td></tr>`;
        }).join('');
      container.querySelector('#gnProjBody').innerHTML = rows || '<tr><td colspan="5" class="empty-state">Không có dự án nào khớp</td></tr>';
      container.querySelectorAll('[data-open-project]').forEach(tr => tr.addEventListener('click', () => {
        currentProject = tr.dataset.openProject;
        window.location.hash = '#/giaonhan'; // bỏ ?note= (nếu có)
        loadPhieu();
      }));
    };

    list.innerHTML = `
      <div class="toolbar"><input type="text" id="gnProjSearch" placeholder="Gõ số hoặc tên dự án để tìm…" style="max-width:420px; width:100%;"></div>
      <div class="panel"><div class="panel-body" style="padding:0">
        <table>
          <thead><tr><th>Dự án</th><th class="num">Phiếu nhập vào</th><th class="num">Phiếu xuất ra</th><th>Chờ xác nhận</th><th>Phiếu gần nhất</th></tr></thead>
          <tbody id="gnProjBody"></tbody>
        </table>
      </div></div>`;
    draw('');
    container.querySelector('#gnProjSearch').addEventListener('input', (e) => draw(e.target.value));
  }

  // ---- Màn 2: phiếu của 1 dự án — NHẬP VÀO ở trên, XUẤT RA ở dưới ----
  async function loadProjectView() {
    const pid = currentProject;
    const proj = projects.find(pj => pj.id === pid);
    const nav = container.querySelector('#gnNav');
    const list = container.querySelector('#phieuList');
    container.querySelector('.note-box')?.style.removeProperty('display');
    nav.innerHTML = `<div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:12px;">
        <button class="btn secondary small" id="gnBack">← Tất cả dự án</button>
        <h2 style="margin:0;">${esc(proj?.name ?? '(?)')}</h2>
        <button class="btn secondary small" id="gnSort" style="margin-left:auto;">${sortDesc ? 'Mới nhất ở trên' : 'Cũ nhất ở trên'} ⇅</button>
      </div>`;
    nav.querySelector('#gnBack').addEventListener('click', () => { currentProject = null; window.location.hash = '#/giaonhan'; loadPhieu(); });
    nav.querySelector('#gnSort').addEventListener('click', () => { sortDesc = !sortDesc; loadPhieu(); });
    list.innerHTML = '<div class="loading">Đang tải...</div>';

    const { data: notes, error } = await supabase.from('transfer_notes')
      .select('*, transfer_note_items(*)')
      .or(`and(from_location_type.eq.du_an,from_location_id.eq.${pid}),and(to_location_type.eq.du_an,to_location_id.eq.${pid}),project_id.eq.${pid}`)
      .order('ngay_ky', { ascending: false }).order('created_at', { ascending: false }).limit(500);
    if (isStale()) return;
    if (error) { list.innerHTML = `<div class="error-box">${esc(error.message)}</div>`; return; }

    await autoConfirmLate(notes);
    if (isStale()) return;

    const byTime = (a, b) => {
      const k = (n) => `${n.ngay_ky}|${n.created_at ?? ''}`;
      return sortDesc ? k(b).localeCompare(k(a)) : k(a).localeCompare(k(b));
    };
    const into = notes.filter(n => isInto(n, pid)).sort(byTime);
    const out = notes.filter(n => isOutOf(n, pid) && !isInto(n, pid)).sort(byTime);

    const rowHtml = (note, side) => {
      const badge = note.status === 'tam' ? '<span class="badge tam">Chờ xác nhận</span>'
        : note.late_flag ? '<span class="badge tre">Xác nhận trễ</span>'
        : '<span class="badge chinh">Chính thức</span>';
      const tongXuat = note.transfer_note_items.reduce((s, it) => s + Number(it.sl_xuat), 0);
      const tongThucNhan = note.status === 'tam' ? '-' : note.transfer_note_items.reduce((s, it) => s + Number(it.sl_thuc_nhan ?? 0), 0);
      const other = side === 'in' ? `Từ: ${resolveFrom(note)}` : `Đến: ${resolveTo(note)}`;
      return `<tr data-open-note="${note.id}" style="cursor:pointer;">
        <td><b style="color:var(--red-dark);">${esc(note.code)}</b></td>
        <td>${esc(other)}</td><td>${fmtDate(note.ngay_ky)}</td>
        <td class="num">${tongXuat}</td><td class="num">${tongThucNhan}</td><td>${badge}</td></tr>`;
    };
    const section = (title, color, arr, side) => `
      <div class="panel" style="margin-bottom:18px;">
        <div class="panel-head" style="border-left:4px solid ${color};"><h3>${title} <span style="color:var(--ink-soft); font-weight:400;">(${arr.length} phiếu)</span></h3></div>
        <div class="panel-body" style="padding:0"><table>
          <thead><tr><th>Số phiếu</th><th>${side === 'in' ? 'Nơi xuất' : 'Nơi nhận'}</th><th>Ngày ký</th><th class="num">SL xuất</th><th class="num">SL thực nhận</th><th>Trạng thái</th></tr></thead>
          <tbody>${arr.map(n => rowHtml(n, side)).join('') || '<tr><td colspan="6" class="empty-state">Chưa có phiếu</td></tr>'}</tbody>
        </table></div></div>`;

    list.innerHTML = section('NHẬP VÀO dự án (dự án nhận hàng)', 'var(--green)', into, 'in')
      + section('XUẤT RA khỏi dự án (trả hàng / chuyển đi)', 'var(--red)', out, 'out');

    container.querySelectorAll('[data-open-note]').forEach(tr => {
      tr.addEventListener('click', () => openDetailModal(notes.find(n => n.id === tr.dataset.openNote)));
    });
    openNoteFromLink(notes);
  }

  await loadPhieu();
}
