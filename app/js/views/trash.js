// 垃圾箱：删除的项目先放这里，可以恢复；清空垃圾箱要输入确认词才执行（不可恢复）。

import * as db from '../db.js';
import { t } from '../i18n.js';
import { esc, $, toast, fmtDateTime, typedConfirmDialog, ICONS } from '../ui.js';
import { projectSummary } from './project-new.js';

export async function renderTrash(app, params, ctx) {
  ctx.setTop(t('trash'), '/');
  const projects = await db.listDeletedProjects();
  app.innerHTML = `
    ${projects.length ? `<p class="muted">${esc(t('trashHint'))}</p>` + projects.map(p => `
      <div class="list-item">
        <div class="main">
          <div class="name">${esc(p.name)}</div>
          <div class="meta">
            ${projectSummary(p) ? `<span>${esc(projectSummary(p))}</span>` : ''}
            <span>${esc(t('deletedAt', { time: fmtDateTime(p.deletedAt || p.updatedAt) }))}</span>
          </div>
        </div>
        <button class="btn small restore-btn" data-restore="${esc(p.id)}">${ICONS.restore}${esc(t('restore'))}</button>
      </div>`).join('') : `<p class="empty">${esc(t('trashEmpty'))}</p>`}
    ${projects.length ? `<div class="bottom-bar"><div class="inner">
      <button class="btn danger" id="empty-trash">${esc(t('emptyTrash'))}</button>
    </div></div>` : ''}
  `;
  app.onclick = async e => {
    const b = e.target.closest('[data-restore]');
    if (!b) return;
    b.disabled = true;
    await db.restoreProject(b.dataset.restore);
    toast(t('restored'));
    renderTrash(app, params, ctx);
  };
  const empty = $('#empty-trash');
  if (empty) empty.onclick = async () => {
    const word = t('emptyTrashWord');
    if (!await typedConfirmDialog(t('emptyTrashConfirm', { n: projects.length, word }), word, t('emptyTrash'))) return;
    for (const p of projects) await db.purgeProject(p.id);
    toast(t('trashEmptied'));
    renderTrash(app, params, ctx);
  };
}
