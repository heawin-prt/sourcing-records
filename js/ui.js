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
