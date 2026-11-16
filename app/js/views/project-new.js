// 项目基础信息（新建 / 编辑）：名称、地点、日期、采购内容描述；
// 可选择从其他项目导入供应商（连同名片照片一起复制）。

import * as db from '../db.js';
import { t } from '../i18n.js';
import { esc, $, $$, toast } from '../ui.js';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function renderProjectNew(app, { pid }, ctx) {
  const isNew = !pid;
  const project = isNew ? { date: today() } : await db.get('projects', pid);
  if (!project) return ctx.nav('/', true);
  const backPath = isNew ? '/' : `/p/${pid}`;
  ctx.setTop(isNew ? t('newProject') : t('projectInfo'), backPath);

  const others = (await db.listProjects()).filter(p => p.id !== pid);
  const supCounts = {};
  for (const p of others) supCounts[p.id] = (await db.listByProject('suppliers', p.id)).length;
  const withSup = others.filter(p => supCounts[p.id] > 0);

  app.innerHTML = `
    <form id="form" class="card" autocomplete="off">
      <label class="field"><span>${esc(t('projectName'))} *</span><input type="text" name="pname" value="${esc(project.name ?? '')}" required></label>
      <div class="grid2">
        <label class="field"><span>${esc(t('projectLocation'))}</span><input type="text" name="location" value="${esc(project.location ?? '')}"></label>
        <label class="field"><span>${esc(t('projectDate'))}</span><input type="date" name="date" value="${esc(project.date ?? '')}"></label>
      </div>
      <label class="field"><span>${esc(t('projectDesc'))}</span><textarea name="desc">${esc(project.desc ?? '')}</textarea></label>
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
  if (isNew) form.pname.focus();
  $('#cancel').onclick = () => ctx.nav(backPath, true);
  form.onsubmit = e => { e.preventDefault(); $('#save').click(); };

  $('#save').onclick = async () => {
    const name = form.pname.value.trim();
    if (!name) { toast(t('required', { field: t('projectName') })); form.pname.focus(); return; }
    $('#save').disabled = true;
    const saved = await db.put('projects', {
      ...project, name,
      location: form.location.value.trim(),
      date: form.date.value,
      desc: form.desc.value.trim(),
    });
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
