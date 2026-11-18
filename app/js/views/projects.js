// 项目列表页（需求第 1、2 条：可以有多个采购项目）。

import * as db from '../db.js';
import { t } from '../i18n.js';
import { esc, $, confirmDialog } from '../ui.js';
import { projectSummary, projectType } from './project-new.js';
import { openPicker } from '../picker.js';

const SORTS = ['date', 'dateAsc', 'procurement', 'exhibition', 'name'];
const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'zh');
// 日期：项目日期新的在前（没填日期的按创建时间）
const dateOf = p => p.date || (p.createdAt || '').slice(0, 10);
const byDate = (a, b) => dateOf(b).localeCompare(dateOf(a)) || byName(a, b);
const SORT_FN = {
  date: byDate,                       // 日期倒序：新的在前
  dateAsc: (a, b) => byDate(b, a),     // 日期顺序：旧的在前
  // 按类型：选中的类型排在上面，其余在下面；每组内日期新的在前
  procurement: (a, b) => (projectType(a) !== 'procurement') - (projectType(b) !== 'procurement') || byDate(a, b),
  exhibition: (a, b) => (projectType(a) !== 'exhibition') - (projectType(b) !== 'exhibition') || byDate(a, b),
  name: byName,
};

export async function renderProjects(app, _params, ctx) {
  ctx.setTop(t('appName'), null, `<button class="top-btn" id="go-settings">${esc(t('settings'))}</button>`);
  $('#go-settings').onclick = () => ctx.nav('/settings');

  let sort = await db.getMeta('projectSort', 'date');
  if (sort === 'type') sort = 'procurement'; // 旧设置
  if (!SORTS.includes(sort)) sort = 'date';
  const projects = (await db.listProjects()).sort(SORT_FN[sort]);
  const counts = {};
  for (const p of projects) counts[p.id] = (await db.listByProject('items', p.id)).length;

  app.innerHTML = `
    <div class="row section-row"><div class="section-title">${esc(t('projectsHeading'))}</div><span class="spacer"></span>
      ${projects.length > 1 ? `<button type="button" class="btn small" id="sort">${esc(t('sortBy'))}: ${esc(t('sort_' + sort))} ▾</button>` : ''}</div>
    ${projects.length ? projects.map(p => `
      <div class="list-item" data-open="${esc(p.id)}">
        <div class="main">
          <div class="name">${esc(p.name)}</div>
          <div class="meta">
            ${projectSummary(p) ? `<span>${esc(projectSummary(p))}</span>` : ''}
            <span>${esc(t('itemsCount', { n: counts[p.id] }))}</span>
          </div>
          ${p.desc ? `<div class="meta desc">${esc(p.desc)}</div>` : ''}
        </div>
        <button class="btn small" data-edit="${esc(p.id)}">${esc(t('edit'))}</button>
        <button class="btn small danger" data-del="${esc(p.id)}">${esc(t('delete'))}</button>
      </div>`).join('') : `<p class="empty">${esc(t('noProjects'))}</p>`}
    <button class="btn primary fab" id="new-project">+ ${esc(t('newProject'))}</button>
  `;

  $('#new-project').onclick = () => ctx.nav('/new');
  const sortBtn = $('#sort');
  if (sortBtn) sortBtn.onclick = e => {
    e.stopPropagation();
    openPicker({
      title: t('sortBy'),
      options: SORTS.map(s => ({ value: s, label: t('sort_' + s) })),
      selected: sort,
      onPick: async v => { await db.setMeta('projectSort', v); renderProjects(app, _params, ctx); },
    });
  };

  app.onclick = async e => {
    const btn = e.target.closest('button');
    const row = e.target.closest('[data-open]');
    if (btn && btn.dataset.edit) {
      ctx.nav(`/p/${btn.dataset.edit}/info`);
    } else if (btn && btn.dataset.del) {
      const p = projects.find(x => x.id === btn.dataset.del);
      if (await confirmDialog(t('confirmDeleteProject', { name: p.name }))) { await db.removeProject(p.id); renderProjects(app, _params, ctx); }
    } else if (row && !btn) {
      ctx.nav('/p/' + row.dataset.open);
    }
  };
}
