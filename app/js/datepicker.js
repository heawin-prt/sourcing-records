// 自制日期 / 日期时间选择器。
// 系统自带的日期框（input type=date）弹出的日历语言跟随手机系统，不能随 App 切换中英文，
// 所以改用这个：显示一个按钮，点开是 App 自己画的日历，语言跟随 App 设置。
//
// 用法：表单里放 dateField(name, value, {time})；渲染后调用 bindDateFields(root)。
// 值仍放在隐藏的 <input name=...> 里，格式与系统日期框相同：
//   日期 'YYYY-MM-DD'；日期时间 'YYYY-MM-DDTHH:mm'
// 选好后会在隐藏框上触发 change 事件（冒泡）。用代码改了值之后调用 refreshDateField(input)。

import { t, getLang } from './i18n.js';
import { esc, $ } from './ui.js';

const pad = n => String(n).padStart(2, '0');
const locale = () => (getLang() === 'en' ? 'en-US' : 'zh-CN');

function parse(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v || '');
  if (!m) return null;
  return { y: +m[1], mo: +m[2] - 1, d: +m[3], h: m[4] ? +m[4] : 0, mi: m[5] ? +m[5] : 0 };
}

/** 按 App 语言显示：Nov 17, 2026 / 2026年11月17日（带时间时加 14:05） */
export function formatDateValue(v, withTime) {
  const p = parse(v);
  if (!p) return '';
  const d = new Date(p.y, p.mo, p.d, p.h, p.mi);
  const opts = { year: 'numeric', month: getLang() === 'en' ? 'short' : 'long', day: 'numeric' };
  let s = new Intl.DateTimeFormat(locale(), opts).format(d);
  if (withTime) s += ` ${pad(p.h)}:${pad(p.mi)}`;
  return s;
}

/**
 * manual=true：可直接输入日期（YYYY-MM-DD，也认 2026/11/20、2026.11.20、20261120、2026年11月20日），
 * 不弹日历（用户要求直接输入）。只用于纯日期。
 */
export function dateField(name, value, { time = false, manual = false } = {}) {
  if (manual && !time) {
    return `<span class="date-field manual" data-time="0">
      <input type="hidden" name="${esc(name)}" value="${esc(value || '')}">
      <input type="text" class="date-text" inputmode="numeric" placeholder="YYYY-MM-DD" value="${esc(value || '')}" aria-label="${esc(name)}">
    </span>`;
  }
  return `<span class="date-field" data-time="${time ? 1 : 0}">
    <input type="hidden" name="${esc(name)}" value="${esc(value || '')}">
    <button type="button" class="pick-btn date-btn">${esc(formatDateValue(value, time) || t('dpChoose'))}</button>
  </span>`;
}

/** 手动输入的日期 → 'YYYY-MM-DD'；空串返回 ''；无法识别返回 null。 */
export function parseTypedDate(s) {
  s = String(s || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?$/) || s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

export function refreshDateField(input) {
  const wrap = input.closest('.date-field');
  if (!wrap) return;
  if (wrap.classList.contains('manual')) { wrap.querySelector('.date-text').value = input.value; return; }
  const time = wrap.dataset.time === '1';
  wrap.querySelector('.date-btn').textContent = formatDateValue(input.value, time) || t('dpChoose');
}

export function bindDateFields(root) {
  root.querySelectorAll('.date-field').forEach(wrap => {
    const input = wrap.querySelector('input');
    const time = wrap.dataset.time === '1';
    if (wrap.classList.contains('manual')) {
      const text = wrap.querySelector('.date-text');
      const commit = () => {
        const v = parseTypedDate(text.value);
        if (v === null) { text.classList.add('bad'); return; } // 格式不对：标红，不改原值
        text.classList.remove('bad');
        text.value = v;
        if (v !== input.value) { input.value = v; input.dispatchEvent(new Event('change', { bubbles: true })); }
      };
      text.onchange = commit;
      text.onblur = commit;
      text.oninput = () => text.classList.remove('bad');
      return;
    }
    wrap.querySelector('.date-btn').onclick = () => openDatePicker(input.value, time, v => {
      input.value = v;
      refreshDateField(input);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

function openDatePicker(value, withTime, onPick) {
  closeDatePicker();
  const now = new Date();
  const init = parse(value) || { y: now.getFullYear(), mo: now.getMonth(), d: now.getDate(), h: now.getHours(), mi: now.getMinutes() };
  let sel = parse(value) ? { ...init } : null;   // 已选日期
  let view = { y: init.y, mo: init.mo };          // 正在看的月份
  let h = init.h, mi = init.mi;

  const el = document.createElement('div');
  el.id = 'datepicker';
  el.innerHTML = `<div class="dp-box" role="dialog"></div>`;
  document.body.appendChild(el);
  const box = $('.dp-box', el);

  // 星期标题（周日开头），用 App 语言
  const wk = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale(), { weekday: getLang() === 'en' ? 'short' : 'narrow' }).format(new Date(2024, 0, 7 + i)));

  function render() {
    const first = new Date(view.y, view.mo, 1).getDay();
    const days = new Date(view.y, view.mo + 1, 0).getDate();
    const title = new Intl.DateTimeFormat(locale(), { year: 'numeric', month: 'long' }).format(new Date(view.y, view.mo, 1));
    const cells = [];
    for (let i = 0; i < first; i++) cells.push('<span></span>');
    for (let d = 1; d <= days; d++) {
      const isSel = sel && sel.y === view.y && sel.mo === view.mo && sel.d === d;
      const isToday = now.getFullYear() === view.y && now.getMonth() === view.mo && now.getDate() === d;
      cells.push(`<button type="button" data-d="${d}" class="${isSel ? 'sel' : ''} ${isToday ? 'today' : ''}">${d}</button>`);
    }
    box.innerHTML = `
      <div class="dp-head">
        <button type="button" class="dp-nav" data-nav="-1" aria-label="prev">‹</button>
        <b>${esc(title)}</b>
        <button type="button" class="dp-nav" data-nav="1" aria-label="next">›</button>
      </div>
      <div class="dp-grid dp-wk">${wk.map(w => `<span>${esc(w)}</span>`).join('')}</div>
      <div class="dp-grid">${cells.join('')}</div>
      ${withTime ? `<div class="dp-time"><span>${esc(t('dpTime'))}</span>
        <select data-h>${Array.from({ length: 24 }, (_, i) => `<option ${i === h ? 'selected' : ''}>${pad(i)}</option>`).join('')}</select> :
        <select data-mi>${Array.from({ length: 60 }, (_, i) => `<option ${i === mi ? 'selected' : ''}>${pad(i)}</option>`).join('')}</select></div>` : ''}
      <div class="dp-actions">
        <button type="button" class="btn small" data-act="clear">${esc(t('dpClear'))}</button>
        <button type="button" class="btn small" data-act="today">${esc(t(withTime ? 'dpNow' : 'dpToday'))}</button>
        <span class="spacer"></span>
        <button type="button" class="btn small" data-act="cancel">${esc(t('cancel'))}</button>
        <button type="button" class="btn small primary" data-act="ok">${esc(t('dpOk'))}</button>
      </div>`;
  }
  render();

  const out = () => {
    if (!sel) return '';
    const date = `${sel.y}-${pad(sel.mo + 1)}-${pad(sel.d)}`;
    return withTime ? `${date}T${pad(h)}:${pad(mi)}` : date;
  };
  const finish = v => { closeDatePicker(); onPick(v); };

  el.onclick = e => {
    if (e.target === el) return closeDatePicker(); // 点遮罩关闭
    const nav = e.target.closest('[data-nav]');
    if (nav) { view.mo += Number(nav.dataset.nav); if (view.mo < 0) { view.mo = 11; view.y--; } if (view.mo > 11) { view.mo = 0; view.y++; } render(); return; }
    const day = e.target.closest('[data-d]');
    if (day) {
      sel = { y: view.y, mo: view.mo, d: Number(day.dataset.d) };
      if (!withTime) return finish(out()); // 只选日期：点一下就完成
      render(); return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'cancel') closeDatePicker();
    else if (act === 'clear') finish('');
    else if (act === 'today') {
      const n = new Date();
      sel = { y: n.getFullYear(), mo: n.getMonth(), d: n.getDate() };
      h = n.getHours(); mi = n.getMinutes();
      finish(out());
    } else if (act === 'ok') finish(out());
  };
  el.onchange = e => {
    if (e.target.matches('[data-h]')) h = Number(e.target.value);
    if (e.target.matches('[data-mi]')) mi = Number(e.target.value);
  };
}

export function closeDatePicker() {
  document.getElementById('datepicker')?.remove();
}
window.addEventListener('hashchange', closeDatePicker);
