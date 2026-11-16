// 清单物品：详情页（候选产品、进度、选定）和编辑页（需求第 2、3、9、11、12 条）。

import * as db from '../db.js';
import { t, getLang } from '../i18n.js';
import { CATEGORIES, getCategory, fieldsFor, label } from '../templates.js';
import { esc, $, $$, blobUrl, fmtMoney, fmtDateTime, stars, toast, STATUSES } from '../ui.js';
import { loadProject } from './summary.js';
import { productFx } from '../fx.js';

export async function renderItem(app, { pid, iid }, ctx) {
  const data = await loadProject(pid);
  const item = data && data.items.find(i => i.id === iid);
  if (!item) return ctx.nav(data ? `/p/${pid}` : '/', true);
  const lang = getLang();
  const st = item.status || 'todo';

  ctx.setTop(item.name, `/p/${pid}`, `<button class="top-btn" id="edit-item">${esc(t('edit'))}</button>`);
  $('#edit-item').onclick = () => ctx.nav(`/p/${pid}/item/${iid}/edit`);

  const fields = fieldsFor(item.category).filter(fd => item.fields?.[fd.key]);
  const photoUrls = {};
  for (const p of item._products) {
    photoUrls[p.id] = [];
    for (const phId of p.photoIds || []) {
      const ph = await db.get('photos', phId);
      if (ph) photoUrls[p.id].push(blobUrl(ph.thumb));
    }
  }

  app.innerHTML = `
    <div class="card">
      <h2>${esc(t('status'))}</h2>
      <div class="seg" id="status">
        ${STATUSES.map(s => `<button data-st="${s}" class="${s === st ? 'on st-' + s : ''}">${esc(t('status_' + s))}</button>`).join('')}
      </div>
    </div>

    <div class="card">
      <h2>${esc(t('listInfo'))}</h2>
      <dl class="kv">
        <dt>${esc(t('category'))}</dt><dd>${esc(label(getCategory(item.category), lang))}</dd>
        ${item.qty ? `<dt>${esc(t('qty'))}</dt><dd>${esc(item.qty)}</dd>` : ''}
        ${fields.map(fd => `<dt>${esc(label(fd, lang))}</dt><dd>${esc(item.fields[fd.key])}</dd>`).join('')}
      </dl>
    </div>

    <div class="section-title">${esc(t('candidates'))} · ${item._products.length}</div>
    ${item._products.length ? item._products.map(p => {
      const sup = data.supplierMap[p.supplierId];
      return `
      <div class="card product ${p.chosen ? 'chosen' : ''}">
        ${photoUrls[p.id].length ? `<div class="photos">${photoUrls[p.id].map(u => `<img src="${u}" alt="">`).join('')}</div>` : ''}
        ${p.name ? `<div class="product-name">${esc(p.name)}</div>` : ''}
        <div class="head">
          <span class="price">${esc(fmtMoney(p.priceCny)) || '—'}</span>
          ${productFx(p) ? `<span class="muted">≈ ${esc(productFx(p))}</span>` : ''}
          ${p.qty ? `<span class="muted">×${esc(p.qty)}</span>` : ''}
          <span class="stars">${stars(p.rating)}</span>
          <span class="spacer"></span>
          <label class="check"><input type="checkbox" data-choose="${esc(p.id)}" ${p.chosen ? 'checked' : ''}>${esc(t('chosen'))}</label>
        </div>
        <div class="muted">
          ${sup ? esc([sup.name, sup.booth, sup.phone].filter(Boolean).join(' · ')) + '<br>' : ''}
          ${esc([p.material, p.size, p.color, p.leadTime && `${t('leadTime')}: ${p.leadTime}`, p.moq && `${t('moq')}: ${p.moq}`].filter(Boolean).join(' · '))}
          ${p.note ? `<br>${esc(p.note)}` : ''}
          <br>${esc(fmtDateTime(p.recordedAt))}${p.createdBy ? ' · ' + esc(p.createdBy) : ''}
        </div>
        <div class="row" style="margin-top:8px"><span class="spacer"></span>
          <button class="btn small" data-edit="${esc(p.id)}">${esc(t('edit'))}</button>
        </div>
      </div>`;
    }).join('') : `<p class="empty">${esc(t('noProducts'))}</p>`}

    <div class="bottom-bar"><div class="inner">
      <button class="btn primary" id="add-product">📷 ${esc(t('addProduct'))}</button>
    </div></div>
  `;

  $('#add-product').onclick = () => ctx.nav(`/p/${pid}/item/${iid}/product/new`);

  $('#status').onclick = async e => {
    const b = e.target.closest('[data-st]');
    if (!b) return;
    const raw = await db.get('items', iid);
    await db.put('items', { ...raw, status: b.dataset.st });
    $$('#status button').forEach(x => { x.className = x === b ? `on st-${x.dataset.st}` : ''; });
    toast(t('saved'));
  };

  app.onchange = async e => {
    const cb = e.target.closest('[data-choose]');
    if (!cb) return;
    const raw = await db.get('products', cb.dataset.choose);
    await db.put('products', { ...raw, chosen: cb.checked });
    cb.closest('.product').classList.toggle('chosen', cb.checked);
    toast(t('saved'));
  };

  app.onclick = e => {
    const b = e.target.closest('[data-edit]');
    if (b) ctx.nav(`/p/${pid}/item/${iid}/product/${b.dataset.edit}`);
  };
}

export async function renderItemForm(app, { pid, iid }, ctx) {
  const project = await db.get('projects', pid);
  if (!project) return ctx.nav('/', true);
  const isNew = !iid;
  const item = isNew ? { projectId: pid, category: 'general', fields: {}, status: 'todo' } : await db.get('items', iid);
  if (!item) return ctx.nav(`/p/${pid}`, true);
  const lang = getLang();
  const backPath = isNew ? `/p/${pid}` : `/p/${pid}/item/${iid}`;

  ctx.setTop(isNew ? t('addItem') : item.name, backPath);

  const fieldInputs = cat => fieldsFor(cat).map(fd => {
    const v = esc(item.fields?.[fd.key] ?? '');
    const lab = esc(label(fd, lang));
    return fd.multiline
      ? `<label class="field"><span>${lab}</span><textarea name="f_${fd.key}">${v}</textarea></label>`
      : `<label class="field"><span>${lab}</span><input type="${fd.type === 'number' ? 'number' : 'text'}" inputmode="${fd.type === 'number' ? 'decimal' : 'text'}" name="f_${fd.key}" value="${v}"></label>`;
  }).join('');

  app.innerHTML = `
    <form id="form" class="card" autocomplete="off">
      <label class="field"><span>${esc(t('itemName'))} *</span><input type="text" name="name" value="${esc(item.name ?? '')}" required></label>
      <div class="grid2">
        <label class="field"><span>${esc(t('category'))}</span>
          <select name="category">${CATEGORIES.map(c => `<option value="${c.key}" ${c.key === item.category ? 'selected' : ''}>${esc(label(c, lang))}</option>`).join('')}</select>
        </label>
        <label class="field"><span>${esc(t('qty'))}</span><input type="number" inputmode="numeric" name="qty" value="${esc(item.qty ?? '')}"></label>
      </div>
      <div id="cat-fields">${fieldInputs(item.category)}</div>
    </form>
    ${isNew ? '' : `<button class="btn danger block" id="del">${esc(t('deleteItem'))}</button>`}
    <div class="bottom-bar"><div class="inner">
      ${isNew ? `<button class="btn" id="save-new">${esc(t('save'))} ＋</button>` : ''}
      <button class="btn primary" id="save">${esc(t('save'))}</button>
    </div></div>
  `;

  const form = $('#form');
  // 切换品类时保留已填的值
  form.category.onchange = () => {
    collect();
    $('#cat-fields').innerHTML = fieldInputs(form.category.value);
  };

  function collect() {
    item.name = form.name.value.trim();
    item.category = form.category.value;
    item.qty = form.qty.value ? Number(form.qty.value) : null;
    item.fields = { ...(item.fields || {}) };
    $$('[name^="f_"]', form).forEach(el => {
      const v = el.value.trim();
      if (v) item.fields[el.name.slice(2)] = v; else delete item.fields[el.name.slice(2)];
    });
  }

  async function save(andNew) {
    collect();
    if (!item.name) { toast(t('required', { field: t('itemName') })); form.name.focus(); return; }
    if (isNew) item.order = Date.now();
    const saved = await db.put('items', item);
    await db.touchProject(pid);
    toast(t('saved'));
    if (andNew) renderItemForm(app, { pid }, ctx);
    else ctx.nav(isNew ? `/p/${pid}/item/${saved.id}` : backPath, true);
  }

  $('#save').onclick = () => save(false);
  if (isNew) $('#save-new').onclick = () => save(true);
  form.onsubmit = e => { e.preventDefault(); save(false); };
  if (!isNew) $('#del').onclick = async () => {
    if (!confirm(t('confirmDeleteItem', { name: item.name }))) return;
    await db.removeItem(item);
    ctx.nav(`/p/${pid}`, true);
  };
  if (isNew) form.name.focus();
}
