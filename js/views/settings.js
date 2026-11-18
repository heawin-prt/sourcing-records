// 设置页：语言、昵称、存储情况、版本。

import * as db from '../db.js';
import { t, getLang, setLang } from '../i18n.js';
import { esc, $, fmtBytes, toast, DATE_ORDERS, getDateOrder, setDateOrder, fmtDate } from '../ui.js';
import { VERSION } from '../version.js';
import { FX_CURRENCIES, getRates } from '../fx.js';

export async function renderSettings(app, params, ctx) {
  ctx.setTop(t('settings'), '/');
  const nickname = await db.getMeta('nickname', '');
  let est = null, persisted = false;
  try {
    if (navigator.storage?.estimate) est = await navigator.storage.estimate();
    if (navigator.storage?.persisted) persisted = await navigator.storage.persisted();
  } catch { /* 不支持则忽略 */ }

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
    <div class="card">
      <div class="row"><h2 style="margin:0">${esc(t('fxRates'))}</h2><span class="spacer"></span>
        <button class="btn small" id="fx-refresh">${esc(t('fxRefresh'))}</button></div>
      <div id="fx" class="muted" style="margin-top:8px"></div>
    </div>
    <div class="card">
      <h2>${esc(t('storage'))}</h2>
      ${est ? `<p>${esc(t('storageUsed', { used: fmtBytes(est.usage), quota: fmtBytes(est.quota) }))}</p>` : ''}
      <p class="muted">${esc(persisted ? t('persisted') : t('notPersisted'))}</p>
      <p class="muted">${esc(t('dataWarning'))}</p>
    </div>
    <p class="muted" style="text-align:center">${esc(t('version'))} ${VERSION}</p>
  `;

  const paintFx = r => {
    $('#fx').innerHTML = !r ? esc(t('fxNone'))
      : `${FX_CURRENCIES.filter(c => r.rates[c]).map(c => `${c} ${r.rates[c].toFixed(4)}`).join(' · ')}<br>${esc(t('fxDate', { date: fmtDate(r.date) }))}`;
  };
  getRates().then(paintFx);
  $('#fx-refresh').onclick = async () => { paintFx(await getRates({ force: true })); toast(t('saved')); };

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
