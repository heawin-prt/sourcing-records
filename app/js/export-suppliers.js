// 单独导出供应商（Excel）：每个供应商一行，含联系方式、在本项目记录的产品，可嵌名片和其他图片。

import * as db from './db.js';
import { t, getLang } from './i18n.js';
import { loadExcelJs, imageInfo } from './export-excel.js';
import { fmtProductPrice } from './fx.js';

export const SUP_WHICH = ['all', 'used', 'chosen'];

/** 按"导出哪些供应商"筛选，并按名称排序。 */
export function pickSuppliers(data, which) {
  const prods = {};
  for (const p of data.products) if (p.supplierId) (prods[p.supplierId] ||= []).push(p);
  return data.suppliers
    .map(s => ({ s, products: prods[s.id] || [] }))
    .filter(({ products }) => which === 'all' || (which === 'used' ? products.length : products.some(p => p.chosen)))
    .sort((a, b) => (a.s.name || '').localeCompare(b.s.name || '', 'zh'));
}

const mapUrl = g => `https://uri.amap.com/marker?position=${g.lng},${g.lat}&coordinate=wgs84`;

function exportFileName(data) {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${data.project.name.replace(/[\\/:*?"<>|]/g, '_')}-${t('supSheet')}-${stamp}.xlsx`;
}

/**
 * @param {object} data loadProject() 的结果
 * @param {{supWhich: string, supCard: boolean, supPhotos: number}} opts
 */
export async function buildSupplierWorkbook(data, opts) {
  const ExcelJS = await loadExcelJs();
  const rows = pickSuppliers(data, opts.supWhich);
  const itemName = Object.fromEntries(data.items.map(it => [it.id, it.name]));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Socinfo';
  wb.created = new Date();
  const ws = wb.addWorksheet(t('supSheet'), { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });

  const TEXT = [
    { label: t('supplierName'), width: 24, get: s => s.name },
    { label: t('contact'), width: 12, get: s => s.contact },
    { label: t('phone'), width: 16, get: s => s.phone },
    { label: t('email'), width: 22, get: s => s.email },
    { label: t('website'), width: 20, get: s => s.website },
    { label: t('mainProducts'), width: 26, get: s => s.mainProducts },
    { label: t('booth'), width: 12, get: s => s.booth },
    { label: t('storeLocation'), width: 16, get: s => s.storeLocation },
    { label: t('address'), width: 24, get: s => s.address },
    { label: t('colMap'), width: 10, get: s => (s.geo ? { text: t('colMapOpen'), hyperlink: mapUrl(s.geo) } : '') },
    { label: t('colProductCount'), width: 8, get: (s, products) => products.length },
    {
      label: t('colProducts'), width: 40,
      get: (s, products) => products.map(p => [
        itemName[p.itemId] ? `${itemName[p.itemId]}${getLang() === 'en' ? ': ' : '：'}` : '',
        [p.name, p.model].filter(Boolean).join(' · '),
        fmtProductPrice(p) ? `  ${fmtProductPrice(p)}` : '',
        p.chosen ? '  ✓' : '',
      ].join('')).join('\n'),
    },
    { label: t('note'), width: 24, get: s => s.note },
  ];
  const nCard = opts.supCard ? 1 : 0;
  const nPhotos = opts.supPhotos || 0;
  ws.columns = [
    { header: t('colNo'), width: 6 },
    ...TEXT.map(c => ({ header: c.label, width: c.width })),
    ...(nCard ? [{ header: t('colCard'), width: 18 }] : []),
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

  const IMG = 90;
  async function putImage(photoId, col, rowNum, size) {
    const ph = await db.get('photos', photoId);
    if (!ph) return false;
    const { w, h } = await imageInfo(ph.thumb);
    const scale = size / Math.max(w, h);
    const imgId = wb.addImage({ buffer: await ph.thumb.arrayBuffer(), extension: 'jpeg' });
    ws.addImage(imgId, {
      tl: { col: col + 0.05, row: rowNum - 1 + 0.05 },
      ext: { width: Math.round(w * scale), height: Math.round(h * scale) },
      editAs: 'oneCell',
    });
    return true;
  }

  for (let i = 0; i < rows.length; i++) {
    const { s, products } = rows[i];
    const row = ws.addRow([i + 1, ...TEXT.map(c => c.get(s, products) ?? '')]);
    row.alignment = { vertical: 'top', wrapText: true };
    const mapCell = row.getCell(1 + TEXT.findIndex(c => c.label === t('colMap')) + 1);
    if (s.geo) mapCell.font = { color: { argb: 'FF1E5BD8' }, underline: true };
    // 行高：图片需要的高度，与产品清单行数需要的高度，取较大者
    const lines = Math.max(1, products.length);
    let height = Math.max(18, lines * 15 + 4);
    let col = 1 + TEXT.length; // 图片列从这里开始（0 起算）
    let hasImg = false;
    if (nCard) {
      if (s.cardPhotoId) hasImg = (await putImage(s.cardPhotoId, col, row.number, IMG * 1.3)) || hasImg;
      col++;
    }
    for (const id of (s.photoIds || []).slice(0, nPhotos)) {
      hasImg = (await putImage(id, col, row.number, IMG)) || hasImg;
      col++;
    }
    if (hasImg) height = Math.max(height, IMG * 0.75 + 8);
    row.height = height;
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 1 + TEXT.length } };

  const buf = await wb.xlsx.writeBuffer();
  return {
    blob: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename: exportFileName(data),
    rowCount: rows.length,
  };
}
