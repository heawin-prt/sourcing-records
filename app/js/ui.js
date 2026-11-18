// 通用界面工具：转义、提示、格式化、图片 URL 管理。

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

import { t } from './i18n.js';

/**
 * App 自己的确认框（代替系统 confirm()：系统框的按钮语言跟随手机系统，不能随 App 切换中英文）。
 * @returns {Promise<boolean>}
 */
export function confirmDialog(message, okText) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'dialog-mask';
    el.innerHTML = `<div class="dialog" role="alertdialog">
      <p>${esc(message)}</p>
      <div class="dialog-actions">
        <button type="button" class="btn" data-v="0">${esc(t('cancel'))}</button>
        <button type="button" class="btn danger-fill" data-v="1">${esc(okText || t('delete'))}</button>
      </div></div>`;
    const done = v => { el.remove(); window.removeEventListener('hashchange', cancel); resolve(v); };
    const cancel = () => done(false);
    el.onclick = e => {
      if (e.target === el) return done(false);
      const b = e.target.closest('[data-v]');
      if (b) done(b.dataset.v === '1');
    };
    window.addEventListener('hashchange', cancel);
    document.body.appendChild(el);
  });
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let toastTimer = null;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// 页面切换时统一回收 blob URL，避免内存泄漏。
let urls = [];
export function blobUrl(blob) {
  const u = URL.createObjectURL(blob);
  urls.push(u);
  return u;
}
export function releaseUrls() {
  urls.forEach(u => URL.revokeObjectURL(u));
  urls = [];
}

const pad = n => String(n).padStart(2, '0');

/** ISO → "2026-11-16 14:05"（本地时间） */
export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO → datetime-local 输入框的值 */
export function toLocalInput(iso) {
  return fmtDateTime(iso).replace(' ', 'T');
}

export function fromLocalInput(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString();
}

export function fmtMoney(n) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '';
  return '¥' + Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

export function fmtBytes(b) {
  if (!b && b !== 0) return '?';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return b.toFixed(i ? 1 : 0) + ' ' + u[i];
}

export function stars(n) {
  n = Number(n) || 0;
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

export const STATUSES = ['todo', 'pending', 'done', 'notfound'];

/** 清单物品名称：有数量就在后面跟 ×数量，没有就只显示名称（任何地方都用它）。 */
export function itemTitle(it) {
  if (!it) return '';
  return it.qty ? `${it.name} ×${it.qty}` : (it.name || '');
}

/** 同上，HTML 版：名称太长时只截断名称，数量始终显示。 */
export function itemTitleHtml(it) {
  if (!it) return '';
  return `<span class="it-title"><span class="t-name">${esc(it.name || '')}</span>${it.qty ? `<span class="t-qty">×${esc(it.qty)}</span>` : ''}</span>`;
}

/** 线框图标（描边随文字颜色）。 */
const svg = body => `<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const ICONS = {
  camera: svg('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.5"/>'),
  importDoc: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6"/><path d="m9 14 3 3 3-3"/>'),
  album: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.5-4.5L6 21"/>'),
};

/** 多行框平时和其他框一样高，内容多了自动变高。 */
export function autoGrow(root) {
  const fit = ta => { ta.style.height = ''; if (ta.scrollHeight > ta.clientHeight) ta.style.height = ta.scrollHeight + 2 + 'px'; };
  root.querySelectorAll('textarea').forEach(ta => {
    fit(ta);
    if (!ta.dataset.grow) { ta.dataset.grow = '1'; ta.addEventListener('input', () => fit(ta)); }
  }); // 可重复调用：内容被程序改写后再调用一次即可重新适配
}
