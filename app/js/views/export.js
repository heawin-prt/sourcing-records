// 导出页：选择格式（Excel / Word）、导出哪些产品、哪些列、是否嵌图。

import * as db from '../db.js';
import { t } from '../i18n.js';
import { esc, $, $$, toast, STATUSES } from '../ui.js';
import { loadProject } from './summary.js';
import { COLUMNS, DEFAULT_COLUMNS, GROUP_BY, pickRows, buildWorkbook } from '../export-excel.js';
import { buildDocx } from '../export-word.js';
import { projectType } from './project-new.js';
import { SUP_WHICH, pickSuppliers, buildSupplierWorkbook } from '../export-suppliers.js';

export async function renderExport(app, { pid }, ctx) {
  const data = await loadProject(pid);
  if (!data) return ctx.nav('/', true);
  ctx.setTop(t('exportTitle'), `/p/${pid}`);

  const DEFAULT_PREFS = { v: 4, mode: 'chosen', includeEmpty: false, columns: DEFAULT_COLUMNS, photos: 1, groupBy: 'none', groupTotals: true, statuses: [...STATUSES] };
  let prefs = await db.getMeta('exportPrefs', DEFAULT_PREFS);
  if (prefs.v === 2) { // 0.5.0：合计改为列选项里的 total
    prefs = { ...prefs, v: 3, columns: prefs.total ? [...prefs.columns, 'total'] : prefs.columns };
  }
  if (prefs.v === 3) { // 0.9.0："分组合计"与"排列方式"合并为"排列与分组"＋"每组末尾加合计"
    const groupBy = prefs.subtotalBy && prefs.subtotalBy !== 'none' ? prefs.subtotalBy : (prefs.sortBy && prefs.sortBy !== 'list' ? prefs.sortBy : 'none');
    prefs = { ...prefs, v: 4, groupBy, groupTotals: !!(prefs.subtotalBy && prefs.subtotalBy !== 'none') || groupBy === 'none' };
  }
  if (prefs.v !== 4) prefs = DEFAULT_PREFS;
  if (!prefs.statuses) prefs = { ...prefs, statuses: [...STATUSES] };

  const colBox = c => `<label class="check"><input type="checkbox" name="col" value="${c.key}" ${prefs.columns.includes(c.key) ? 'checked' : ''}>${esc(c.label(data.project))}</label>`;
  // 展会项目没有"市场名称"
  const expo = projectType(data.project) === 'exhibition';
  const shownCols = COLUMNS.filter(c => !(expo && c.key === 'marketName'));

  const FORMATS = { xlsx: 'Excel', docx: 'Word' };
  if (!FORMATS[prefs.format]) prefs = { ...prefs, format: 'xlsx' };

  let what = (await db.getMeta('exportWhat', 'products')) === 'suppliers' ? 'suppliers' : 'products';
  const supPrefs = { supWhich: 'all', supCard: true, supPhotos: 1, ...(await db.getMeta('exportSupPrefs', {})) };

  app.innerHTML = `
    <form id="form">
      <div class="card card-inline">
        <h2>${esc(t('exportWhat'))}</h2>
        <div class="seg seg2" id="what">
          ${['products', 'suppliers'].map(k => `<button type="button" data-what="${k}" class="${what === k ? 'on st-done' : ''}">${esc(t('what_' + k))}</button>`).join('')}
        </div>
      </div>

      <div id="sup-opts">
        <div class="card">
          <h2>${esc(t('supWhich'))}</h2>
          ${SUP_WHICH.map(m => `<label class="check"><input type="radio" name="supWhich" value="${m}" ${supPrefs.supWhich === m ? 'checked' : ''}>
            <span>${esc(t('supWhich_' + m))} <span class="muted">(${pickSuppliers(data, m).length})</span></span></label>`).join('')}
        </div>
        <div class="card">
          <h2>${esc(t('supIncludePhotos'))}</h2>
          <label class="check"><input type="checkbox" name="supCard" ${supPrefs.supCard ? 'checked' : ''}>${esc(t('cardPhoto'))}</label>
          <label class="field"><span>${esc(t('supPhotosPer'))}</span>
            <select name="supPhotos">${[0, 1, 2, 3].map(n => `<option value="${n}" ${supPrefs.supPhotos === n ? 'selected' : ''}>${n === 0 ? '—' : n}</option>`).join('')}</select>
          </label>
        </div>
      </div>

      <div id="prod-opts">
      <div class="card card-inline">
        <h2>${esc(t('exportFormat'))}</h2>
        <div class="seg seg2" id="fmt">
          ${Object.entries(FORMATS).map(([k, name]) => `<button type="button" data-fmt="${k}" class="${prefs.format === k ? 'on st-done' : ''}">${name}</button>`).join('')}
        </div>
      </div>

      <div class="card">
        <h2>${esc(t('whichProducts'))}</h2>
        ${['chosen', 'best', 'all'].map(m => `<label class="check"><input type="radio" name="mode" value="${m}" ${prefs.mode === m ? 'checked' : ''}>
          <span>${esc(t('mode_' + m))} <span class="muted" data-count="${m}"></span></span></label>`).join('')}
        <label class="check"><input type="checkbox" name="includeEmpty" ${prefs.includeEmpty ? 'checked' : ''}>${esc(t('includeEmpty'))}</label>
      </div>

      <div class="card">
        <h2>${esc(t('exportStatuses'))}</h2>
        <div class="grid2">
          ${STATUSES.map(st => `<label class="check"><input type="checkbox" name="st" value="${st}" ${prefs.statuses.includes(st) ? 'checked' : ''}>
            <span class="dot st-${st}"></span>${esc(t('status_' + st))} <span class="muted" data-stcount="${st}"></span></label>`).join('')}
        </div>
      </div>

      <div class="card">
        <h2>${esc(t('groupBy'))}</h2>
        <select name="groupBy">${GROUP_BY.map(g => `<option value="${g}" ${prefs.groupBy === g ? 'selected' : ''}>${esc(t('group_' + g))}</option>`).join('')}</select>
        <label class="check" id="gt-wrap" ${prefs.groupBy === 'none' ? 'hidden' : ''}><input type="checkbox" name="groupTotals" ${prefs.groupTotals ? 'checked' : ''}>${esc(t('groupTotalsEach'))}</label>
      </div>

      <div class="card">
        <h2>${esc(t('includePhotos'))}</h2>
        <label class="field"><span>${esc(t('photosPerProduct'))}</span>
          <select name="photos">${[0, 1, 2, 3].map(n => `<option value="${n}" ${prefs.photos === n ? 'selected' : ''}>${n === 0 ? '—' : n}</option>`).join('')}</select>
        </label>
      </div>

      <div class="card">
        <div class="row"><h2 style="margin:0">${esc(t('columns'))}</h2><span class="spacer"></span>
          <button type="button" class="btn small" id="col-all">${esc(t('selectAll'))}</button>
          <button type="button" class="btn small" id="col-none">${esc(t('selectNone'))}</button></div>
        <div class="grid2" style="margin-top:8px">
          ${shownCols.map(colBox).join('')}
        </div>
      </div>
      </div>
    </form>
    <div id="result"></div>
    <div class="bottom-bar"><div class="inner">
      <button class="btn primary" id="go"></button>
    </div></div>
  `;

  const form = $('#form');
  let format = prefs.format;
  const paintGo = () => { $('#go').textContent = t('generateAs', { fmt: what === 'suppliers' ? 'Excel' : FORMATS[format] }); };
  const paintWhat = () => {
    $('#prod-opts').hidden = what !== 'products';
    $('#sup-opts').hidden = what !== 'suppliers';
    $$('#what button').forEach(x => { x.className = x.dataset.what === what ? 'on st-done' : ''; });
    paintGo();
  };
  paintWhat();
  $('#what').onclick = async e => {
    const b = e.target.closest('[data-what]');
    if (!b) return;
    what = b.dataset.what;
    await db.setMeta('exportWhat', what);
    $('#result').innerHTML = '';
    paintWhat();
  };
  $('#fmt').onclick = e => {
    const b = e.target.closest('[data-fmt]');
    if (!b) return;
    format = b.dataset.fmt;
    $$('#fmt button').forEach(x => { x.className = x.dataset.fmt === format ? 'on st-done' : ''; });
    paintGo();
  };
  const readOpts = () => ({
    format,
    mode: form.querySelector('[name=mode]:checked').value,
    includeEmpty: form.includeEmpty.checked,
    columns: $$('[name=col]:checked', form).map(x => x.value),
    photos: Number(form.photos.value),
    groupBy: form.groupBy.value,
    groupTotals: form.groupTotals.checked,
    statuses: $$('[name=st]:checked', form).map(x => x.value),
    v: 4,
  });

  const paintCounts = () => {
    const inc = form.includeEmpty.checked;
    const sts = $$('[name=st]:checked', form).map(x => x.value);
    for (const st of STATUSES) $(`[data-stcount="${st}"]`).textContent = `(${data.items.filter(it => (it.status || 'todo') === st).length})`;
    for (const m of ['chosen', 'best', 'all']) {
      const n = pickRows(data.items, m, inc, sts).length;
      $(`[data-count="${m}"]`).textContent = `(${n})`;
    }
  };
  paintCounts();
  form.onchange = () => {
    paintCounts();
    $('#gt-wrap').hidden = form.groupBy.value === 'none'; // 不分组时没有"每组加合计"
  };
  $('#col-all').onclick = () => $$('[name=col]', form).forEach(x => { x.checked = true; });
  $('#col-none').onclick = () => $$('[name=col]', form).forEach(x => { x.checked = false; });

  $('#go').onclick = async () => {
    let opts;
    if (what === 'suppliers') {
      opts = { supWhich: form.querySelector('[name=supWhich]:checked').value, supCard: form.supCard.checked, supPhotos: Number(form.supPhotos.value) };
      await db.setMeta('exportSupPrefs', opts);
      if (!pickSuppliers(data, opts.supWhich).length) { toast(t('exportEmpty')); return; }
    } else {
      opts = readOpts();
      await db.setMeta('exportPrefs', opts);
      if (!pickRows(data.items, opts.mode, opts.includeEmpty, opts.statuses).length) { toast(t('exportEmpty')); return; }
    }
    const btn = $('#go');
    btn.disabled = true;
    btn.textContent = t('generating');
    try {
      const { blob, filename } = what === 'suppliers' ? await buildSupplierWorkbook(data, opts)
        : opts.format === 'docx' ? await buildDocx(data, opts) : await buildWorkbook(data, opts);
      const file = new File([blob], filename, { type: blob.type });
      const url = URL.createObjectURL(blob);
      const canShare = navigator.canShare && navigator.canShare({ files: [file] });
      $('#result').innerHTML = `
        <div class="card">
          <p>${esc(t('exportDone', { name: filename }))}</p>
          <div class="row wrap">
            <a class="btn primary" href="${url}" download="${esc(filename)}">⬇ ${esc(filename)}</a>
            ${canShare ? `<button class="btn" id="share">${esc(t('share'))}</button>` : ''}
          </div>
        </div>`;
      if (canShare) $('#share').onclick = () => navigator.share({ files: [file], title: filename }).catch(() => {});
      // 自动触发一次下载
      $('#result a').click();
      $('#result').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      console.error(err);
      toast(String(err.message || err));
    } finally {
      btn.disabled = false;
      paintGo();
    }
  };
}
