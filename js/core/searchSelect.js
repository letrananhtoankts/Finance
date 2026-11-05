// js/core/searchSelect.js
// Biến <select> thường (danh sách dài, phải kéo lên kéo xuống) thành ô GÕ ĐỂ LỌC:
// gõ một phần tên hoặc số (không cần dấu) là danh sách thu gọn lại, bấm/Enter để chọn.
// Giữ nguyên <select> gốc (ẩn đi) nên code cũ đọc .value / nghe sự kiện change như trước.

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

// Từ khóa thông minh: "1m" / "1.5m" / "0,6m" = chiều dài L=1000 / 1500 / 600 (mm) trong tên chủng loại;
// các từ khóa khác khớp một phần như thường (không cần dấu).
function tokenMatches(t, textNorm) {
  const m = /^(\d+(?:[.,]\d+)?)m$/.exec(t);
  if (m) {
    const mm = Math.round(parseFloat(m[1].replace(',', '.')) * 1000);
    if (new RegExp('l\\s*=\\s*' + mm + '(?!\\d)').test(textNorm)) return true;
  }
  return textNorm.includes(t);
}

export function enhanceSelect(select, { placeholder = 'Gõ số hoặc tên để tìm…' } = {}) {
  if (!select || select._ssEnhanced) return;
  select._ssEnhanced = true;

  const wrap = document.createElement('div');
  wrap.className = 'ss-wrap';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ss-input';
  input.autocomplete = 'off';
  input.placeholder = placeholder;
  const list = document.createElement('div');
  list.className = 'ss-list';
  list.style.display = 'none';
  wrap.append(input, list);
  select.insertAdjacentElement('afterend', wrap);
  select.style.display = 'none';

  let items = [];     // { value, text, group }
  let shown = [];     // các mục đang hiện
  let active = -1;
  let open = false;

  const selectedText = () => select.selectedOptions[0]?.textContent ?? '';

  function readOptions() {
    items = [];
    [...select.children].forEach(ch => {
      if (ch.tagName === 'OPTGROUP') [...ch.children].forEach(o => items.push({ value: o.value, text: o.textContent, group: ch.label }));
      else if (ch.tagName === 'OPTION') items.push({ value: ch.value, text: ch.textContent, group: '' });
    });
  }

  function paint(query) {
    const tokens = norm(query).split(/\s+/).filter(Boolean);
    shown = items.filter(it => { const tn = norm(it.text); return tokens.every(t => tokenMatches(t, tn)); });
    let lastGroup = null, html = '';
    shown.forEach((it, i) => {
      if (it.group && it.group !== lastGroup) html += `<div class="ss-group">${it.group}</div>`;
      lastGroup = it.group;
      html += `<div class="ss-item${i === active ? ' active' : ''}${it.value === select.value ? ' current' : ''}" data-i="${i}"></div>`;
    });
    list.innerHTML = html || '<div class="ss-empty">Không có kết quả</div>';
    list.querySelectorAll('.ss-item').forEach(el => { el.textContent = shown[+el.dataset.i].text; });
  }

  function place() {
    const r = input.getBoundingClientRect();
    list.style.left = r.left + 'px';
    list.style.top = (r.bottom + 2) + 'px';
    list.style.width = Math.max(r.width, 240) + 'px';
    const room = window.innerHeight - r.bottom - 12;
    list.style.maxHeight = Math.max(160, Math.min(320, room)) + 'px';
  }

  function openList() {
    readOptions();
    open = true; active = -1;
    paint('');
    list.style.display = 'block';
    place();
    const cur = list.querySelector('.current');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }
  function closeList() {
    open = false; list.style.display = 'none';
    input.value = selectedText();
  }
  function choose(i) {
    const it = shown[i];
    if (!it) return;
    select.value = it.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    closeList();
    input.blur();
  }

  input.addEventListener('focus', () => { openList(); input.select(); });
  input.addEventListener('input', () => {
    if (!open) openList();
    active = 0; paint(input.value); place();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) openList();
      active = Math.max(0, Math.min(shown.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
      paint(input.value);
      list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') { e.preventDefault(); choose(active >= 0 ? active : 0); }
    else if (e.key === 'Escape') { closeList(); input.blur(); }
  });
  // mousedown (không phải click) để chọn trước khi ô nhập mất focus
  list.addEventListener('mousedown', (e) => {
    const el = e.target.closest('.ss-item');
    if (el) { e.preventDefault(); choose(+el.dataset.i); }
    else e.preventDefault();
  });
  input.addEventListener('blur', () => { if (open) closeList(); });
  window.addEventListener('scroll', () => { if (open) place(); }, true);
  window.addEventListener('resize', () => { if (open) place(); });

  // Code khác đổi danh sách option (innerHTML) hoặc value -> cập nhật chữ hiển thị.
  const sync = () => { if (!open) input.value = selectedText(); };
  new MutationObserver(sync).observe(select, { childList: true, subtree: true, attributes: true });
  select.addEventListener('change', sync);
  sync();
}
