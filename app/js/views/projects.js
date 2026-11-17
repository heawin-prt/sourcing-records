// 项目列表页（需求第 1、2 条：可以有多个采购项目）。

import * as db from '../db.js';
import { t, getLang } from '../i18n.js';
import { esc, $ } from '../ui.js';
import { projectType, projectSummary } from './project-new.js';

export async function renderProjects(app, _params, ctx) {
  ctx.setTop(t('appName'), null, `<button class="top-btn" id="go-settings">${esc(t('settings'))}</button>`);
  $('#go-settings').onclick = () => ctx.nav('/settings');

  const projects = await db.listProjects();
  const counts = {};
  for (const p of projects) counts[p.id] = (await db.listByProject('items', p.id)).length;

  app.innerHTML = `
    <div class="section-title">${esc(t('projectsHeading'))}</div>
    ${projects.length ? projects.map(p => `
      <div class="list-item" data-open="${esc(p.id)}">
        <div class="main">
          <div class="name"><span class="type-tag ${projectType(p)}">${esc(t('ptype_' + projectType(p)))}</span> ${esc(p.name)}</div>
          <div class="meta">
            ${projectSummary(p) ? `<span>${esc(projectSummary(p))}</span>` : ''}
            <span>${esc(t('itemsCount', { n: counts[p.id] }))}</span>
          </div>
          ${p.purpose && projectType(p) === 'procurement' ? `<div class="meta desc">${esc(t('projectPurpose'))}${getLang() === 'en' ? ': ' : '：'}${esc(p.purpose)}</div>` : ''}
          ${p.desc ? `<div class="meta desc">${esc(p.desc)}</div>` : ''}
        </div>
        <button class="btn small" data-edit="${esc(p.id)}">${esc(t('edit'))}</button>
        <button class="btn small danger" data-del="${esc(p.id)}">${esc(t('delete'))}</button>
      </div>`).join('') : `<p class="empty">${esc(t('noProjects'))}</p>`}
    <button class="btn primary fab" id="new-project">＋ ${esc(t('newProject'))}</button>
  `;

  $('#new-project').onclick = () => ctx.nav('/new');

  app.onclick = async e => {
    const btn = e.target.closest('button');
    const row = e.target.closest('[data-open]');
    if (btn && btn.dataset.edit) {
      ctx.nav(`/p/${btn.dataset.edit}/info`);
    } else if (btn && btn.dataset.del) {
      const p = projects.find(x => x.id === btn.dataset.del);
      if (confirm(t('confirmDeleteProject', { name: p.name }))) { await db.removeProject(p.id); renderProjects(app, _params, ctx); }
    } else if (row && !btn) {
      ctx.nav('/p/' + row.dataset.open);
    }
  };
}
