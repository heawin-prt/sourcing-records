// 产品总览页：按物品分组列出项目里的全部产品，每个产品都可以直接勾选"选定"。

import * as db from '../db.js';
import { t } from '../i18n.js';
import { esc, $, blobUrl, releaseUrls, fmtMoney, stars, toast, itemTitleHtml } from '../ui.js';
import { productFx, fmtProductPrice } from '../fx.js';
import { loadProject } from './summary.js';
import { viewSwitch, supplierOptions } from './overview.js';
import { openPicker } from '../picker.js';

const filters = {};

export async function renderProducts(app, { pid }, ctx) {
  releaseUrls();
  const data = await loadProject(pid);
  if (!data) return ctx.nav('/', true);
  const { project, items, products, suppliers, supplierMap } = data;
  const f = filters[pid] ||= { sup: '', onlyChosen: false };
  if (f.sup && !supplierMap[f.sup]) f.sup = '';

  ctx.setTop(project.name, '/', `<button class="top-btn" id="go-export">${esc(t('exportExcel'))}</button>`);
  $('#go-export').onclick = () => ctx.nav(`/p/${pid}/export`);

  const thumbs = {};
  for (const p of products) {
    const ph = p.photoIds?.length && await db.get('photos', p.photoIds[0]);
    if (ph) thumbs[p.id] = blobUrl(ph.thumb);
  }
  const chosenCount = products.filter(p => p.chosen).length;

  app.innerHTML = `
    ${viewSwitch(pid, 'products')}
    <div class="card compact">
      <h2>${esc(t('productsSummary', { n: products.length, c: chosenCount }))}</h2>
      <div class="row">
        <button type="button" class="pick-btn" id="sup">${esc(f.sup ? supplierMap[f.sup].name : t('allSuppliers'))}</button>
        <label class="check tight"><input type="checkbox" id="only-chosen" ${f.onlyChosen ? 'checked' : ''}>${esc(t('onlyChosen'))}</label>
      </div>
    </div>
    <div id="list"></div>
  `;

  const renderList = () => {
    const groups = items.map(it => ({
      it,
      list: it._products.filter(p => (!f.sup || p.supplierId === f.sup) && (!f.onlyChosen || p.chosen)),
    })).filter(g => g.list.length);
    $('#list').innerHTML = !products.length ? `<p class="empty">${esc(t('noProductsAll'))}</p>`
      : !groups.length ? `<p class="empty">${esc(t('noMatch'))}</p>`
      : groups.map(({ it, list }) => {
        const st = it.status || 'todo';
        return `
        <div class="group-head">
          <span class="name">${itemTitleHtml(it)}</span>
          <span class="chip st-${st}">${esc(t('status_' + st))}</span>
        </div>
        ${list.map(p => {
          const sup = supplierMap[p.supplierId];
          return `
          <div class="list-item prod-row ${p.chosen ? 'chosen' : ''}" data-open="${esc(it.id)}/${esc(p.id)}">
            ${thumbs[p.id] ? `<img class="thumb" src="${thumbs[p.id]}" alt="">` : `<div class="thumb ph">📷</div>`}
            <div class="main">
              <div class="name">${esc(p.name || fmtProductPrice(p) || '—')}</div>
              <div class="meta">
                ${p.name && fmtProductPrice(p) ? `<span>${esc(fmtProductPrice(p))}</span>` : ''}
                ${productFx(p) ? `<span>≈ ${esc(productFx(p))}</span>` : ''}
                ${p.qty ? `<span>×${esc(p.qty)}</span>` : ''}
                ${p.rating ? `<span class="stars">${stars(p.rating)}</span>` : ''}
              </div>
              ${sup ? `<div class="meta"><span>${esc([sup.name, sup.booth].filter(Boolean).join(' · '))}</span></div>` : ''}
            </div>
            <label class="choose"><input type="checkbox" data-choose="${esc(p.id)}" ${p.chosen ? 'checked' : ''}><span>${esc(t('chosen'))}</span></label>
          </div>`;
        }).join('')}`;
      }).join('');
  };
  renderList();

  const supCount = {};
  for (const p of products) if (p.supplierId) supCount[p.supplierId] = (supCount[p.supplierId] || 0) + 1;
  $('#sup').onclick = () => openPicker({
    searchPlaceholder: t('searchSupplier'),
    options: supplierOptions(suppliers, id => supCount[id] || 0),
    selected: f.sup,
    onPick: v => { f.sup = v; renderProducts(app, { pid }, ctx); },
  });
  $('#only-chosen').onchange = e => { f.onlyChosen = e.target.checked; renderList(); };

  app.onchange = async e => {
    const cb = e.target.closest('[data-choose]');
    if (!cb) return;
    const raw = await db.get('products', cb.dataset.choose);
    await db.put('products', { ...raw, chosen: cb.checked });
    const p = products.find(x => x.id === raw.id);
    if (p) p.chosen = cb.checked;
    cb.closest('.prod-row').classList.toggle('chosen', cb.checked);
    toast(t('saved'));
  };
  app.onclick = e => {
    if (e.target.closest('.choose')) return; // 点勾选框不进入编辑
    const row = e.target.closest('[data-open]');
    if (row) {
      const [iid, prid] = row.dataset.open.split('/');
      ctx.nav(`/p/${pid}/item/${iid}/product/${prid}`);
    }
  };
}
