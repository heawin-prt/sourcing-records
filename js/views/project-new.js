// 项目基础信息（新建 / 编辑）。
// 项目分两类：procurement 采购（地点、日期、采购内容）；exhibition 展览会（另有展会名称、城市、场馆、起止日期、主办方、网站）。
// 可选择从其他项目导入供应商（连同名片照片一起复制）。

import * as db from '../db.js';
import { t } from '../i18n.js';
import { esc, $, $$, toast } from '../ui.js';
import { dateField, bindDateFields } from '../datepicker.js';

export const PROJECT_TYPES = ['procurement', 'exhibition'];
export const projectType = p => (p?.type === 'exhibition' ? 'exhibition' : 'procurement');

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 项目信息的一行摘要（项目列表、项目页顶部共用）。pin=false 时地点前不加图钉图标（开始页面用）。 */
export function projectSummary(p, { pin = true } = {}) {
  if (projectType(p) === 'exhibition') {
    const dates = p.dateEnd && p.dateEnd !== p.date ? `${p.date || ''} – ${p.dateEnd}` : p.date;
    return [p.exName && `🏛 ${p.exName}`, [p.city, p.venue].filter(Boolean).join(' · '), dates].filter(Boolean).join(' · ');
  }
  return [p.location && (pin ? `📍${p.location}` : p.location), p.date].filter(Boolean).join(' · ');
}

export async function renderProjectNew(app, { pid }, ctx, query = {}) {
  const isNew = !pid;
  const stored = isNew ? null : await db.get('projects', pid);
  if (!isNew && !stored) return ctx.nav('/', true);
  const backPath = isNew ? '/' : `/p/${pid}`;

  // 新建时先选择项目类型
  if (isNew && !PROJECT_TYPES.includes(query.type)) {
    ctx.setTop(t('newProject'), '/');
    app.innerHTML = `
      <p class="section-title">${esc(t('chooseProjectType'))}</p>
      ${PROJECT_TYPES.map(ty => `
        <button type="button" class="type-card" data-type="${ty}">
          <span class="type-icon">${ty === 'exhibition' ? '🏛' : '🛒'}</span>
          <span class="type-text"><b>${esc(t('ptype_' + ty))}</b><span class="muted">${esc(t('ptypeHint_' + ty))}</span></span>
        </button>`).join('')}
    `;
    app.onclick = e => {
      const b = e.target.closest('[data-type]');
      if (b) ctx.nav(`/new?type=${b.dataset.type}`, true);
    };
    return;
  }

  const project = stored || { type: query.type, date: today() };
  let type = projectType(project);
  ctx.setTop(isNew ? t('newProjectOf', { type: t('ptype_' + type) }) : t('projectInfo'), backPath);

  const others = (await db.listProjects()).filter(p => p.id !== pid);
  const supCounts = {};
  for (const p of others) supCounts[p.id] = (await db.listByProject('suppliers', p.id)).length;
  const withSup = others.filter(p => supCounts[p.id] > 0);

  const v = k => esc(project[k] ?? '');
  const field = (k, label, extra = '') => `<label class="field"><span>${esc(t(label))}</span><input type="text" name="${k}" value="${v(k)}" ${extra}></label>`;

  app.innerHTML = `
    <form id="form" class="card" autocomplete="off">
      ${isNew ? '' : `<div class="field"><span>${esc(t('projectType'))}</span>
        <div class="seg seg2">${PROJECT_TYPES.map(ty => `<button type="button" data-type="${ty}" class="${ty === type ? 'on st-done' : ''}">${esc(t('ptype_' + ty))}</button>`).join('')}</div></div>`}

      <div id="ex-fields" ${type === 'exhibition' ? '' : 'hidden'}>
        ${field('exName', 'exName')}
        <div class="grid2">
          ${field('city', 'exCity')}
          ${field('venue', 'exVenue')}
        </div>
      </div>

      <label class="field"><span>${esc(t('projectName'))} *</span><input type="text" name="pname" value="${esc(project.name ?? '')}" required></label>

      <div id="pr-fields" ${type === 'procurement' ? '' : 'hidden'}>
        ${field('location', 'projectLocation')}
        ${field('purpose', 'projectPurpose', `placeholder="${esc(t('projectPurposeHint'))}"`)}
      </div>

      <div class="grid2">
        <div class="field"><span id="date-label">${esc(t(type === 'exhibition' ? 'exDateStart' : 'projectDate'))}</span>${dateField('date', project.date)}</div>
        <div class="field" id="date-end" ${type === 'exhibition' ? '' : 'hidden'}><span>${esc(t('exDateEnd'))}</span>${dateField('dateEnd', project.dateEnd)}</div>
      </div>

      <div id="ex-fields2" ${type === 'exhibition' ? '' : 'hidden'}>
        ${field('organizer', 'exOrganizer')}
        <label class="field"><span>${esc(t('website'))}</span><input type="url" name="exWebsite" value="${v('exWebsite')}" placeholder="${esc(t('websiteHint'))}"></label>
      </div>

      <label class="field"><span id="desc-label">${esc(t(type === 'exhibition' ? 'exDesc' : 'projectDesc'))}</span><textarea name="desc">${v('desc')}</textarea></label>
      ${withSup.length ? `
        <div class="field"><span>${esc(t('importSuppliersFrom'))}</span>
          ${withSup.map(p => `<label class="check"><input type="checkbox" name="src" value="${esc(p.id)}">${esc(p.name)} <span class="muted">(${esc(t('suppliersCount', { n: supCounts[p.id] }))})</span></label>`).join('')}
          <span class="muted">${esc(t('importSuppliersHint'))}</span>
        </div>` : ''}
    </form>
    <div class="bottom-bar"><div class="inner">
      <button class="btn" id="cancel">${esc(t('cancel'))}</button>
      <button class="btn primary" id="save">${esc(isNew ? t('create') : t('save'))}</button>
    </div></div>
  `;

  const form = $('#form');
  bindDateFields(form);

  // 切换类型（编辑时）：显示/隐藏对应字段
  function applyType() {
    const ex = type === 'exhibition';
    $('#ex-fields').hidden = !ex;
    $('#ex-fields2').hidden = !ex;
    $('#date-end').hidden = !ex;
    $('#pr-fields').hidden = ex;
    $('#date-label').textContent = t(ex ? 'exDateStart' : 'projectDate');
    $('#desc-label').textContent = t(ex ? 'exDesc' : 'projectDesc');
    $$('.seg2 button', form).forEach(b => { b.className = b.dataset.type === type ? 'on st-done' : ''; });
  }
  form.onclick = e => {
    const b = e.target.closest('.seg2 [data-type]');
    if (b) { type = b.dataset.type; applyType(); }
  };

  // 展会：项目名称还空着时，跟着展会名称自动填
  let nameTouched = !!project.name;
  form.pname.oninput = () => { nameTouched = true; };
  form.exName.oninput = () => { if (!nameTouched) form.pname.value = form.exName.value; };

  (type === 'exhibition' ? form.exName : form.pname).focus();
  $('#cancel').onclick = () => ctx.nav(backPath, true);
  form.onsubmit = e => { e.preventDefault(); $('#save').click(); };

  $('#save').onclick = async () => {
    const name = form.pname.value.trim();
    if (!name) { toast(t('required', { field: t('projectName') })); form.pname.focus(); return; }
    $('#save').disabled = true;
    const val = k => form[k].value.trim();
    const rec = { ...project, type, name, date: form.date.value, desc: val('desc') };
    if (type === 'exhibition') {
      Object.assign(rec, { exName: val('exName'), city: val('city'), venue: val('venue'), dateEnd: form.dateEnd.value, organizer: val('organizer'), exWebsite: val('exWebsite') });
    } else {
      rec.location = val('location');
      rec.purpose = val('purpose');
    }
    const saved = await db.put('projects', rec);
    const n = await copySuppliers($$('[name=src]:checked', form).map(x => x.value), saved.id);
    toast(n ? t('suppliersImported', { n }) : t('saved'));
    ctx.nav('/p/' + saved.id, true);
  };
}

/** 把若干项目的供应商复制到目标项目；名称＋电话相同的只复制一次。返回复制数量。 */
export async function copySuppliers(sourceIds, targetId) {
  const seen = new Set((await db.listByProject('suppliers', targetId)).map(s => `${s.name}|${s.phone || ''}`));
  let n = 0;
  for (const src of sourceIds) {
    for (const s of await db.listByProject('suppliers', src)) {
      const key = `${s.name}|${s.phone || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let cardPhotoId = null;
      if (s.cardPhotoId) {
        const ph = await db.get('photos', s.cardPhotoId);
        if (ph) cardPhotoId = (await db.put('photos', { projectId: targetId, blob: ph.blob, thumb: ph.thumb, takenAt: ph.takenAt })).id;
      }
      const { id, createdAt, createdBy, updatedAt, updatedBy, ...rest } = s;
      await db.put('suppliers', { ...rest, projectId: targetId, cardPhotoId, copiedFrom: id });
      n++;
    }
  }
  return n;
}
