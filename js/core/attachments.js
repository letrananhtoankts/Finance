// js/core/attachments.js
// File đính kèm thật — lưu trên Cloudflare R2, qua 1 Worker trung gian (không dùng
// Supabase Storage nữa vì lượng truy xuất nhiều, R2 miễn phí băng thông tải xuống).
//
// CẦN ĐIỀN: WORKER_URL bên dưới, lấy từ Cloudflare sau khi deploy Worker
// (xem file cloudflare-worker-files.js + hướng dẫn deploy đi kèm).

import { supabase } from './config.js';

const WORKER_URL = 'https://ttequip-files.mute-mode-18d8.workers.dev';

export async function uploadAttachment(transferNoteId, file, uploaderId) {
  const safeName = file.name.replace(/[^\w.\-]/g, '_');
  const key = `transfer-notes/${transferNoteId}/${Date.now()}-${safeName}`;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Phiên đăng nhập đã hết, tải lại trang và đăng nhập lại.');

  const res = await fetch(`${WORKER_URL}/${key}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });
  if (!res.ok) throw new Error('Upload thất bại (' + res.status + '): ' + (await res.text()));

  const file_type = file.type === 'application/pdf' ? 'pdf_scan' : 'photo';
  const { error: dbError } = await supabase.from('transfer_note_attachments').insert({
    transfer_note_id: transferNoteId, file_type, r2_key: key, uploaded_by: uploaderId,
  });
  if (dbError) throw dbError;
}

export async function renderAttachmentRow(transferNoteId) {
  const { data, error } = await supabase
    .from('transfer_note_attachments')
    .select('*')
    .eq('transfer_note_id', transferNoteId)
    .order('uploaded_at', { ascending: true });

  const files = (!error && data) ? data : [];
  // Ảnh hiện thành ô xem trước ngay dưới phiếu (nhiều tấm); PDF hiện ô biểu tượng.
  const tiles = files.map((a, i) => a.file_type === 'pdf_scan'
    ? `<div class="attach-tile pdf" data-view-key="${a.r2_key}" title="Phiếu ký (scan)"><span>📎</span><small>Phiếu ký (scan)</small></div>`
    : `<div class="attach-tile" data-view-key="${a.r2_key}" data-thumb-key="${a.r2_key}" title="Ảnh giao nhận ${i + 1}"><span class="thumb-loading">…</span></div>`);

  return `<div class="attach-head">Ảnh / file giao nhận (${files.length})</div>
  <div class="attach-grid">
    ${tiles.join('')}
    <label class="attach-tile add" title="Thêm ảnh / file">
      <span>+</span><small>Thêm ảnh</small>
      <input type="file" data-upload-input="${transferNoteId}" style="display:none;" multiple accept=".pdf,image/*">
    </label>
  </div>`;
}

// Tải ảnh xem trước: file nằm sau Worker cần token nên phải fetch rồi tạo blob URL.
const thumbCache = new Map();
async function fetchBlobUrl(key) {
  if (thumbCache.has(key)) return thumbCache.get(key);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('no session');
  const res = await fetch(`${WORKER_URL}/${key}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const url = URL.createObjectURL(await res.blob());
  thumbCache.set(key, url);
  return url;
}

function loadThumbs(container) {
  container.querySelectorAll('[data-thumb-key]').forEach(async tile => {
    try {
      const url = await fetchBlobUrl(tile.dataset.thumbKey);
      tile.innerHTML = `<img src="${url}" alt="Ảnh giao nhận">`;
    } catch {
      tile.innerHTML = '<span title="Không tải được ảnh">⚠</span>';
    }
  });
}

// Xem file — KHÔNG dùng link <a href> thường vì trình duyệt không gửi kèm thông
// tin đăng nhập khi mở link trực tiếp. Phải tự tải file kèm token rồi mới mở ra,
// để Worker xác nhận đúng người trong công ty mới xem được.
async function viewAttachment(key) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { alert('Phiên đăng nhập đã hết, tải lại trang và đăng nhập lại.'); return; }

  try {
    const url = await fetchBlobUrl(key);
    window.open(url, '_blank');
  } catch (err) {
    alert('Lỗi mở file: ' + err.message);
  }
}

export function bindAttachmentEvents(container, uploaderId, onUploaded) {
  loadThumbs(container);
  container.querySelectorAll('[data-view-key]').forEach(chip => {
    chip.addEventListener('click', () => viewAttachment(chip.dataset.viewKey));
  });
  container.querySelectorAll('[data-upload-input]').forEach(input => {
    input.addEventListener('change', async (e) => {
      const noteId = input.dataset.uploadInput;
      const files = Array.from(e.target.files);
      for (const file of files) {
        try { await uploadAttachment(noteId, file, uploaderId); }
        catch (err) { alert('Lỗi tải file lên: ' + err.message); }
      }
      if (onUploaded) onUploaded();
    });
  });
}
