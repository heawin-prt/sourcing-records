// 清单物品：详情页（候选产品、进度、选定）和编辑页（需求第 2、3、9、11、12 条）。

import * as db from '../db.js';
import { t, getLang } from '../i18n.js';
import { CATEGORIES, fieldsFor, label, categoryLabel, resolveCategory, isBuiltinCategory } from '../templates.js';
import { esc, $, $$, blobUrl, fmtMoney, fmtDateTime, stars, toast, confirmDialog, STATUSES, itemTitle, itemTitleHtml, ICONS } from '../ui.js';
import { FX_CURRENCIES } from '../fx.js';
import { openPicker } from '../picker.js';
import { loadProject } from './summary.js';
import { productFx, fmtProductPrice, productPrice } from '../fx.js';
import { processPhoto } from '../photo.js';

export async function renderItem(app, { pid, iid }, ctx) {
  const data = await loadProject(pid);
  const item = data && data.items.find(i => i.id === iid);
  if (!item) return ctx.nav(data ? `/p/${pid}` : '/', true);
  const lang = getLang();
  const st = item.status || 'todo';

  ctx.setTop(itemTitle(item), `/p/${pid}`, `<button class="top-btn icon-only" id="edit-item" title="${esc(t('edit'))}" aria-label="${esc(t('edit'))}">${ICONS.edit}</button>`, itemTitleHtml(item));
  $('#edit-item').onclick = () => ctx.nav(`/p/${pid}/item/${iid}/edit`);

  const fields = fieldsFor(item.category).filter(fd => item.fields?.[fd.key]);
  const itemPhotoUrls = [];
  for (const phId of item.photoIds || []) {
    const ph = await db.get('photos', phId);
    if (ph) itemPhotoUrls.push({ u: blobUrl(ph.thumb), id: phId });
  }
  const photoUrls = {};
  for (const p of item._products) {
    photoUrls[p.id] = [];
    for (const phId of p.photoIds || []) {
      const ph = await db.get('photos', phId);
      if (ph) photoUrls[p.id].push({ u: blobUrl(ph.thumb), id: phId });
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
      ${itemPhotoUrls.length ? `<div class="item-photos">${itemPhotoUrls.map(x => `<img src="${x.u}" data-ph="${esc(x.id)}" alt="">`).join('')}</div>` : ''}
      <dl class="kv">
        <dt>${esc(t('category'))}</dt><dd>${esc(categoryLabel(item.category, lang))}</dd>
        ${item.qty ? `<dt>${esc(t('qty'))}</dt><dd>${esc(item.qty)}</dd>` : ''}
        ${fields.map(fd => `<dt>${esc(label(fd, lang))}</dt><dd>${esc(fieldText(item, fd))}</dd>`).join('')}
        ${item.note ? `<dt>${esc(t('note'))}</dt><dd>${esc(item.note)}</dd>` : ''}
      </dl>
    </div>

    <div class="section-title">${esc(t('candidates'))} · ${item._products.length}</div>
    ${item._products.length ? item._products.map(p => {
      const sup = data.supplierMap[p.supplierId];
      return `
      <div class="card product ${p.chosen ? 'chosen' : ''}">
        ${photoUrls[p.id].length ? `<div class="photos">${photoUrls[p.id].map(x => `<img src="${x.u}" data-ph="${esc(x.id)}" alt="">`).join('')}</div>` : ''}
        ${p.name || p.model || p.rating ? `<div class="product-top">
          <span class="product-name">${esc([p.name, p.model].filter(Boolean).join(' · '))}</span>
          ${p.rating ? `<span class="stars">${stars(p.rating)}</span>` : ''}
        </div>` : ''}
        ${fmtProductPrice(p) || p.qty ? `<div class="head">
          ${fmtProductPrice(p) ? `<span class="price">${esc(fmtProductPrice(p))}</span>` : ''}
          ${productPrice(p).currency !== 'CNY' && p.priceCny != null ? `<span class="muted">≈ ${esc(fmtMoney(p.priceCny))}</span>` : ''}
          ${productFx(p) ? `<span class="muted">≈ ${esc(productFx(p))}</span>` : ''}
          ${p.qty ? `<span class="muted">×${esc(p.qty)}</span>` : ''}
        </div>` : ''}
        ${productLines(p, sup) ? `<div class="muted">${productLines(p, sup)}</div>` : ''}
        <div class="row product-actions">
          <label class="check"><input type="checkbox" data-choose="${esc(p.id)}" ${p.chosen ? 'checked' : ''}>${esc(t('chosen'))}</label>
          <span class="spacer"></span>
          <button class="btn small icon-btn-sm" data-edit="${esc(p.id)}" title="${esc(t('edit'))}" aria-label="${esc(t('edit'))}">${ICONS.edit}</button>
        </div>
      </div>`;
    }).join('') : `<p class="empty">${esc(t('noProducts'))}</p>`}

    <div class="bottom-bar"><div class="inner">
      <button class="btn primary" id="add-product">+ ${esc(t('addProduct'))}</button>
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

  ctx.setTop(isNew ? t('addItem') : itemTitle(item), backPath, '', isNew ? '' : itemTitleHtml(item));

  const fieldInputs = cat => fieldsFor(cat).map(fd => {
    const v = esc(item.fields?.[fd.key] ?? '');
    const lab = esc(label(fd, lang));
    if (fd.currency) { // 预算：金额 + 可选币种
      const cur = item.fields?.[fd.key + 'Currency'] || 'CNY';
      return `<div class="field"><span>${lab}</span><div class="budget-row">
        <input type="number" inputmode="decimal" name="f_${fd.key}" value="${v}">
        <select name="f_${fd.key}Currency">${['CNY', ...FX_CURRENCIES].map(c => `<option ${c === cur ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div></div>`;
    }
    return fd.multiline
      ? `<label class="field"><span>${lab}</span><textarea name="f_${fd.key}">${v}</textarea></label>`
      : `<label class="field"><span>${lab}</span><input type="${fd.type === 'number' ? 'number' : 'text'}" inputmode="${fd.type === 'number' ? 'decimal' : 'text'}" name="f_${fd.key}" value="${v}"></label>`;
  }).join('');

  app.innerHTML = `
    <div class="photo-area">
      <div class="photo-grid" id="item-photos"></div>
      <div class="photo-btns">
        <label class="btn primary">${ICONS.camera}${esc(t('takePhoto'))}<input type="file" accept="image/*" capture="environment" id="cam" hidden></label>
        <label class="btn">${ICONS.album}${esc(t('fromAlbum'))}<input type="file" accept="image/*" multiple id="album" hidden></label>
      </div>
    </div>
    <form id="form" class="card" autocomplete="off">
      <label class="field"><span>${esc(t('itemName'))} *</span><input type="text" name="name" value="${esc(item.name ?? '')}" required></label>
      <div class="grid2">
        <div class="field"><span>${esc(t('category'))}</span>
          <div class="row cat-row"><input type="text" name="category" value="${esc(categoryLabel(item.category, lang))}" placeholder="${esc(t('categoryHint'))}" style="flex:1;min-width:0">
            <button type="button" class="btn" id="cat-pick" aria-label="${esc(t('categoryHint'))}">▾</button></div>
        </div>
        <label class="field"><span>${esc(t('qty'))}</span><input type="number" inputmode="numeric" name="qty" value="${esc(item.qty ?? '')}"></label>
      </div>
      <div id="cat-fields">${fieldInputs(item.category)}</div>
      <label class="field"><span>${esc(t('note'))}</span><textarea name="note">${esc(item.note ?? '')}</textarea></label>
    </form>
    ${isNew ? '' : `<button class="btn danger block" id="del">${esc(t('deleteItem'))}</button>`}
    <div class="bottom-bar"><div class="inner">
      ${isNew ? `<button class="btn" id="save-new">${esc(t('save'))} +</button>` : ''}
      <button class="btn primary" id="save">${esc(t('save'))}</button>
    </div></div>
  `;

  const form = $('#form');

  // —— 物品图片（参考图，如客户清单里的样式图）——
  const storedPhotoIds = [...(item.photoIds || [])];
  item.photoIds = [...storedPhotoIds];
  let newPhotoIds = [];
  async function renderPhotos() {
    const html = [];
    for (const id of item.photoIds) {
      const ph = await db.get('photos', id);
      if (ph) html.push(`<div class="ph-wrap"><img src="${blobUrl(ph.thumb)}" data-ph="${esc(id)}" alt=""><button type="button" class="del" data-del-photo="${esc(id)}">✕</button></div>`);
    }
    $('#item-photos').innerHTML = html.join('');
  }
  async function addFiles(files) {
    for (const file of files) {
      toast(t('processingPhoto'));
      const { blob, thumb, takenAt } = await processPhoto(file);
      const ph = await db.put('photos', { projectId: pid, blob, thumb, takenAt });
      item.photoIds.push(ph.id);
      newPhotoIds.push(ph.id);
    }
    renderPhotos();
  }
  $('#cam').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  $('#album').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  $('#item-photos').onclick = async e => {
    const b = e.target.closest('[data-del-photo]');
    if (!b || !await confirmDialog(t('deletePhoto'))) return;
    const id = b.dataset.delPhoto;
    item.photoIds = item.photoIds.filter(x => x !== id);
    // 新加的照片立即删除；原有照片等保存时再删除
    if (newPhotoIds.includes(id)) { newPhotoIds = newPhotoIds.filter(x => x !== id); await db.remove('photos', id); }
    renderPhotos();
  };
  renderPhotos();

  // 品类：可从列表选（内置品类 + 本项目用过的自定义品类），也可直接输入。切换品类时保留已填的值。
  const used = (await db.listByProject('items', pid)).map(i => i.category).filter(c => c && !isBuiltinCategory(c));
  const catOptions = [...CATEGORIES.map(c => label(c, lang)), ...new Set(used)];
  let shownCat = resolveCategory(form.category.value);
  const refreshFields = () => {
    const key = resolveCategory(form.category.value);
    const tpl = isBuiltinCategory(key) ? key : 'general';
    if (tpl === (isBuiltinCategory(shownCat) ? shownCat : 'general')) { shownCat = key; return; }
    collect();
    shownCat = key;
    $('#cat-fields').innerHTML = fieldInputs(tpl);
  };
  form.category.onchange = refreshFields;
  $('#cat-pick').onclick = () => openPicker({
    options: catOptions.map(c => ({ value: c, label: c })),
    selected: form.category.value.trim(),
    searchPlaceholder: t('categoryHint'),
    onPick: v => { form.category.value = v; refreshFields(); },
  });

  function collect() {
    item.name = form.name.value.trim();
    item.category = resolveCategory(form.category.value);
    item.note = form.note.value.trim();
    item.qty = form.qty.value ? Number(form.qty.value) : null;
    item.fields = { ...(item.fields || {}) };
    $$('[name^="f_"]', form).forEach(el => {
      const v = el.value.trim();
      if (v) item.fields[el.name.slice(2)] = v; else delete item.fields[el.name.slice(2)];
    });
    if (!item.fields.budget) delete item.fields.budgetCurrency; // 没填预算就不记币种
  }

  async function save(andNew) {
    collect();
    if (!item.name) { toast(t('required', { field: t('itemName') })); form.name.focus(); return; }
    if (isNew) item.order = Date.now();
    const saved = await db.put('items', item);
    for (const id of storedPhotoIds) if (!item.photoIds.includes(id)) await db.remove('photos', id);
    await db.touchProject(pid);
    toast(t('saved'));
    if (andNew) renderItemForm(app, { pid }, ctx);
    else ctx.nav(isNew ? `/p/${pid}/item/${saved.id}` : backPath, true);
  }

  $('#save').onclick = () => save(false);
  if (isNew) $('#save-new').onclick = () => save(true);
  form.onsubmit = e => { e.preventDefault(); save(false); };
  if (!isNew) $('#del').onclick = async () => {
    if (!await confirmDialog(t('confirmDeleteItem', { name: item.name }))) return;
    await db.removeItem(item);
    ctx.nav(`/p/${pid}`, true);
  };
  if (isNew) form.name.focus();
}

/** 物品字段的显示文字（预算带币种）。 */
export function fieldText(item, fd) {
  const v = item.fields?.[fd.key];
  if (!fd.currency || v === undefined || v === '') return v ?? '';
  return `${v} ${item.fields[fd.key + 'Currency'] || 'CNY'}`;
}

/** 产品卡片的说明行：没有内容的行不显示（不留空行）。 */
function productLines(p, sup) {
  const join = arr => arr.filter(v => v !== undefined && v !== null && String(v).trim() !== '').join(' · ');
  return [
    sup && join([sup.name, sup.booth, sup.phone]),
    join([p.marketName, p.shopInfo]),
    join([p.material, p.size, p.color, p.quality, p.leadTime && `${t('leadTime')}: ${p.leadTime}`, p.moq && `${t('moq')}: ${p.moq}`]),
    p.note,
    join([fmtDateTime(p.recordedAt), p.createdBy]),
  ].filter(v => v && String(v).trim()).map(v => esc(v)).join('<br>');
}
