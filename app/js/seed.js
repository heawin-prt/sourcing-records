// 随网站发布的项目（app/data/projects/）：每部手机第一次打开时自动导入一次。
// 记录 id 固定，所以重复导入不会产生重复项目；用户删掉的项目也不会被再次导入。

import * as db from './db.js';

/** 把一个项目数据文件写入本机数据库。返回导入的物品数。 */
export async function importProjectData(data) {
  if (data?.format !== 'sourcing-records-project') throw new Error('Not a project file');
  const { project, items = [], suppliers = [], products = [] } = data;
  await db.put('projects', project);
  for (const s of suppliers) await db.put('suppliers', { ...s, projectId: project.id });
  for (const it of items) await db.put('items', { ...it, projectId: project.id });
  for (const p of products) await db.put('products', { ...p, projectId: project.id });
  return items.length;
}

export async function importBundledProjects() {
  let index;
  try {
    const res = await fetch('data/projects/index.json', { cache: 'no-cache' });
    if (!res.ok) return 0;
    index = await res.json();
  } catch { return 0; } // 离线或文件不存在时跳过
  let n = 0;
  for (const file of index.projects || []) {
    const flag = 'bundled:' + file;
    if (await db.getMeta(flag)) continue;
    try {
      const data = await (await fetch('data/projects/' + file, { cache: 'no-cache' })).json();
      await importProjectData(data);
      await db.setMeta(flag, new Date().toISOString());
      n++;
    } catch (err) {
      console.error('bundled project import failed', file, err);
    }
  }
  return n;
}
