// 把物品（连同它的产品、照片、所用供应商）移到或复制到另一个项目。
// 供应商属于项目：目标项目里已有同名同电话的就直接用，没有就复制一份过去（原项目的供应商保留，别的物品可能还在用）。

import * as db from './db.js';

/** 复制一张照片记录到目标项目，返回新 id。 */
async function copyPhoto(id, toPid) {
  const ph = await db.get('photos', id);
  if (!ph) return null;
  const { id: _id, createdAt, createdBy, updatedAt, updatedBy, ...rest } = ph;
  return (await db.put('photos', { ...rest, projectId: toPid })).id;
}

/** 把照片记录改属目标项目（移动时用），返回原 id。 */
async function movePhoto(id, toPid) {
  const ph = await db.get('photos', id);
  if (!ph) return null;
  await db.put('photos', { ...ph, projectId: toPid });
  return id;
}

async function photoList(ids, toPid, copy) {
  const out = [];
  for (const id of ids || []) {
    const v = copy ? await copyPhoto(id, toPid) : await movePhoto(id, toPid);
    if (v) out.push(v);
  }
  return out;
}

/**
 * @param {string[]} itemIds 要处理的物品
 * @param {string} fromPid 原项目
 * @param {string} toPid 目标项目
 * @param {{keep: boolean}} opts keep=true：原项目保留（复制）；false：移动
 * @returns {Promise<number>} 处理的物品数
 */
export async function transferItems(itemIds, fromPid, toPid, { keep }) {
  if (fromPid === toPid || !itemIds.length) return 0;
  const [srcItems, srcProducts, srcSuppliers, dstItems, dstSuppliers] = await Promise.all([
    db.listByProject('items', fromPid),
    db.listByProject('products', fromPid),
    db.listByProject('suppliers', fromPid),
    db.listByProject('items', toPid),
    db.listByProject('suppliers', toPid),
  ]);
  const want = new Set(itemIds);
  const items = srcItems.filter(it => want.has(it.id))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt));

  // 供应商对应关系：原 id → 目标项目里的 id
  const key = s => `${(s.name || '').trim().toLowerCase()}|${(s.phone || '').trim()}`;
  const dstByKey = new Map(dstSuppliers.map(s => [key(s), s.id]));
  const srcSup = new Map(srcSuppliers.map(s => [s.id, s]));
  const supMap = new Map();
  async function mapSupplier(sid) {
    if (!sid) return null;
    if (supMap.has(sid)) return supMap.get(sid);
    const s = srcSup.get(sid);
    if (!s) { supMap.set(sid, null); return null; }
    let id = dstByKey.get(key(s));
    if (!id) {
      const { id: _id, createdAt, createdBy, updatedAt, updatedBy, ...rest } = s;
      const cardPhotoId = s.cardPhotoId ? await copyPhoto(s.cardPhotoId, toPid) : null;
      const photoIds = await photoList(s.photoIds, toPid, true);
      id = (await db.put('suppliers', { ...rest, projectId: toPid, cardPhotoId, photoIds, copiedFrom: s.id })).id;
      dstByKey.set(key(s), id);
    }
    supMap.set(sid, id);
    return id;
  }

  // 放到目标项目清单的最后
  let order = Math.max(Date.now(), ...dstItems.map(it => it.order ?? 0)) + 1;
  for (const it of items) {
    const photoIds = await photoList(it.photoIds, toPid, keep);
    let newItemId;
    if (keep) {
      const { id: _id, createdAt, createdBy, updatedAt, updatedBy, ...rest } = it;
      newItemId = (await db.put('items', { ...rest, projectId: toPid, photoIds, order: order++, copiedFrom: it.id })).id;
    } else {
      newItemId = it.id;
      await db.put('items', { ...it, projectId: toPid, photoIds, order: order++ });
    }
    for (const p of srcProducts.filter(x => x.itemId === it.id)) {
      const supplierId = await mapSupplier(p.supplierId);
      const pics = {
        photoIds: await photoList(p.photoIds, toPid, keep),
        shopPhotoIds: await photoList(p.shopPhotoIds, toPid, keep),
        marketPhotoIds: await photoList(p.marketPhotoIds, toPid, keep),
      };
      if (keep) {
        const { id: _id, createdAt, createdBy, updatedAt, updatedBy, ...rest } = p;
        await db.put('products', { ...rest, ...pics, projectId: toPid, itemId: newItemId, supplierId });
      } else {
        await db.put('products', { ...p, ...pics, projectId: toPid, supplierId });
      }
    }
  }
  await db.touchProject(toPid);
  await db.touchProject(fromPid);
  return items.length;
}
