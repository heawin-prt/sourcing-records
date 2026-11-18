// 项目数据汇总：总览页和导出页共用。

import * as db from '../db.js';

/**
 * 读取一个项目的全部数据，并为每个物品算好产品列表、最高分、已选定产品。
 */
export async function loadProject(projectId) {
  const project = await db.get('projects', projectId);
  if (!project) return null;
  const [items, products, suppliers] = await Promise.all([
    db.listByProject('items', projectId),
    db.listByProject('products', projectId),
    db.listByProject('suppliers', projectId),
  ]);
  items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt));
  const supplierMap = Object.fromEntries(suppliers.map(s => [s.id, s]));
  const byItem = {};
  for (const p of products) (byItem[p.itemId] ||= []).push(p);
  for (const it of items) {
    const list = (byItem[it.id] || []).sort((a, b) => (b.rating || 0) - (a.rating || 0) || (a.recordedAt || '').localeCompare(b.recordedAt || ''));
    it._products = list;
    it._best = list.length ? list[0] : null;
    it._chosen = list.filter(p => p.chosen);
  }
  return { project, items, products, suppliers, supplierMap };
}

/** 项目开始页物品左边的图片：只用物品自带的图片；没有就返回 null（显示默认图标）。 */
export function coverPhotoId(item) {
  return item.photoIds?.[0] || null;
}
