// 供应商：专门的列表页和编辑页。产品页里只选择供应商，不在那里填写供应商信息。

import * as db from '../db.js';
import { t } from '../i18n.js';
import { esc, $, blobUrl, toast } from '../ui.js';
import { processPhoto } from '../photo.js';
import { recognize, parseCard } from '../ocr.js';

export const SUP_FIELDS = [
  { key: 'name', label: 'supplierName', required: true },
  { key: 'contact', label: 'contact' },
  { key: 'phone', label: 'phone', type: 'tel' },
  { key: 'email', label: 'email', type: 'email' },
  { key: 'booth', label: 'booth' },
  { key: 'storeLocation', label: 'storeLocation', placeholder: 'storeLocationHint', geo: true },
  { key: 'address', label: 'address' },
];

/** 高德地图链接（国内可用），只在用户点击时打开。 */
const mapUrl = g => `https://uri.amap.com/marker?position=${g.lng},${g.lat}&coordinate=wgs84&callnative=1`;

export async function renderSupplierList(app, { pid }, ctx) {
  const project = await db.get('projects', pid);
  if (!project) return ctx.nav('/', true);
  ctx.setTop(`${t('suppliers')} · ${project.name}`, `/p/${pid}`);

  const [suppliers, products] = await Promise.all([
    db.listByProject('suppliers', pid),
    db.listByProject('products', pid),
  ]);
  suppliers.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh'));
  const used = {};
  for (const p of products) if (p.supplierId) used[p.supplierId] = (used[p.supplierId] || 0) + 1;

  const thumbs = {};
  for (const s of suppliers) {
    const ph = s.cardPhotoId && await db.get('photos', s.cardPhotoId);
    if (ph) thumbs[s.id] = blobUrl(ph.thumb);
  }

  app.innerHTML = `
    ${suppliers.length ? suppliers.map(s => `
      <div class="list-item" data-open="${esc(s.id)}">
        ${thumbs[s.id] ? `<img class="thumb" src="${thumbs[s.id]}" alt="">` : `<div class="thumb ph">🏪</div>`}
        <div class="main">
          <div class="name">${esc(s.name)}</div>
          <div class="meta">
            ${s.booth ? `<span>${esc(s.booth)}</span>` : ''}
            ${s.storeLocation ? `<span>${esc(s.storeLocation)}</span>` : ''}
            ${s.phone ? `<span>${esc(s.phone)}</span>` : ''}
            ${s.contact ? `<span>${esc(s.contact)}</span>` : ''}
            <span>${esc(t('productsCount', { n: used[s.id] || 0 }))}</span>
          </div>
        </div>
      </div>`).join('') : `<p class="empty">${esc(t('noSuppliers'))}</p>`}
    <button class="btn primary fab" id="add">＋ ${esc(t('addSupplier'))}</button>
  `;

  $('#add').onclick = () => ctx.nav(`/p/${pid}/supplier/new`);
  app.onclick = e => {
    const row = e.target.closest('[data-open]');
    if (row) ctx.nav(`/p/${pid}/supplier/${row.dataset.open}`);
  };
}

/**
 * 供应商编辑页。query.pick=1 表示从"记录产品"页跳过来：保存后返回并自动选中这个供应商。
 */
export async function renderSupplierForm(app, { pid, sid }, ctx, query = {}) {
  const project = await db.get('projects', pid);
  if (!project) return ctx.nav('/', true);
  const isNew = !sid;
  const sup = isNew ? { projectId: pid } : await db.get('suppliers', sid);
  if (!sup) return ctx.nav(`/p/${pid}/suppliers`, true);
  const fromProduct = query.pick === '1';
  const goBack = fromProduct || query.back === '1'; // 从产品页或总览页来的，完成后返回原页面
  const leave = () => (goBack ? history.back() : ctx.nav(`/p/${pid}/suppliers`, true));

  ctx.setTop(isNew ? t('addSupplier') : sup.name, goBack ? null : `/p/${pid}/suppliers`);
  if (goBack) { const b = $('#nav-back'); b.hidden = false; b.onclick = () => history.back(); }

  let cardPhotoId = sup.cardPhotoId || null;
  let newPhotoId = null; // 本次新拍、尚未保存的名片照片

  app.innerHTML = `
    <div class="card">
      <h2>${esc(t('cardPhoto'))}</h2>
      <div class="photo-grid" id="card"></div>
      <div class="photo-btns">
        <label class="btn primary">📷 ${esc(t('scanCard'))}<input type="file" accept="image/*" capture="environment" id="cam" hidden></label>
        <label class="btn">🖼 ${esc(t('fromAlbum'))}<input type="file" accept="image/*" id="album" hidden></label>
      </div>
      <div class="row" style="margin-top:8px">
        <button type="button" class="btn small" id="ocr">🔍 ${esc(t('recognizeCard'))}</button>
        <span class="muted" id="ocr-status"></span>
      </div>
    </div>
    <form id="form" class="card" autocomplete="off">
      ${SUP_FIELDS.map(f => {
        const input = `<input type="${f.type || 'text'}" name="${f.key}" value="${esc(sup[f.key] ?? '')}" ${f.placeholder ? `placeholder="${esc(t(f.placeholder))}"` : ''}>`;
        if (!f.geo) return `<label class="field"><span>${esc(t(f.label))}${f.required ? ' *' : ''}</span>${input}</label>`;
        // 门店位置：文字描述 + 可选的手机定位
        return `<div class="field"><span>${esc(t(f.label))}</span>
          <div class="row">${input}<button type="button" class="btn" id="geo-btn" title="${esc(t('geoLocate'))}">📍</button></div>
          <div class="muted" id="geo-info"></div></div>`;
      }).join('')}
      <label class="field"><span>${esc(t('note'))}</span><textarea name="note">${esc(sup.note ?? '')}</textarea></label>
      <label class="field"><span>${esc(t('ocrText'))}</span><textarea name="ocrText" rows="4">${esc(sup.ocrText ?? '')}</textarea></label>
    </form>
    ${isNew ? '' : `<button class="btn danger block" id="del">${esc(t('deleteSupplier'))}</button>`}
    <div class="bottom-bar"><div class="inner">
      <button class="btn" id="cancel">${esc(t('cancel'))}</button>
      <button class="btn primary" id="save">${esc(t('save'))}</button>
    </div></div>
  `;

  const form = $('#form');

  // —— 门店定位（需要 https 正式网址或 localhost；局域网 http 测试时浏览器不允许定位）——
  let geo = sup.geo || null;
  function paintGeo(msg) {
    $('#geo-info').innerHTML = msg ? esc(msg)
      : geo ? `${esc(t('geoSaved', { acc: Math.round(geo.acc || 0) }))} · <a href="${mapUrl(geo)}" target="_blank" rel="noopener">${esc(t('geoOpenMap'))}</a> · <a href="#" id="geo-clear">${esc(t('delete'))}</a>` : '';
    const clr = $('#geo-clear');
    if (clr) clr.onclick = e => { e.preventDefault(); geo = null; paintGeo(); };
  }
  paintGeo();
  $('#geo-btn').onclick = () => {
    if (!window.isSecureContext || !navigator.geolocation) { paintGeo(t('geoNeedHttps')); return; }
    paintGeo(t('geoLocating'));
    navigator.geolocation.getCurrentPosition(
      pos => { geo = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, at: new Date().toISOString() }; paintGeo(); },
      () => paintGeo(t('geoFailed')),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  async function renderCard() {
    const ph = cardPhotoId && await db.get('photos', cardPhotoId);
    $('#card').innerHTML = ph ? `<div class="ph-wrap"><img src="${blobUrl(ph.thumb)}" alt=""><button type="button" class="del" id="del-card">✕</button></div>` : '';
    const d = $('#del-card');
    if (d) d.onclick = async () => {
      if (!confirm(t('deletePhoto'))) return;
      if (newPhotoId) { await db.remove('photos', newPhotoId); newPhotoId = null; }
      cardPhotoId = null;
      renderCard();
    };
  }

  async function addFile(file) {
    if (!file) return;
    toast(t('processingPhoto'));
    const { blob, thumb, takenAt } = await processPhoto(file);
    if (newPhotoId) await db.remove('photos', newPhotoId);
    const ph = await db.put('photos', { projectId: pid, blob, thumb, takenAt });
    newPhotoId = cardPhotoId = ph.id;
    await renderCard();
    runOcr(); // 拍完名片自动识别
  }
  $('#cam').onchange = e => { addFile(e.target.files[0]); e.target.value = ''; };
  $('#album').onchange = e => { addFile(e.target.files[0]); e.target.value = ''; };

  // —— 名片识别：只填空着的字段，已填的不覆盖 ——
  let ocrBusy = false;
  async function runOcr() {
    if (ocrBusy) return;
    const ph = cardPhotoId && await db.get('photos', cardPhotoId);
    const status = $('#ocr-status');
    if (!ph) { toast(t('ocrNoCard')); return; }
    ocrBusy = true;
    $('#ocr').disabled = true;
    status.textContent = t('ocrLoading');
    try {
      const text = await recognize(ph.blob, m => {
        if (m.status === 'recognizing text') status.textContent = `${t('ocrRunning')} ${Math.round(m.progress * 100)}%`;
        else if (/load|initializ/i.test(m.status)) status.textContent = t('ocrLoading');
      });
      form.ocrText.value = text;
      const found = parseCard(text);
      let n = 0;
      for (const [k, v] of Object.entries(found)) {
        if (v && form[k] && !form[k].value.trim()) { form[k].value = v; form[k].classList.add('ocr-filled'); n++; }
      }
      status.textContent = n ? t('ocrFilled', { n }) : t('ocrNothing');
    } catch (err) {
      console.error(err);
      status.textContent = t('ocrFailed');
    } finally {
      ocrBusy = false;
      $('#ocr').disabled = false;
    }
  }
  $('#ocr').onclick = runOcr;
  form.oninput = e => e.target.classList.remove('ocr-filled');

  $('#save').onclick = async () => {
    const rec = { ...sup };
    for (const f of SUP_FIELDS) rec[f.key] = form[f.key].value.trim();
    rec.note = form.note.value.trim();
    rec.ocrText = form.ocrText.value.trim();
    rec.geo = geo;
    if (!rec.name) { toast(t('required', { field: t('supplierName') })); form.name.focus(); return; }
    const oldCard = sup.cardPhotoId;
    rec.cardPhotoId = cardPhotoId;
    const saved = await db.put('suppliers', rec);
    if (oldCard && oldCard !== cardPhotoId) await db.remove('photos', oldCard);
    if (fromProduct) await db.setMeta('pickSupplier', { projectId: pid, id: saved.id });
    toast(t('saved'));
    leave();
  };

  $('#cancel').onclick = async () => {
    if (newPhotoId) await db.remove('photos', newPhotoId);
    leave();
  };

  if (!isNew) $('#del').onclick = async () => {
    const n = (await db.listByProject('products', pid)).filter(p => p.supplierId === sid).length;
    if (!confirm(t('confirmDeleteSupplier', { name: sup.name, n }))) return;
    if (sup.cardPhotoId) await db.remove('photos', sup.cardPhotoId);
    await db.remove('suppliers', sid);
    ctx.nav(`/p/${pid}/suppliers`, true);
  };

  renderCard();
  if (isNew) form.name.focus();
}
