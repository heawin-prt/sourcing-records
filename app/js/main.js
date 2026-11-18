// 入口：初始化设置、简单的 hash 路由、顶栏。

import * as db from './db.js';
import { initLang, t } from './i18n.js';
import { $, releaseUrls, setDateOrder } from './ui.js';
import { renderProjects } from './views/projects.js';
import { renderOverview } from './views/overview.js';
import { renderItem, renderItemForm } from './views/item.js';
import { renderProductForm } from './views/product.js';
import { renderExport } from './views/export.js';
import { renderSettings } from './views/settings.js';
import { renderSupplierList, renderSupplierForm } from './views/supplier.js';
import { renderProducts } from './views/products.js';
import { importBundledProjects } from './seed.js';
import { renderProjectNew } from './views/project-new.js';

// 路由表：模式 → 页面函数。参数用 :name 表示。
const ROUTES = [
  ['/', renderProjects],
  ['/settings', renderSettings],
  ['/new', renderProjectNew],
  ['/p/:pid/products', renderProducts],
  ['/p/:pid/info', renderProjectNew],
  ['/p/:pid', renderOverview],
  ['/p/:pid/export', renderExport],
  ['/p/:pid/suppliers', renderSupplierList],
  ['/p/:pid/supplier/new', renderSupplierForm],
  ['/p/:pid/supplier/:sid', renderSupplierForm],
  ['/p/:pid/item/new', renderItemForm],
  ['/p/:pid/item/:iid', renderItem],
  ['/p/:pid/item/:iid/edit', renderItemForm],
  ['/p/:pid/item/:iid/product/new', renderProductForm],
  ['/p/:pid/item/:iid/product/:prid', renderProductForm],
];

function match(path) {
  const parts = path.split('/').filter(Boolean);
  for (const [pattern, fn] of ROUTES) {
    const pp = pattern.split('/').filter(Boolean);
    if (pp.length !== parts.length) continue;
    const params = {};
    let ok = true;
    pp.forEach((seg, i) => {
      if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(parts[i]);
      else if (seg !== parts[i]) ok = false;
    });
    if (ok) return { fn, params };
  }
  return { fn: renderProjects, params: {} };
}

export const ctx = {
  /** 跳转；replace=true 时不留历史（例如保存后返回） */
  nav(path, replace = false) {
    if (replace) location.replace('#' + path);
    else location.hash = path;
  },
  /** 设置页面标题与返回目标 */
  setTop(title, backPath, actionsHtml = '', titleHtml = '') {
    if (titleHtml) $('#title').innerHTML = titleHtml; else $('#title').textContent = title;
    document.title = title === t('appName') ? title : `${title} · ${t('appName')}`;
    const back = $('#nav-back');
    back.hidden = !backPath;
    back.onclick = () => ctx.nav(backPath);
    $('#topbar-actions').innerHTML = actionsHtml;
  },
};

async function route() {
  releaseUrls();
  const [path, qs] = (location.hash.replace(/^#/, '') || '/').split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  const { fn, params } = match(path || '/');
  const app = $('#app');
  try {
    await fn(app, params, ctx, query);
  } catch (err) {
    console.error(err);
    app.innerHTML = `<p class="empty">${t('errorPrefix')}: ${String(err.message || err)}</p>`;
  }
  window.scrollTo(0, 0);
}

async function init() {
  initLang(await db.getMeta('lang'));
  setDateOrder(await db.getMeta('dateOrder', 'ymd'));
  db.setCurrentUser(await db.getMeta('nickname', ''));
  await importBundledProjects();
  // 正式网址（https）上启用 Service Worker：保证拿到最新版本，断网也能打开
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW register failed', err));
  }
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
  window.addEventListener('hashchange', route);
  await route();
}

init();
