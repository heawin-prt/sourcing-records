// 项目总览页（需求第 10、11、13 条）：按进度、按供应商筛选，快速定位物品，物品列表。

import * as db from '../db.js';
import { t, getLang } from '../i18n.js';
import { categoryLabel } from '../templates.js';
import { esc, $, blobUrl, releaseUrls, stars, STATUSES, itemTitle, itemTitleHtml, ICONS, openStatusMenu, toast, confirmDialog } from '../ui.js';
import { transferItems } from '../transfer.js';
import { openPicker } from '../picker.js';
import { loadProject, coverPhotoId } from './summary.js';
import { projectSummary, projectType } from './project-new.js';

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
    <div class="bottom-bar select-bar" id="sel-bar" hidden><div class="inner">
      <div class="sel-row">
        <button type="button" class="btn small" id="sel-cancel" aria-label="${esc(t('cancel'))}">✕</button>
        <span id="sel-count" class="sel-count"></span>
        <button type="button" class="btn small" id="sel-all"></button>
      </div>
      <div class="sel-row">
        <button type="button" class="btn primary" id="sel-move">${esc(t('moveToProject'))}</button>
        <button type="button" class="btn danger" id="sel-del">${esc(t('delete'))}</button>
      </div>
    </div></div>
  `;

  // —— 多选：长按任意物品进入；点物品勾选/取消；底部可移到其他项目或删除 ——
  let sel = null; // null = 不在多选状态；否则是选中物品 id 的集合
  let shownIds = [];

  const renderList = () => {
    const q = f.q.trim().toLowerCase();
    const shown = items.filter(it => {
      if (f.status !== 'all' && (it.status || 'todo') !== f.status) return false;
      if (f.sup && !it._products.some(p => p.supplierId === f.sup)) return false;
      if (!q) return true;
      const hay = [it.name, it.note, categoryLabel(it.category, lang), ...Object.values(it.fields || {})].join(' ').toLowerCase();
      return hay.includes(q);
    });
    shownIds = shown.map(it => it.id);
    $('#list').innerHTML = !items.length ? `<p class="empty">${esc(t('noItems'))}</p>`
      : !shown.length ? `<p class="empty">${esc(t('noMatch'))}</p>`
      : shown.map(it => {
        const st = it.status || 'todo';
        return `
        <div class="list-item${sel ? ' selecting' : ''}${sel?.has(it.id) ? ' selected' : ''}" data-open="${esc(it.id)}">
          ${sel ? `<span class="sel-box${sel.has(it.id) ? ' on' : ''}">${sel.has(it.id) ? '✓' : ''}</span>` : ''}
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
          ${sel ? `<span class="chip st-${st}">${esc(t('status_' + st))}</span>`
            : `<button type="button" class="chip chip-btn st-${st}" data-item-st="${esc(it.id)}">${esc(t('status_' + st))} ▾</button>`}
        </div>`;
      }).join('');
    paintSelBar();
  };

  function paintSelBar() {
    $('#sel-bar').hidden = !sel;
    $('#add-item').hidden = !!sel;
    if (!sel) return;
    $('#sel-count').textContent = t('selectedN', { n: sel.size });
    const allOn = shownIds.length && shownIds.every(id => sel.has(id));
    $('#sel-all').textContent = t(allOn ? 'selectNone' : 'selectAll');
    $('#sel-move').disabled = $('#sel-del').disabled = !sel.size;
  }
  function setSel(v) { sel = v; renderList(); }

  // 长按（约半秒）进入多选；手指移动则取消（避免和滚动冲突）
  let pressTimer = null, pressAt = null, suppressClick = false;
  const list = $('#list');
  list.onpointerdown = e => {
    // 新的一次按下：长按结束时若浏览器没发出 click（列表已重画），清掉"忽略下一次点击"，免得吞掉这次点击
    suppressClick = false;
    const row = e.target.closest('.list-item[data-open]');
    if (!row || sel) return;
    pressAt = { x: e.clientX, y: e.clientY };
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      pressTimer = null;
      suppressClick = true;
      if (navigator.vibrate) navigator.vibrate(15);
      setSel(new Set([row.dataset.open]));
    }, 500);
  };
  list.onpointermove = e => {
    if (pressTimer && pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 10) { clearTimeout(pressTimer); pressTimer = null; }
  };
  list.onpointerup = list.onpointercancel = () => { clearTimeout(pressTimer); pressTimer = null; };
  list.oncontextmenu = e => { if (e.target.closest('.list-item')) e.preventDefault(); }; // 长按不弹系统菜单

  $('#sel-cancel').onclick = () => setSel(null);
  $('#sel-all').onclick = () => {
    const allOn = shownIds.every(id => sel.has(id));
    setSel(allOn ? new Set() : new Set([...sel, ...shownIds]));
  };
  $('#sel-del').onclick = async () => {
    if (!sel.size || !await confirmDialog(t('confirmDeleteItems', { n: sel.size }))) return;
    const n = sel.size;
    for (const id of sel) { const it = items.find(x => x.id === id); if (it) await db.removeItem(it); }
    await db.touchProject(pid);
    toast(t('deletedItems', { n }));
    renderOverview(app, { pid }, ctx);
  };
  $('#sel-move').onclick = async () => {
    if (!sel.size) return;
    const others = (await db.listProjects()).filter(p => p.id !== pid);
    if (!others.length) { toast(t('noOtherProject')); return; }
    openPicker({
      searchPlaceholder: t('searchProject'),
      options: others.map(p => ({ value: p.id, label: p.name, sub: [t('sort_' + (projectType(p) === 'exhibition' ? 'exhibition' : 'procurement')), projectSummary(p)].filter(Boolean).join(' · ') })),
      onPick: async toPid => {
        const target = others.find(p => p.id === toPid);
        const choice = await transferDialog(sel.size, target.name);
        if (!choice) return;
        const n = await transferItems([...sel], pid, toPid, choice);
        toast(t(choice.keep ? 'copiedItems' : 'movedItems', { n, name: target.name }));
        renderOverview(app, { pid }, ctx);
      },
    });
  };

  renderList();

  app.onclick = e => {
    if (suppressClick) { suppressClick = false; if (e.target.closest('#list')) return; }
    // 多选状态：点物品 = 勾选 / 取消
    if (sel) {
      const row = e.target.closest('#list [data-open]');
      if (row) {
        const id = row.dataset.open;
        const next = new Set(sel);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSel(next);
        return;
      }
    }
    // 物品右边的状态：点开小菜单改成其它状态（顶部各状态的数量和筛选随之更新，页面位置不变）
    const stBtn = e.target.closest('[data-item-st]');
    if (stBtn) {
      const it = items.find(x => x.id === stBtn.dataset.itemSt);
      openStatusMenu(stBtn, it.status || 'todo', async st => {
        const raw = await db.get('items', it.id);
        await db.put('items', { ...raw, status: st });
        await db.touchProject(pid);
        const y = window.scrollY;
        await renderOverview(app, { pid }, ctx);
        window.scrollTo(0, y);
        toast(t('saved'));
      });
      return;
    }
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

/** 移到其他项目前确认：可勾"同时保留在本项目"（=复制）。返回 {keep} 或 null（取消）。 */
function transferDialog(n, name) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'dialog-mask';
    el.innerHTML = `<div class="dialog" role="dialog">
      <p>${esc(t('moveItemsTo', { n, name }))}</p>
      <label class="check"><input type="checkbox" id="td-keep">${esc(t('keepInThisProject'))}</label>
      <div class="dialog-actions">
        <button type="button" class="btn" data-v="0">${esc(t('cancel'))}</button>
        <button type="button" class="btn primary" data-v="1" id="td-ok">${esc(t('doMove'))}</button>
      </div></div>`;
    const done = v => { el.remove(); window.removeEventListener('hashchange', cancel); resolve(v); };
    const cancel = () => done(null);
    el.querySelector('#td-keep').onchange = e => { el.querySelector('#td-ok').textContent = t(e.target.checked ? 'doCopy' : 'doMove'); };
    el.onclick = e => {
      if (e.target === el) return done(null);
      const b = e.target.closest('[data-v]');
      if (b) done(b.dataset.v === '1' ? { keep: el.querySelector('#td-keep').checked } : null);
    };
    window.addEventListener('hashchange', cancel);
    document.body.appendChild(el);
  });
}
