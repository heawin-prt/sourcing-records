// 本地数据层（IndexedDB）
// 所有记录都带 id / updatedAt / updatedBy / deleted，为 M2 的同步包合并做准备：
// 删除只打标记（软删除），合并时按 updatedAt 取较新版本。

const DB_NAME = 'site-purchase';
const DB_VERSION = 1;
export const STORES = ['projects', 'items', 'products', 'suppliers', 'photos'];

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          const s = db.createObjectStore(name, { keyPath: 'id' });
          if (name !== 'projects') s.createIndex('projectId', 'projectId');
        }
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

let currentUser = '';
export function setCurrentUser(name) { currentUser = name || ''; }

/** 新建或更新记录；自动补 id、时间戳、修改人。 */
export async function put(storeName, record) {
  const now = new Date().toISOString();
  const rec = { ...record };
  if (!rec.id) rec.id = newId();
  if (!rec.createdAt) { rec.createdAt = now; rec.createdBy = currentUser; }
  rec.updatedAt = now;
  rec.updatedBy = currentUser;
  if (rec.deleted === undefined) rec.deleted = false;
  const s = await store(storeName, 'readwrite');
  await wrap(s.put(rec));
  return rec;
}

export async function get(storeName, id) {
  if (!id) return null;
  const s = await store(storeName);
  const rec = await wrap(s.get(id));
  return rec && !rec.deleted ? rec : null;
}

/** 取某项目下全部未删除记录。 */
export async function listByProject(storeName, projectId) {
  const s = await store(storeName);
  const all = await wrap(s.index('projectId').getAll(projectId));
  return all.filter(r => !r.deleted);
}

export async function listProjects() {
  const s = await store('projects');
  const all = await wrap(s.getAll());
  return all.filter(r => !r.deleted).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** 软删除。 */
export async function remove(storeName, id) {
  const s = await store(storeName);
  const rec = await wrap(s.get(id));
  if (!rec) return;
  rec.deleted = true;
  await put(storeName, rec);
}

/** 删除项目及其下所有记录（软删除）。 */
export async function removeProject(projectId) {
  for (const name of ['items', 'products', 'suppliers', 'photos']) {
    for (const r of await listByProject(name, projectId)) await remove(name, r.id);
  }
  await remove('projects', projectId);
}

/** 删除物品及其产品（软删除）。照片随产品一起保留标记。 */
export async function removeItem(item) {
  const products = (await listByProject('products', item.projectId)).filter(p => p.itemId === item.id);
  for (const p of products) await removeProduct(p);
  await remove('items', item.id);
}

export async function removeProduct(product) {
  for (const pid of [...(product.photoIds || []), ...(product.shopPhotoIds || [])]) await remove('photos', pid);
  await remove('products', product.id);
}

/** 更新项目的 updatedAt，使项目列表按最近使用排序。 */
export async function touchProject(projectId) {
  const p = await get('projects', projectId);
  if (p) await put('projects', p);
}

export async function getMeta(key, fallback = null) {
  const s = await store('meta');
  const v = await wrap(s.get(key));
  return v === undefined ? fallback : v;
}

export async function setMeta(key, value) {
  const s = await store('meta', 'readwrite');
  await wrap(s.put(value, key));
}
