// 项目总览页（需求第 10、11、13 条）：按进度、按供应商筛选，快速定位物品，物品列表。

import * as db from '../db.js';
import { t, getLang } from '../i18n.js';
import { categoryLabel } from '../templates.js';
import { esc, $, blobUrl, releaseUrls, stars, STATUSES, itemTitle, itemTitleHtml, ICONS } from '../ui.js';
import { openPicker } from '../picker.js';
import { loadProject, coverPhotoId } from './summary.js';
import { projectSummary } from './project-new.js';

// 记住每个项目的筛选条件（仅本次打开期间）
const filters = {};

/** 页面顶部"物品 | 产品"切换。 */
export function viewSwitch(pid, active) {
  return `<div class="view-switch">
    <a href="#/p/${esc(pid)}" class="${active === 'items' ? 'on' : ''}">${esc(t('viewItems'))}</a>
    <a href="#/p/${esc(pid)}/products" class="${active === 'products' ? 'on' : ''}">${esc(t('viewProducts'))}</a>
  </div>`;
}

/** 供应商选择按钮的选项（总览页和产品总览页共用）。 */
export function supplierOptions(suppliers, countOf) {
  const list = [...suppliers].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh'));
  return [
    { value: '', label: t('allSuppliers') },
    ...list.map(s => ({ value: s.id, label: s.name + (countOf ? ` (${countOf(s.id)})` : ''), sub: [s.booth, s.phone].filter(Boolean).join(' · ') })),
  ];
}

export async function renderOverview(app, { pid }, ctx) {
  releaseUrls();
  const data = await loadProject(pid);
  if (!data) return ctx.nav('/', true);
  const { project, items, suppliers, supplierMap } = data;
  const lang = getLang();
  const f = filters[pid] ||= { status: 'all', sup: '', q: '' };
  if (f.sup && !supplierMap[f.sup]) f.sup = '';

  ctx.setTop(project.name, '/', `<button class="top-btn icon-only" id="go-export" title="${esc(t('exportExcel'))}" aria-label="${esc(t('exportExcel'))}">${ICONS.export}</button>`);
  $('#go-export').onclick = () => ctx.nav(`/p/${pid}/export`);

  const counts = Object.fromEntries(STATUSES.map(s => [s, 0]));
  items.forEach(it => counts[it.status || 'todo']++);

  // 每个供应商涉及的物品数
  const supItems = {};
  for (const it of items) for (const sid of new Set(it._products.map(p => p.supplierId).filter(Boolean))) supItems[sid] = (supItems[sid] || 0) + 1;

  // 照片缩略图
  const thumbs = {};
  for (const it of items) {
    const phId = coverPhotoId(it);
    if (phId) {
      const ph = await db.get('photos', phId);
      if (ph) thumbs[it.id] = blobUrl(ph.thumb);
    }
  }

  const info = projectSummary(project);
  app.innerHTML = `
    <div class="project-info" id="info">
      <span class="pi-main">${esc(info || t('projectInfoEmpty'))}${project.desc ? ` — ${esc(project.desc)}` : ''}</span>
      <span class="pi-edit" title="${esc(t('edit'))}" aria-label="${esc(t('edit'))}">${ICONS.edit}</span>
    </div>
    ${viewSwitch(pid, 'items')}
    <div class="card compact">
      <h2>${esc(t('byStatus', { n: items.length }))}</h2>
      <div class="status-line">
        ${STATUSES.map(s => `<button data-filter="${s}" class="${f.status === s ? 'on' : ''}">
          <span class="st-label"><span class="dot st-${s}"></span>${esc(t('status_' + s))}</span>
          <span class="st-num c-${s}">${counts[s]}</span></button>`).join('')}
      </div>
    </div>

    <div class="card compact">
      <div class="row">
        <h2 class="inline">${esc(t('bySupplier'))}</h2>
        <button type="button" class="pick-btn" id="sup">${esc(f.sup ? supplierMap[f.sup].name : t('allSuppliers'))}</button>
        <button class="btn small" id="go-suppliers">${esc(t('manageSuppliers'))}</button>
      </div>
    </div>

    ${items.length ? `
    <div class="card compact">
      <div class="row">
        <button type="button" class="pick-btn" id="jump">${esc(t('quickJump'))}</button>
        <input type="search" id="q" class="compact-input" placeholder="${esc(t('filterPlaceholder'))}" value="${esc(f.q)}">
      </div>
    </div>` : ''}

    <div id="list"></div>
    <button class="btn primary fab" id="add-item">+ ${esc(t('addItem'))}</button>
  `;

  const renderList = () => {
    const q = f.q.trim().toLowerCase();
    const shown = items.filter(it => {
      if (f.status !== 'all' && (it.status || 'todo') !== f.status) return false;
      if (f.sup && !it._products.some(p => p.supplierId === f.sup)) return false;
      if (!q) return true;
      const hay = [it.name, it.note, categoryLabel(it.category, lang), ...Object.values(it.fields || {})].join(' ').toLowerCase();
      return hay.includes(q);
    });
    $('#list').innerHTML = !items.length ? `<p class="empty">${esc(t('noItems'))}</p>`
      : !shown.length ? `<p class="empty">${esc(t('noMatch'))}</p>`
      : shown.map(it => {
        const st = it.status || 'todo';
        return `
        <div class="list-item" data-open="${esc(it.id)}">
          ${thumbs[it.id] ? `<img class="thumb" src="${thumbs[it.id]}" alt="">` : `<div class="thumb ph">📦</div>`}
          <div class="main">
            <div class="name">${itemTitleHtml(it)}</div>
            <div class="meta">
              <span>${esc(categoryLabel(it.category, lang))}</span>
              ${it.fields?.room ? `<span>${esc(it.fields.room)}</span>` : ''}
              <span>${esc(t('productsCount', { n: it._products.length }))}</span>
              ${it._best?.rating ? `<span class="stars" title="${esc(t('bestRating', { n: it._best.rating }))}">${stars(it._best.rating)}</span>` : ''}
              ${it._chosen.length ? `<span>✓ ${esc(t('chosenMark'))}</span>` : ''}
            </div>
          </div>
          <span class="chip st-${st}">${esc(t('status_' + st))}</span>
        </div>`;
      }).join('');
  };
  renderList();

  app.onclick = e => {
    const fb = e.target.closest('[data-filter]');
    // 再点一次已选中的状态 = 取消筛选
    if (fb) { f.status = f.status === fb.dataset.filter ? 'all' : fb.dataset.filter; renderOverview(app, { pid }, ctx); return; }
    const row = e.target.closest('[data-open]');
    if (row) ctx.nav(`/p/${pid}/item/${row.dataset.open}`);
  };
  $('#add-item').onclick = () => ctx.nav(`/p/${pid}/item/new`);
  $('#info').onclick = () => ctx.nav(`/p/${pid}/info`);
  $('#go-suppliers').onclick = () => ctx.nav(`/p/${pid}/suppliers`);
  $('#sup').onclick = () => openPicker({
    searchPlaceholder: t('searchSupplier'),
    options: supplierOptions(suppliers, id => supItems[id] || 0),
    selected: f.sup,
    onPick: v => { f.sup = v; renderOverview(app, { pid }, ctx); },
  });
  const jump = $('#jump');
  if (jump) jump.onclick = () => openPicker({
    searchPlaceholder: t('filterPlaceholder'),
    options: items.map(it => ({
      value: it.id,
      label: itemTitle(it),
      html: `<span class="dot st-${it.status || 'todo'}"></span> ${itemTitleHtml(it)}`,
      sub: [it.fields?.room, t('status_' + (it.status || 'todo'))].filter(Boolean).join(' · '),
    })),
    onPick: v => ctx.nav(`/p/${pid}/item/${v}`),
  });
  const qi = $('#q');
  if (qi) qi.oninput = () => { f.q = qi.value; renderList(); };
}
