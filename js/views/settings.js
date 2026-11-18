// 设置页：语言、日期格式、昵称、刷新汇率、版本。

import * as db from '../db.js';
import { t, getLang, setLang } from '../i18n.js';
import { esc, $, fmtBytes, toast, DATE_ORDERS, getDateOrder, setDateOrder, fmtDate } from '../ui.js';
import { VERSION } from '../version.js';
import { getRates } from '../fx.js';

export async function renderSettings(app, params, ctx) {
  ctx.setTop(t('settings'), '/');
  const nickname = await db.getMeta('nickname', '');

  app.innerHTML = `
    <div class="card">
      <label class="field"><span>${esc(t('language'))}</span>
        <select id="lang">
          <option value="zh" ${getLang() === 'zh' ? 'selected' : ''}>中文</option>
          <option value="en" ${getLang() === 'en' ? 'selected' : ''}>English</option>
        </select></label>
      <label class="field"><span>${esc(t('dateFormat'))}</span>
        <select id="date-order">
          ${DATE_ORDERS.map(o => `<option value="${o}" ${getDateOrder() === o ? 'selected' : ''}>${esc(t('dateOrder_' + o))} — ${fmtDate('2026-11-20', o)}</option>`).join('')}
        </select></label>
      <label class="field"><span>${esc(t('nickname'))}</span>
        <input type="text" id="nick" value="${esc(nickname)}" maxlength="20">
        <span class="muted">${esc(t('nicknameHint'))}</span></label>
    </div>
    <button class="btn block" id="fx-refresh">${esc(t('fxRefresh'))}</button>
    <p class="muted" style="text-align:center">${esc(t('version'))} ${VERSION}</p>
  `;

  // 汇率每天自动更新一次（用到时联网取）；这里只提供手动刷新
  $('#fx-refresh').onclick = async () => {
    const b = $('#fx-refresh');
    b.disabled = true;
    const r = await getRates({ force: true });
    b.disabled = false;
    toast(r ? t('fxUpdated', { date: fmtDate(r.date) }) : t('fxNone'));
  };

  $('#lang').onchange = async e => {
    setLang(e.target.value);
    await db.setMeta('lang', e.target.value);
    renderSettings(app, params, ctx);
  };
  $('#date-order').onchange = async e => {
    setDateOrder(e.target.value);
    await db.setMeta('dateOrder', e.target.value);
    toast(t('saved'));
    renderSettings(app, params, ctx);
  };
  $('#nick').onchange = async e => {
    const v = e.target.value.trim();
    await db.setMeta('nickname', v);
    db.setCurrentUser(v);
    toast(t('saved'));
  };
}
