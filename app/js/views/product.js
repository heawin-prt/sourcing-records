// 记录产品页（需求第 4、6、8 条）—— 现场最常用的页面，要求单手快速。
//
// 防丢失：安卓手机调用相机时，浏览器可能把页面从内存中清掉，回来后页面重新加载。
// 所以照片一拍完就存进数据库，表单内容实时写成草稿；重新打开页面会自动恢复草稿。

import * as db from '../db.js';
import { t } from '../i18n.js';
import { esc, $, $$, blobUrl, toast, fmtDateTime, confirmDialog, itemTitle, itemTitleHtml, ICONS, autoGrow } from '../ui.js';
import { processPhoto } from '../photo.js';
import { PRICE_CURRENCIES, getRates, convert } from '../fx.js';
import { projectType } from './project-new.js';
import { openPicker } from '../picker.js';

const TEXT_FIELDS = ['material', 'size', 'color', 'quality'];

export async function renderProductForm(app, { pid, iid, prid }, ctx) {
  const item = await db.get('items', iid);
  if (!item) return ctx.nav(`/p/${pid}`, true);
  const isNew = !prid;
  const stored = isNew ? null : await db.get('products', prid);
  if (!isNew && !stored) return ctx.nav(`/p/${pid}/item/${iid}`, true);
  const backPath = `/p/${pid}/item/${iid}`;
  const expo = projectType(await db.get('projects', pid)) === 'exhibition'; // 展会：展位信息，没有市场名称
  const prev = await inputHistory(expo, prid);
  const draftKey = `draft:${prid || 'new:' + iid}`;

  // 状态：先取草稿，没有草稿再取已保存的记录
  const draft = await db.getMeta(draftKey);
  const p = draft?.product || (stored ? { ...stored } : {
    projectId: pid, itemId: iid, photoIds: [], rating: 0, chosen: false,
    qty: item.qty ?? null,
  });
  // 两个币种都默认上一次的选择（第一次：报价人民币、换算美元）
  if (!draft && !stored) {
    p.priceCurrency = await db.getMeta('lastPriceCurrency', 'CNY');
    p.supplierId = await db.getMeta('lastSupplier:' + pid, null); // 供应商默认为本项目上一条记录所选的
    p.fxCurrency = await db.getMeta('lastFxCurrency', 'USD');
  }
  // 旧数据只有人民币价格
  if (p.price === undefined) { p.price = p.priceCny ?? null; p.priceCurrency = p.priceCurrency || 'CNY'; }
  let newPhotoIds = draft?.newPhotoIds || [];  // 本次新增、尚未随产品保存的照片
  const timeEdited = false; // 记录时间不再手动修改（2026-11-17）

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
      <div class="field">
        <div class="label-note-row">
          <span class="muted">${esc(t('price'))}</span>
          <input type="text" name="priceNote" value="${esc(p.priceNote ?? '')}" placeholder="${esc(t('priceNoteHint'))}">
        </div>
        <div class="price-row">
          <input type="number" inputmode="decimal" step="0.01" name="price" value="${esc(p.price ?? '')}">
          <select name="priceCurrency" aria-label="${esc(t('priceCurrency'))}">
            ${PRICE_CURRENCIES.map(c => `<option value="${c}" ${c === p.priceCurrency ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
          <span class="unit">≈</span>
          <input type="text" id="fx-out" class="fx-box" readonly tabindex="-1" aria-label="${esc(t('colFx'))}">
          <select name="fxCurrency" aria-label="${esc(t('fxCurrency'))}">
            <option value="">—</option>
            ${PRICE_CURRENCIES.map(c => `<option value="${c}" ${c === p.fxCurrency ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="muted" id="fx-note"></div>
        <div class="row shop-row note-plus-row plus-only-row">
          <button type="button" class="btn icon-btn plus-btn" id="add-price" title="${esc(t('addPrice'))}" aria-label="${esc(t('addPrice'))}">+</button>
        </div>
        <div id="extra-prices"></div>
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
      ${expo ? '' : `<div class="field"><span>${esc(t('marketName'))}</span><div class="row shop-row">
        <textarea name="marketName" rows="1">${esc(p.marketName ?? '')}</textarea>
        ${prev.markets.length ? `<button type="button" class="btn icon-btn" id="pick-market" aria-label="${esc(t('pickPrevious'))}">▾</button>` : ''}
        <label class="btn icon-btn" title="${esc(t('marketPhoto'))}" aria-label="${esc(t('marketPhoto'))}">${ICONS.camera}<input type="file" accept="image/*" capture="environment" id="market-cam" hidden></label>
      </div>
      <div class="photo-grid small" id="market-photos"></div></div>`}
      <div class="field"><span>${esc(t(expo ? 'standInfo' : 'shopInfo'))}</span>
        <div class="row shop-row">
          <textarea name="shopInfo" rows="1" placeholder="${esc(t(expo ? 'standInfoHint' : 'shopInfoHint'))}">${esc(p.shopInfo ?? '')}</textarea>
          ${prev.shops.length ? `<button type="button" class="btn icon-btn" id="pick-shop" aria-label="${esc(t('pickPrevious'))}">▾</button>` : ''}
          <label class="btn icon-btn" title="${esc(t('shopPhoto'))}" aria-label="${esc(t('shopPhoto'))}">${ICONS.camera}<input type="file" accept="image/*" capture="environment" id="shop-cam" hidden></label>
        </div>
        <div class="photo-grid small" id="shop-photos"></div>
      </div>
     </div>

     <div class="card grp grp-c">
      <div class="grid2">
        ${TEXT_FIELDS.map(k => `<label class="field"><span>${esc(t(k))}</span><input type="text" name="${k}" value="${esc(p[k] ?? '')}"></label>`).join('')}
        <label class="field"><span>${esc(t('leadTime'))}</span><input type="number" inputmode="numeric" name="leadTime" value="${esc(p.leadTime ?? '')}"></label>
        <label class="field"><span>${esc(t('moq'))}</span><input type="text" name="moq" value="${esc(p.moq ?? '')}" placeholder="${esc(t('moqHint'))}"></label>
        <label class="field"><span>${esc(t('plannedQty'))}</span><input type="number" inputmode="numeric" name="qty" value="${esc(p.qty ?? '')}"></label>
      </div>
      <div class="field"><span>${esc(t('note'))}</span>
        <div class="row shop-row note-plus-row">
          <textarea name="note" rows="1">${esc(p.note ?? '')}</textarea>
          <button type="button" class="btn icon-btn plus-btn" id="add-note" title="${esc(t('addNote'))}" aria-label="${esc(t('addNote'))}">+</button>
        </div>
        <div id="extra-notes"></div>
      </div>
      <div class="rec-time muted" id="rec-time"></div>
     </div>
    </form>

    ${isNew ? '' : `<button class="btn danger block" id="del">${esc(t('deleteProduct'))}</button>`}
    <div class="bottom-bar"><div class="inner">
      <button class="btn" id="cancel">${esc(t('cancel'))}</button>
      <button class="btn primary" id="save">${esc(t('save'))}</button>
    </div></div>
  `;

  const form = $('#form');
  autoGrow(form);
  form.supplierId.value = p.supplierId || '';

  // —— 照片 ——
  // 两组照片：产品照片 photoIds（顶部拍照/相册）和店铺/展位照片 shopPhotoIds（店铺信息旁的相机）
  if (!p.shopPhotoIds) p.shopPhotoIds = [];
  if (!p.marketPhotoIds) p.marketPhotoIds = [];
  const GRID = { photoIds: '#photos', marketPhotoIds: '#market-photos', shopPhotoIds: '#shop-photos' };
  async function renderPhotos() {
    for (const [key, sel] of Object.entries(GRID)) {
      const html = [];
      for (const id of p[key]) {
        const ph = await db.get('photos', id);
        if (ph) html.push(`<div class="ph-wrap"><img src="${blobUrl(ph.thumb)}" data-ph="${esc(id)}" alt=""><button type="button" class="del" data-del-photo="${esc(id)}" data-key="${key}">✕</button></div>`);
      }
      if ($(sel)) $(sel).innerHTML = html.join(''); // 展会项目没有市场信息
    }
  }

  async function addFiles(files, key = 'photoIds') {
    for (const file of files) {
      toast(t('processingPhoto'));
      const { blob, thumb, takenAt } = await processPhoto(file);
      const ph = await db.put('photos', { projectId: pid, blob, thumb, takenAt });
      p[key].push(ph.id);
      newPhotoIds.push(ph.id);
      // 第一张产品照片决定记录时间
      if (key === 'photoIds' && !timeEdited && p.photoIds.length === 1) setTime(takenAt || new Date().toISOString());
    }
    await saveDraft();
    renderPhotos();
  }

  $('#cam').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  $('#album').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  $('#shop-cam').onchange = e => { addFiles([...e.target.files], 'shopPhotoIds'); e.target.value = ''; };
  if ($('#market-cam')) $('#market-cam').onchange = e => { addFiles([...e.target.files], 'marketPhotoIds'); e.target.value = ''; };
  const onDelPhoto = async e => {
    const b = e.target.closest('[data-del-photo]');
    if (!b || !await confirmDialog(t('deletePhoto'))) return;
    const id = b.dataset.delPhoto;
    const key = b.dataset.key;
    p[key] = p[key].filter(x => x !== id);
    // 新拍的照片立即删除；原有照片等"保存"时再删除，以便"取消"能撤回
    if (newPhotoIds.includes(id)) { newPhotoIds = newPhotoIds.filter(x => x !== id); await db.remove('photos', id); }
    await saveDraft();
    renderPhotos();
  };
  $('#photos').onclick = onDelPhoto;
  $('#shop-photos').onclick = onDelPhoto;
  if ($('#market-photos')) $('#market-photos').onclick = onDelPhoto;

  // —— 市场名称 / 店铺信息：从以前输入过的内容里选 ——
  const fill = (name, v) => { form.elements[name].value = v; form.elements[name].classList.remove('ocr-filled'); autoGrow(form); collect(); saveDraft(); };
  const pickMarket = $('#pick-market');
  if (pickMarket) pickMarket.onclick = () => openPicker({
    title: t('pickPrevious'), searchPlaceholder: t('marketName'),
    options: prev.markets.map(m => ({ value: m, label: m })),
    selected: form.marketName.value.trim(),
    onPick: v => fill('marketName', v),
  });
  const pickShop = $('#pick-shop');
  if (pickShop) pickShop.onclick = () => openPicker({
    title: t('pickPrevious'), searchPlaceholder: t(expo ? 'standInfo' : 'shopInfo'),
    options: prev.shops.map((s, i) => ({ value: String(i), label: s.shop, sub: s.market })),
    onPick: v => {
      const s = prev.shops[Number(v)];
      fill('shopInfo', s.shop);
      // 店铺带出它所在的市场（市场名称空着时）
      if (s.market && form.marketName && !form.marketName.value.trim()) fill('marketName', s.market);
    },
  });

  // —— 记录时间 ——
  function setTime(iso) {
    p.recordedAt = iso;
    paintTime();
  }
  // 记录时间自动生成（第一张产品照片的拍摄时间，或开始录入的时间），不用手填，只显示
  function paintTime() { $('#rec-time').textContent = p.recordedAt ? `${t('recordedAt')}: ${fmtDateTime(p.recordedAt)}` : ''; }
  paintTime();

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
    p.price = num(form.price.value);
    p.priceCurrency = form.priceCurrency.value || 'CNY';
    p.qty = num(form.qty.value);
    p.leadTime = num(form.leadTime.value);
    for (const k of ['name', 'model', 'marketName', 'shopInfo', ...TEXT_FIELDS, 'moq', 'note']) if (form.elements[k]) p[k] = form.elements[k].value.trim();
    p.supplierId = form.supplierId.value || null;
    p.fxCurrency = form.fxCurrency.value || null;
    p.priceNote = form.priceNote.value.trim();
    p.extraPrices = $$('#extra-prices .extra-price').map(el => ({
      price: num(el.querySelector('[data-k=price]').value),
      currency: el.querySelector('[data-k=currency]').value || 'CNY',
      note: el.querySelector('[data-k=note]').value.trim(),
    }));
    p.extraNotes = $$('#extra-notes textarea').map(el => el.value);
  }

  // —— 新增的价格（每个也有备注）和新增的备注框 ——
  const priceHtml = (x, i) => `
      <div class="extra-price" data-i="${i}">
        <div class="price-row">
          <input type="number" inputmode="decimal" step="0.01" data-k="price" value="${esc(x.price ?? '')}" aria-label="${esc(t('price'))} ${i + 2}">
          <select data-k="currency" aria-label="${esc(t('priceCurrency'))}">
            ${PRICE_CURRENCIES.map(c => `<option value="${c}" ${c === x.currency ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="row shop-row note-plus-row">
          <input type="text" data-k="note" value="${esc(x.note ?? '')}" placeholder="${esc(t('priceNoteHint'))}">
          <button type="button" class="btn icon-btn plus-btn" data-del-price="${i}" title="${esc(t('delete'))}" aria-label="${esc(t('delete'))}">✕</button>
        </div>
      </div>`;
  const noteHtml = (v, i) => `
      <div class="row shop-row note-plus-row extra-note">
        <textarea rows="1" aria-label="${esc(t('note'))} ${i + 2}">${esc(v ?? '')}</textarea>
        <button type="button" class="btn icon-btn plus-btn" data-del-note="${i}" title="${esc(t('delete'))}" aria-label="${esc(t('delete'))}">✕</button>
      </div>`;
  function renderExtras() {
    $('#extra-prices').innerHTML = (p.extraPrices || []).map(priceHtml).join('');
    $('#extra-notes').innerHTML = (p.extraNotes || []).map(noteHtml).join('');
    autoGrow(form);
  }
  // 点 "+" 只在末尾加一组新框，不重画已有的框（避免整块闪一下）
  $('#add-price').onclick = () => {
    collect();
    const x = { price: null, currency: form.priceCurrency.value || 'CNY', note: '' };
    p.extraPrices = [...(p.extraPrices || []), x];
    $('#extra-prices').insertAdjacentHTML('beforeend', priceHtml(x, p.extraPrices.length - 1));
    $('#extra-prices .extra-price:last-child [data-k=price]').focus({ preventScroll: true });
    saveDraft();
  };
  $('#add-note').onclick = () => {
    collect();
    p.extraNotes = [...(p.extraNotes || []), ''];
    $('#extra-notes').insertAdjacentHTML('beforeend', noteHtml('', p.extraNotes.length - 1));
    const row = $('#extra-notes .extra-note:last-child');
    autoGrow(row);
    row.querySelector('textarea').focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest' });
    saveDraft();
  };
  $('#extra-prices').onclick = e => {
    const b = e.target.closest('[data-del-price]');
    if (!b) return;
    collect();
    p.extraPrices.splice(Number(b.dataset.delPrice), 1);
    renderExtras();
    saveDraft();
  };
  $('#extra-notes').onclick = e => {
    const b = e.target.closest('[data-del-note]');
    if (!b) return;
    collect();
    p.extraNotes.splice(Number(b.dataset.delNote), 1);
    renderExtras();
    saveDraft();
  };
  $('#extra-prices').onchange = () => saveDraft();
  renderExtras();

  // —— 币种换算（汇率以人民币为基准：1 元 = rate 外币）——
  // 已保存的产品若币种没变，沿用保存时的汇率快照；否则用当天汇率。
  let rates = null;
  const ratesReady = getRates().then(r => { rates = r; paintFx(); });
  function rateFor(cur, snapCur, snapRate, snapDate) {
    if (!cur) return null;
    if (cur === 'CNY') return { rate: 1, date: null };
    if (stored && stored[snapCur] === cur && stored[snapRate]) return { rate: stored[snapRate], date: stored[snapDate] };
    const r = rates?.rates?.[cur];
    return r ? { rate: r, date: rates.date } : null;
  }
  const priceRate = () => rateFor(form.priceCurrency.value, 'priceCurrency', 'priceRate', 'priceRateDate');
  const fxRate = () => rateFor(form.fxCurrency.value, 'fxCurrency', 'fxRate', 'fxDate');
  /** 报价折成人民币 */
  function cnyOf() {
    const price = num(form.price.value);
    const r = priceRate();
    return price === null || !r ? null : Math.round(price / r.rate * 100) / 100;
  }
  function paintFx() {
    const out = $('#fx-out');
    const cur = form.fxCurrency.value;
    const fx = fxRate();
    const price = num(form.price.value);
    const cny = cnyOf();
    // 两边币种相同：直接等于报价
    out.value = !cur || price === null ? '' : cur === form.priceCurrency.value ? price.toFixed(2) : fx && cny !== null ? convert(cny, fx.rate).toFixed(2) : '';
    const missing = (form.priceCurrency.value && !priceRate()) || (cur && !fx);
    $('#fx-note').textContent = missing ? t('fxUnavailable') : '';
  }
  form.fxCurrency.onchange = () => { paintFx(); saveDraft(); };
  form.priceCurrency.onchange = () => { paintFx(); saveDraft(); };
  paintFx();

  form.oninput = e => {
    if (e.target.name === 'price') paintFx();
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
    await ratesReady;
    const pr = priceRate();
    p.priceRate = pr ? pr.rate : null;
    p.priceRateDate = pr ? pr.date : null;
    p.priceCny = cnyOf(); // 小计、合计都按人民币计算
    const fx = fxRate();
    p.fxRate = fx ? fx.rate : null;
    p.fxDate = fx ? fx.date : null;
    p.extraPrices = (p.extraPrices || []).filter(x => x.price !== null || x.note).map(x => {
      const r = x.currency === 'CNY' ? 1 : rates?.rates?.[x.currency];
      return { ...x, cny: x.price === null || !r ? null : Math.round(x.price / r * 100) / 100 };
    });
    p.extraNotes = (p.extraNotes || []).map(v => v.trim()).filter(Boolean);
    // 记住这次选的两个币种，下次新建产品默认用它们
    await db.setMeta('lastPriceCurrency', p.priceCurrency);
    await db.setMeta('lastSupplier:' + pid, p.supplierId || null);
    await db.setMeta('lastFxCurrency', p.fxCurrency || '');
    await db.put('products', p);
    // 编辑时删掉的旧照片，保存后才真正删除
    if (stored) {
      const keep = new Set([...p.photoIds, ...p.shopPhotoIds, ...p.marketPhotoIds]);
      for (const id of [...(stored.photoIds || []), ...(stored.shopPhotoIds || []), ...(stored.marketPhotoIds || [])]) if (!keep.has(id)) await db.remove('photos', id);
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
    await db.removeProduct({ ...p, photoIds: [...new Set([...(stored.photoIds || []), ...p.photoIds, ...(stored.shopPhotoIds || []), ...p.shopPhotoIds, ...(stored.marketPhotoIds || []), ...p.marketPhotoIds])], shopPhotoIds: [], marketPhotoIds: [] });
    ctx.nav(backPath, true);
  };

  renderPhotos();
  if (picked) flushDraft(); // 把新选中的供应商写进草稿，页面被系统回收后也不丢
}

/**
 * 以前输入过的市场名称和店铺/展位信息（同类型的所有项目，最近的在前，去重）。
 */
async function inputHistory(expo, currentId) {
  const projects = (await db.listProjects()).filter(pr => (projectType(pr) === 'exhibition') === expo);
  const markets = new Map(), shops = new Map();
  for (const pr of projects) {
    for (const p of await db.listByProject('products', pr.id)) {
      if (p.id === currentId) continue;
      const when = p.updatedAt || '';
      const m = (p.marketName || '').trim();
      if (m && !(markets.get(m) >= when)) markets.set(m, when);
      const s = (p.shopInfo || '').trim();
      if (s && !(shops.get(s)?.when >= when)) shops.set(s, { shop: s, market: m, when });
    }
  }
  return {
    markets: [...markets].sort((a, b) => b[1].localeCompare(a[1])).map(([m]) => m),
    shops: [...shops.values()].sort((a, b) => b.when.localeCompare(a.when)),
  };
}
