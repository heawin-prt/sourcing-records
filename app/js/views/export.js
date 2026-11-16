// 导出页：选择导出哪些产品、哪些列、是否嵌图。

import * as db from '../db.js';
import { t } from '../i18n.js';
import { esc, $, $$, toast, STATUSES } from '../ui.js';
import { loadProject } from './summary.js';
import { COLUMNS, DEFAULT_COLUMNS, pickRows, buildWorkbook } from '../export-excel.js';

export async function renderExport(app, { pid }, ctx) {
  const data = await loadProject(pid);
  if (!data) return ctx.nav('/', true);
  ctx.setTop(t('exportTitle'), `/p/${pid}`);

  const DEFAULT_PREFS = { v: 3, mode: 'chosen', includeEmpty: false, columns: DEFAULT_COLUMNS, photos: 1, subtotalBy: 'none', statuses: [...STATUSES] };
  let prefs = await db.getMeta('exportPrefs', DEFAULT_PREFS);
  if (prefs.v === 2) { // 0.5.0：合计改为列选项里的 total
    prefs = { ...prefs, v: 3, columns: prefs.total ? [...prefs.columns, 'total'] : prefs.columns };
  }
  if (prefs.v !== 3) prefs = DEFAULT_PREFS;
  if (!prefs.statuses) prefs = { ...prefs, statuses: [...STATUSES] };

  const colBox = c => `<label class="check"><input type="checkbox" name="col" value="${c.key}" ${prefs.columns.includes(c.key) ? 'checked' : ''}>${esc(c.label())}</label>`;

  app.innerHTML = `
    <form id="form">
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
        <h2>${esc(t('groupTotals'))}</h2>
        <select name="subtotalBy">${['none', 'category', 'supplier'].map(s => `<option value="${s}" ${prefs.subtotalBy === s ? 'selected' : ''}>${esc(t('sub_' + s))}</option>`).join('')}</select>
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
          ${COLUMNS.map(colBox).join('')}
        </div>
      </div>
    </form>
    <div id="result"></div>
    <div class="bottom-bar"><div class="inner">
      <button class="btn primary" id="go">${esc(t('generate'))}</button>
    </div></div>
  `;

  const form = $('#form');
  const readOpts = () => ({
    mode: form.querySelector('[name=mode]:checked').value,
    includeEmpty: form.includeEmpty.checked,
    columns: $$('[name=col]:checked', form).map(x => x.value),
    photos: Number(form.photos.value),
    subtotalBy: form.subtotalBy.value,
    statuses: $$('[name=st]:checked', form).map(x => x.value),
    v: 3,
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
  form.onchange = paintCounts;
  $('#col-all').onclick = () => $$('[name=col]', form).forEach(x => { x.checked = true; });
  $('#col-none').onclick = () => $$('[name=col]', form).forEach(x => { x.checked = false; });

  $('#go').onclick = async () => {
    const opts = readOpts();
    await db.setMeta('exportPrefs', opts);
    if (!pickRows(data.items, opts.mode, opts.includeEmpty, opts.statuses).length) { toast(t('exportEmpty')); return; }
    const btn = $('#go');
    btn.disabled = true;
    btn.textContent = t('generating');
    try {
      const { blob, filename } = await buildWorkbook(data, opts);
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
      btn.textContent = t('generate');
    }
  };
}
