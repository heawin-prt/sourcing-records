// 紧凑的选择列表：从屏幕顶端展开，字号与正文相同，可搜索。
// 用来代替系统自带的下拉框（系统下拉框在手机上居中、字大、行距大）。

import { esc, $ } from './ui.js';

/**
 * @param {{title?: string, searchPlaceholder?: string, options: {value: string, label: string, sub?: string, html?: string}[],
 *          selected?: string, onPick: (value: string) => void}} cfg
 */
export function openPicker(cfg) {
  closePicker();
  const el = document.createElement('div');
  el.id = 'picker';
  el.innerHTML = `
    <div class="picker-head">
      <input type="search" id="picker-q" placeholder="${esc(cfg.searchPlaceholder || '')}" autocomplete="off">
      <button type="button" class="picker-close" aria-label="Close">✕</button>
    </div>
    ${cfg.title ? `<div class="picker-title">${esc(cfg.title)}</div>` : ''}
    <ul class="picker-list"></ul>`;
  document.body.appendChild(el);
  document.body.classList.add('picker-open');

  const list = $('.picker-list', el);
  const render = q => {
    q = (q || '').trim().toLowerCase();
    const shown = cfg.options.filter(o => !q || (o.label + ' ' + (o.sub || '')).toLowerCase().includes(q));
    list.innerHTML = shown.map(o => `
      <li><button type="button" data-v="${esc(o.value)}" class="${o.value === cfg.selected ? 'on' : ''}">
        <span class="pl">${o.html || esc(o.label)}</span>${o.sub ? `<span class="ps">${esc(o.sub)}</span>` : ''}
      </button></li>`).join('');
  };
  render('');

  $('#picker-q', el).oninput = e => render(e.target.value);
  $('.picker-close', el).onclick = closePicker;
  list.onclick = e => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    closePicker();
    cfg.onPick(b.dataset.v);
  };
}

export function closePicker() {
  const el = document.getElementById('picker');
  if (el) el.remove();
  document.body.classList.remove('picker-open');
}

// 换页时自动关闭
window.addEventListener('hashchange', closePicker);
