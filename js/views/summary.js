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

/** 物品的代表照片 id：优先已选定产品，其次最高分产品。 */
export function coverPhotoId(item) {
  const p = item._chosen[0] || item._best;
  if (p && p.photoIds && p.photoIds.length) return p.photoIds[0];
  for (const q of item._products) if (q.photoIds && q.photoIds.length) return q.photoIds[0];
  return null;
}
