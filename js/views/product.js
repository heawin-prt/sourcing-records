// 记录产品页（需求第 4、6、8 条）—— 现场最常用的页面，要求单手快速。
//
// 防丢失：安卓手机调用相机时，浏览器可能把页面从内存中清掉，回来后页面重新加载。
// 所以照片一拍完就存进数据库，表单内容实时写成草稿；重新打开页面会自动恢复草稿。

import * as db from '../db.js';
import { t } from '../i18n.js';
import { esc, $, $$, blobUrl, toast, toLocalInput, fromLocalInput, confirmDialog, itemTitle, itemTitleHtml, ICONS, autoGrow } from '../ui.js';
import { processPhoto } from '../photo.js';
import { FX_CURRENCIES, getRates, convert } from '../fx.js';
import { dateField, bindDateFields, refreshDateField } from '../datepicker.js';

const TEXT_FIELDS = ['material', 'size', 'color', 'quality'];

export async function renderProductForm(app, { pid, iid, prid }, ctx) {
  const item = await db.get('items', iid);
  if (!item) return ctx.nav(`/p/${pid}`, true);
  const isNew = !prid;
  const stored = isNew ? null : await db.get('products', prid);
  if (!isNew && !stored) return ctx.nav(`/p/${pid}/item/${iid}`, true);
  const backPath = `/p/${pid}/item/${iid}`;
  const draftKey = `draft:${prid || 'new:' + iid}`;

  // 状态：先取草稿，没有草稿再取已保存的记录
  const draft = await db.getMeta(draftKey);
  const p = draft?.product || (stored ? { ...stored } : {
    projectId: pid, itemId: iid, photoIds: [], rating: 0, chosen: false,
    qty: item.qty ?? null,
    fxCurrency: 'USD', // 外币默认美元（2026-11-16 用户确定）
  });
  let newPhotoIds = draft?.newPhotoIds || [];  // 本次新增、尚未随产品保存的照片
  let timeEdited = draft?.timeEdited || false; // 用户手动改过记录时间

  const suppliers = (await db.listByProject('suppliers', pid)).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh'));
  // 刚从"新供应商"页保存回来：自动选中新建的供应商
  const pick = await db.getMeta('pickSupplier');
  const picked = !!(pick && pick.projectId === pid);
  if (picked) {
    p.supplierId = pick.id;
    await db.setMeta('pickSupplier', null);
  }
  if (p.supplierId && !suppliers.some(s => s.id === p.supplierId)) p.supplierId = null;

  ctx.setTop(itemTitle(item), backPath, '', itemTitleHtml(item)); // 标题只显示物品名称（带数量）

  app.innerHTML = `
    <div class="photo-area">
      <div class="photo-grid" id="photos"></div>
      <div class="photo-btns">
        <label class="btn primary">${ICONS.camera}${esc(t('takePhoto'))}<input type="file" accept="image/*" capture="environment" id="cam" hidden></label>
        <label class="btn">${ICONS.album}${esc(t('fromAlbum'))}<input type="file" accept="image/*" multiple id="album" hidden></label>
      </div>
    </div>

    <form id="form" class="form-compact" autocomplete="off">
     <div class="card grp grp-a">
      <div class="name-row">
        <label class="field"><span>${esc(t('productName'))}</span>
          <input type="text" name="name" value="${esc(p.name ?? '')}"></label>
        <label class="field"><span>${esc(t('model'))}</span>
          <input type="text" name="model" value="${esc(p.model ?? '')}"></label>
      </div>
      <div class="field"><span class="muted">${esc(t('priceCny'))}</span>
        <div class="price-row">
          <input type="number" inputmode="decimal" step="0.01" name="priceCny" value="${esc(p.priceCny ?? '')}">
          <span class="unit">¥</span>
          <input type="text" id="fx-out" class="fx-box" readonly tabindex="-1" aria-label="${esc(t('colFx'))}">
          <select name="fxCurrency" aria-label="${esc(t('fxCurrency'))}">
            <option value="">—</option>
            ${FX_CURRENCIES.map(c => `<option value="${c}" ${c === p.fxCurrency ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="muted" id="fx-note"></div>
      </div>
      <div class="field"><span class="muted">${esc(t('rating'))}</span>
        <div class="rating" id="rating">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-r="${n}" aria-label="${n}">★</button>`).join('')}</div>
      </div>
     </div>

     <div class="card grp grp-b">
      <div class="field"><span class="muted">${esc(t('supplier'))}</span>
        <div class="row">
          <select name="supplierId" style="flex:1">
            <option value="">${esc(t('noSupplier'))}</option>
            ${suppliers.map(s => `<option value="${esc(s.id)}">${esc([s.name, s.booth].filter(Boolean).join(' · '))}</option>`).join('')}
          </select>
          <button type="button" class="btn" id="new-sup">${esc(t('newSupplier'))}</button>
        </div>
      </div>
      <label class="field"><span>${esc(t('marketName'))}</span><input type="text" name="marketName" value="${esc(p.marketName ?? '')}"></label>
      <label class="field"><span>${esc(t('shopInfo'))}</span><textarea name="shopInfo" rows="1" placeholder="${esc(t('shopInfoHint'))}">${esc(p.shopInfo ?? '')}</textarea></label>
     </div>

     <div class="card grp grp-c">
      <div class="grid2">
        ${TEXT_FIELDS.map(k => `<label class="field"><span>${esc(t(k))}</span><input type="text" name="${k}" value="${esc(p[k] ?? '')}"></label>`).join('')}
        <label class="field"><span>${esc(t('leadTime'))}</span><input type="number" inputmode="numeric" name="leadTime" value="${esc(p.leadTime ?? '')}"></label>
        <label class="field"><span>${esc(t('moq'))}</span><input type="text" name="moq" value="${esc(p.moq ?? '')}" placeholder="${esc(t('moqHint'))}"></label>
        <label class="field"><span>${esc(t('plannedQty'))}</span><input type="number" inputmode="numeric" name="qty" value="${esc(p.qty ?? '')}"></label>
      </div>
      <label class="field"><span>${esc(t('note'))}</span><textarea name="note" rows="1">${esc(p.note ?? '')}</textarea></label>
      <div class="field"><span>${esc(t('recordedAt'))}</span>
        ${dateField('recordedAt', toLocalInput(p.recordedAt), { time: true })}</div>
     </div>
    </form>

    ${isNew ? '' : `<button class="btn danger block" id="del">${esc(t('deleteProduct'))}</button>`}
    <div class="bottom-bar"><div class="inner">
      <button class="btn" id="cancel">${esc(t('cancel'))}</button>
      <button class="btn primary" id="save">${esc(t('save'))}</button>
    </div></div>
  `;

  const form = $('#form');
  bindDateFields(form);
  autoGrow(form);
  form.supplierId.value = p.supplierId || '';

  // —— 照片 ——
  async function renderPhotos() {
    const html = [];
    for (const id of p.photoIds) {
      const ph = await db.get('photos', id);
      if (ph) html.push(`<div class="ph-wrap"><img src="${blobUrl(ph.thumb)}" alt=""><button type="button" class="del" data-del-photo="${esc(id)}">✕</button></div>`);
    }
    $('#photos').innerHTML = html.join('');
  }

  async function addFiles(files) {
    for (const file of files) {
      toast(t('processingPhoto'));
      const { blob, thumb, takenAt } = await processPhoto(file);
      const ph = await db.put('photos', { projectId: pid, blob, thumb, takenAt });
      p.photoIds.push(ph.id);
      newPhotoIds.push(ph.id);
      // 第一张照片决定记录时间
      if (!timeEdited && p.photoIds.length === 1) setTime(takenAt || new Date().toISOString());
    }
    await saveDraft();
    renderPhotos();
  }

  $('#cam').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  $('#album').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  $('#photos').onclick = async e => {
    const b = e.target.closest('[data-del-photo]');
    if (!b || !await confirmDialog(t('deletePhoto'))) return;
    const id = b.dataset.delPhoto;
    p.photoIds = p.photoIds.filter(x => x !== id);
    // 新拍的照片立即删除；原有照片等"保存"时再删除，以便"取消"能撤回
    if (newPhotoIds.includes(id)) { newPhotoIds = newPhotoIds.filter(x => x !== id); await db.remove('photos', id); }
    await saveDraft();
    renderPhotos();
  };

  // —— 记录时间 ——
  function setTime(iso) {
    p.recordedAt = iso;
    form.recordedAt.value = toLocalInput(iso);
    refreshDateField(form.recordedAt);
  }
  form.recordedAt.onchange = () => { timeEdited = true; p.recordedAt = fromLocalInput(form.recordedAt.value); saveDraft(); };

  // —— 评分 ——
  const paintRating = () => $$('#rating button').forEach(b => b.classList.toggle('on', Number(b.dataset.r) <= (p.rating || 0)));
  $('#rating').onclick = e => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    const r = Number(b.dataset.r);
    p.rating = p.rating === r ? 0 : r; // 再点同一颗星可清除
    paintRating();
    saveDraft();
  };
  paintRating();

  // —— 供应商 ——
  // 只选择供应商；供应商信息在专门的供应商页填写和查看
  form.supplierId.onchange = () => saveDraft();
  $('#new-sup').onclick = async () => {
    await flushDraft();
    ctx.nav(`/p/${pid}/supplier/new?pick=1`);
  };

  // —— 表单其余字段 ——
  const num = v => (v === '' ? null : Number(v));
  function collect() {
    p.priceCny = num(form.priceCny.value);
    p.qty = num(form.qty.value);
    p.leadTime = num(form.leadTime.value);
    for (const k of ['name', 'model', 'marketName', 'shopInfo', ...TEXT_FIELDS, 'moq', 'note']) p[k] = form.elements[k].value.trim();
    p.supplierId = form.supplierId.value || null;
    p.fxCurrency = form.fxCurrency.value || null;
  }

  // —— 外币换算 ——
  // 已保存的产品若币种没变，沿用保存时的汇率快照；否则用当天汇率。
  let rates = null;
  const ratesReady = getRates().then(r => { rates = r; paintFx(); });
  function rateFor(cur) {
    if (!cur) return null;
    if (stored && stored.fxCurrency === cur && stored.fxRate) return { rate: stored.fxRate, date: stored.fxDate };
    const r = rates?.rates?.[cur];
    return r ? { rate: r, date: rates.date } : null;
  }
  function paintFx() {
    const cur = form.fxCurrency.value;
    const out = $('#fx-out');
    const fx = rateFor(cur);
    const price = num(form.priceCny.value);
    out.value = fx && price !== null ? convert(price, fx.rate).toFixed(2) : '';
    $('#fx-note').textContent = cur && !fx ? t('fxUnavailable') : '';
  }
  form.fxCurrency.onchange = () => { paintFx(); saveDraft(); };
  paintFx();

  form.oninput = e => {
    if (e.target.name === 'recordedAt') return;
    if (e.target.name === 'priceCny') paintFx();
    collect();
    // 没有照片时，第一次录入文字的时间就是记录时间
    if (!p.recordedAt && !timeEdited) setTime(new Date().toISOString());
    saveDraft();
  };

  let draftTimer = null;
  function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(flushDraft, 300);
    return Promise.resolve();
  }

  async function flushDraft() {
    clearTimeout(draftTimer);
    collect();
    await db.setMeta(draftKey, { product: p, newPhotoIds, timeEdited });
  }

  async function clearDraft() {
    clearTimeout(draftTimer);
    await db.setMeta(draftKey, undefined);
  }

  $('#save').onclick = async () => {
    collect();
    if (!p.recordedAt) p.recordedAt = new Date().toISOString();
    if (p.fxCurrency) await ratesReady;
    const fx = rateFor(p.fxCurrency);
    p.fxRate = fx ? fx.rate : null;
    p.fxDate = fx ? fx.date : null;
    await db.put('products', p);
    // 编辑时删掉的旧照片，保存后才真正删除
    if (stored) {
      for (const id of stored.photoIds || []) if (!p.photoIds.includes(id)) await db.remove('photos', id);
    }
    // 物品有了第一个候选产品，进度从"未开始"自动改成"待决定"
    if ((item.status || 'todo') === 'todo') {
      await db.put('items', { ...item, status: 'pending' });
    }
    await db.touchProject(pid);
    await clearDraft();
    toast(t('saved'));
    ctx.nav(backPath, true);
  };

  $('#cancel').onclick = async () => {
    for (const id of newPhotoIds) await db.remove('photos', id);
    await clearDraft();
    ctx.nav(backPath, true);
  };

  if (!isNew) $('#del').onclick = async () => {
    if (!await confirmDialog(t('confirmDeleteProduct'))) return;
    await clearDraft();
    await db.removeProduct({ ...p, photoIds: [...new Set([...(stored.photoIds || []), ...p.photoIds])] });
    ctx.nav(backPath, true);
  };

  renderPhotos();
  if (picked) flushDraft(); // 把新选中的供应商写进草稿，页面被系统回收后也不丢
}
