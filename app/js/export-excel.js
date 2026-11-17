// 生成总采购表 Excel（需求第 14 条），可嵌入产品照片。ExcelJS 体积大，用到时才加载。

import * as db from './db.js';
import { t, getLang } from './i18n.js';
import { CATEGORIES, getCategory, COMMON_FIELDS, label } from './templates.js';
import { fmtDateTime } from './ui.js';
import { productFx } from './fx.js';

/** 行金额 = 单价 × 数量（产品数量优先，没有则用清单数量）。 */
export function rowQty(it, p) {
  return p?.qty ?? it.qty ?? null;
}
export function rowAmount(it, p) {
  const q = rowQty(it, p);
  return (p?.priceCny != null && q) ? Math.round(p.priceCny * q * 100) / 100 : null;
}

let excelJsPromise = null;
function loadExcelJs() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  excelJsPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/exceljs.min.js';
    s.onload = () => resolve(window.ExcelJS);
    s.onerror = () => { excelJsPromise = null; reject(new Error('ExcelJS load failed')); };
    document.head.appendChild(s);
  });
  return excelJsPromise;
}

const itemField = key => {
  const fd = COMMON_FIELDS.find(f => f.key === key);
  return { key: 'item_' + key, label: () => label(fd, getLang()), group: 'item', width: 16, get: (it) => it.fields?.[key] ?? '' };
};

/** 可导出的列（顺序即 Excel 中的顺序）。 */
export const COLUMNS = [
  { key: 'category', label: () => t('category'), group: 'item', width: 10, get: it => label(getCategory(it.category), getLang()) },
  { key: 'itemName', label: () => t('colItemName'), group: 'item', width: 22, get: it => it.name },
  { key: 'qty', label: () => t('qty'), group: 'item', width: 7, get: it => it.qty ?? '', num: true },
  itemField('room'),
  itemField('spec'),
  itemField('special'),
  itemField('budget'),
  { key: 'status', label: () => t('status'), group: 'item', width: 10, get: it => t('status_' + (it.status || 'todo')) },
  { key: 'supplierName', label: () => t('supplier'), group: 'product', width: 20, get: (it, p, s) => s?.name ?? '' },
  { key: 'contact', label: () => t('contact'), group: 'product', width: 10, get: (it, p, s) => s?.contact ?? '' },
  { key: 'phone', label: () => t('phone'), group: 'product', width: 15, get: (it, p, s) => s?.phone ?? '' },
  { key: 'email', label: () => t('email'), group: 'product', width: 22, get: (it, p, s) => s?.email ?? '' },
  { key: 'website', label: () => t('website'), group: 'product', width: 22, get: (it, p, s) => s?.website ?? '' },
  { key: 'mainProducts', label: () => t('mainProducts'), group: 'product', width: 24, get: (it, p, s) => s?.mainProducts ?? '' },
  { key: 'booth', label: () => t('booth'), group: 'product', width: 14, get: (it, p, s) => s?.booth ?? '' },
  { key: 'storeLocation', label: () => t('storeLocation'), group: 'product', width: 18, get: (it, p, s) => s?.storeLocation ?? '' },
  { key: 'address', label: () => t('address'), group: 'product', width: 24, get: (it, p, s) => s?.address ?? '' },
  { key: 'productName', label: () => t('colProductName'), group: 'product', width: 18, get: (it, p) => p?.name ?? '' },
  { key: 'priceCny', label: () => t('priceCny'), group: 'product', width: 12, num: true, money: true, get: (it, p) => p?.priceCny ?? '' },
  { key: 'priceFx', label: () => t('colFx'), group: 'product', width: 14, get: (it, p) => productFx(p) },
  { key: 'productQty', label: () => t('colQty'), group: 'product', width: 8, num: true, get: (it, p) => rowQty(it, p) ?? '' },
  // 小计 = 单价 × 数量；导出时写成 Excel 公式
  { key: 'amount', label: () => t('colSubtotal'), group: 'product', width: 13, num: true, money: true, get: (it, p) => rowAmount(it, p) ?? '' },
  // 合计：不是一列，而是表格最后一行（放在列选项里便于勾选）
  { key: 'total', label: () => t('colTotal'), group: 'product', rowOnly: true },
  { key: 'rating', label: () => t('rating'), group: 'product', width: 7, num: true, get: (it, p) => p?.rating || '' },
  { key: 'material', label: () => t('material'), group: 'product', width: 14, get: (it, p) => p?.material ?? '' },
  { key: 'size', label: () => t('size'), group: 'product', width: 14, get: (it, p) => p?.size ?? '' },
  { key: 'color', label: () => t('color'), group: 'product', width: 10, get: (it, p) => p?.color ?? '' },
  { key: 'leadTime', label: () => t('leadTime'), group: 'product', width: 10, get: (it, p) => p?.leadTime ?? '' },
  { key: 'moq', label: () => t('moq'), group: 'product', width: 12, get: (it, p) => p?.moq ?? '' },
  { key: 'quality', label: () => t('quality'), group: 'product', width: 10, get: (it, p) => p?.quality ?? '' },
  { key: 'note', label: () => t('note'), group: 'product', width: 28, get: (it, p) => p?.note ?? '' },
  { key: 'recordedAt', label: () => t('recordedAt'), group: 'product', width: 17, get: (it, p) => fmtDateTime(p?.recordedAt) },
  { key: 'recorder', label: () => t('recorder'), group: 'product', width: 10, get: (it, p) => p?.createdBy ?? '' },
];

export const DEFAULT_COLUMNS = ['category', 'itemName', 'item_room', 'productName', 'supplierName', 'phone', 'booth',
  'priceCny', 'priceFx', 'productQty', 'amount', 'total', 'rating', 'material', 'size', 'color', 'leadTime', 'moq', 'note'];

/** 小计分组的键和显示名。 */
function groupOf(by, it, p, supplierMap) {
  if (by === 'category') {
    const c = getCategory(it.category);
    return { key: String(CATEGORIES.indexOf(c)).padStart(2, '0'), name: label(c, getLang()) };
  }
  if (by === 'supplier') {
    const s = p && supplierMap[p.supplierId];
    return s ? { key: '0' + (s.name || ''), name: s.name } : { key: '1', name: t('noSupplierGroup') };
  }
  return null;
}

/** 按导出方式挑出 [物品, 产品] 行。 */
export function pickRows(items, mode, includeEmpty, statuses = null) {
  const rows = [];
  for (const it of items) {
    if (statuses && !statuses.includes(it.status || 'todo')) continue;
    let list = [];
    if (mode === 'chosen') list = it._chosen;
    else if (mode === 'best') list = it._best ? [it._best] : [];
    else list = it._products;
    if (list.length) list.forEach(p => rows.push([it, p]));
    else if (includeEmpty) rows.push([it, null]);
  }
  return rows;
}

async function imageInfo(blob) {
  const bmp = await createImageBitmap(blob);
  const info = { w: bmp.width, h: bmp.height };
  if (bmp.close) bmp.close();
  return info;
}

/**
 * @param {object} data loadProject() 的结果
 * @param {{mode:string, includeEmpty:boolean, columns:string[], photos:number}} opts photos=0 表示不嵌图
 * @returns {Promise<{blob: Blob, filename: string, rowCount: number}>}
 */
export async function buildWorkbook(data, opts) {
  const ExcelJS = await loadExcelJs();
  const subBy = opts.subtotalBy || 'none';
  const wantTotal = opts.columns.includes('total');
  // 要分组合计或总合计，就必须有小计列
  const colKeys = (subBy !== 'none' || wantTotal) && !opts.columns.includes('amount') ? [...opts.columns, 'amount'] : opts.columns;
  const cols = COLUMNS.filter(c => colKeys.includes(c.key) && !c.rowOnly);
  const nPhotos = opts.photos || 0;

  // 需要小计时按分组排序（同组内保持原顺序）
  let rows = pickRows(data.items, opts.mode, opts.includeEmpty, opts.statuses).map(([it, p], i) => ({ it, p, i, g: groupOf(subBy, it, p, data.supplierMap) }));
  if (subBy !== 'none') rows.sort((a, b) => a.g.key.localeCompare(b.g.key, 'zh') || a.i - b.i);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Site Purchase';
  wb.created = new Date();
  const ws = wb.addWorksheet(t('sheetName'), { views: [{ state: 'frozen', ySplit: 1 }] });

  const IMG = 90; // 图片显示边长（像素）
  ws.columns = [
    { header: t('colNo'), width: 6 },
    ...cols.map(c => ({ header: c.label(), width: c.width })),
    ...Array.from({ length: nPhotos }, (_, i) => ({ header: nPhotos > 1 ? `${t('colPhoto')} ${i + 1}` : t('colPhoto'), width: 14 })),
  ];
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 24;
  header.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F7' } };
    c.border = { bottom: { style: 'thin' } };
  });

  // Excel 列号（第 1 列是序号）和列字母
  const colNum = key => { const i = cols.findIndex(c => c.key === key); return i < 0 ? 0 : i + 2; };
  const letter = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const amountCol = colNum('amount');
  const priceCol = colNum('priceCny');
  const qtyCol = colNum('productQty');
  const labelCol = amountCol === 2 ? 1 : 2;
  const round2 = n => Math.round(n * 100) / 100;
  const A = letter(amountCol);

  /** 分组合计 / 总合计行：用 SUBTOTAL(9,…)，Excel 会自动跳过区域内其他 SUBTOTAL，不会重复计算 */
  function sumRow(text, amount, fromRow, toRow, fill) {
    const r = ws.addRow([]);
    r.getCell(labelCol).value = text;
    r.getCell(amountCol).value = { formula: `SUBTOTAL(9,${A}${fromRow}:${A}${toRow})`, result: round2(amount) };
    r.getCell(amountCol).numFmt = '¥#,##0.00';
    r.font = { bold: true };
    for (let c = 1; c <= ws.columns.length; c++) {
      r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    }
  }

  let total = 0, groupSum = 0, groupStart = 2;
  for (let i = 0; i < rows.length; i++) {
    const { it, p, g } = rows[i];
    const sup = p ? data.supplierMap[p.supplierId] : null;
    const values = [i + 1, ...cols.map(c => c.get(it, p, sup))];
    const row = ws.addRow(values);
    row.alignment = { vertical: 'middle', wrapText: true };
    cols.forEach((c, ci) => { if (c.money) row.getCell(ci + 2).numFmt = '¥#,##0.00'; });
    const amt = rowAmount(it, p) || 0;
    total += amt;
    groupSum += amt;
    // 小计写成公式：单价 × 数量（两列都导出了且有值时）
    if (amountCol && priceCol && qtyCol && rowAmount(it, p) !== null) {
      const n = row.number;
      row.getCell(amountCol).value = { formula: `${letter(priceCol)}${n}*${letter(qtyCol)}${n}`, result: amt };
    }

    if (nPhotos && p?.photoIds?.length) {
      row.height = IMG * 0.75 + 8; // 行高单位是磅
      const ids = p.photoIds.slice(0, nPhotos);
      for (let k = 0; k < ids.length; k++) {
        const ph = await db.get('photos', ids[k]);
        if (!ph) continue;
        const { w, h } = await imageInfo(ph.thumb);
        const scale = IMG / Math.max(w, h);
        const imgId = wb.addImage({ buffer: await ph.thumb.arrayBuffer(), extension: 'jpeg' });
        ws.addImage(imgId, {
          tl: { col: 1 + cols.length + k + 0.05, row: row.number - 1 + 0.05 },
          ext: { width: Math.round(w * scale), height: Math.round(h * scale) },
          editAs: 'oneCell',
        });
      }
    }

    // 一组结束：插入分组合计行
    if (subBy !== 'none' && (i === rows.length - 1 || rows[i + 1].g.key !== g.key)) {
      sumRow(`${t('groupTotal')}：${g.name}`, groupSum, groupStart, row.number, 'FFF1F4FA');
      groupSum = 0;
      groupStart = row.number + 2; // 跳过刚插入的分组合计行
    }
  }

  if (wantTotal && rows.length) sumRow(t('total'), total, 2, ws.rowCount, 'FFDCE6F7');

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };

  const buf = await wb.xlsx.writeBuffer();
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const safeName = data.project.name.replace(/[\\/:*?"<>|]/g, '_');
  return {
    blob: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename: `${safeName}-${t('sheetName')}-${stamp}.xlsx`,
    rowCount: rows.length,
  };
}
