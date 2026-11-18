// 生成 Word 文档（.docx）：项目标题和基础信息 + 表格（与 Excel 相同的列、行、照片、分组合计、总合计）。
// docx 库体积较大，用到时才加载。Word 里没有公式，小计/合计直接写计算好的数值。

import * as db from './db.js';
import { t, getLang } from './i18n.js';
import { fmtMoney, fmtDateTime } from './ui.js';
import { planExport, rowAmount, exportFileName } from './export-excel.js';
import { projectSummary } from './views/project-new.js';

let docxPromise = null;
function loadDocx() {
  if (window.docx) return Promise.resolve(window.docx);
  docxPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/docx.umd.js';
    s.onload = () => resolve(window.docx);
    s.onerror = () => { docxPromise = null; reject(new Error('docx load failed')); };
    document.head.appendChild(s);
  });
  return docxPromise;
}

/**
 * docx 库把嵌入的图片一律标成 PNG，所以先把照片转成真正的 PNG（同时算出显示尺寸），
 * 避免 Word 因格式不符显示不出来。
 */
async function toPng(blob, max) {
  const bmp = await createImageBitmap(blob);
  const scale = max / Math.max(bmp.width, bmp.height);
  const size = { width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) };
  const canvas = document.createElement('canvas');
  canvas.width = size.width * 2; canvas.height = size.height * 2; // 2 倍像素，打印更清晰
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  if (bmp.close) bmp.close();
  const png = await new Promise(r => canvas.toBlob(r, 'image/png'));
  return { data: await png.arrayBuffer(), size };
}

/**
 * @returns {Promise<{blob: Blob, filename: string, rowCount: number}>}
 */
export async function buildDocx(data, opts) {
  const D = await loadDocx();
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ImageRun,
    HeadingLevel, PageOrientation, AlignmentType, ShadingType } = D;
  const { groupTotals, wantTotal, cols, nPhotos, rows } = planExport(data, opts);
  const colon = getLang() === 'en' ? ': ' : '：';
  const IMG = 64; // 照片显示边长（像素）

  const HEAD_FILL = 'DCE6F7', GROUP_FILL = 'F1F4FA';
  const cell = (content, { bold = false, fill, right = false } = {}) => new TableCell({
    children: [new Paragraph({
      alignment: right ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: Array.isArray(content) ? content : [new TextRun({ text: String(content ?? ''), bold })],
    })],
    shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
    margins: { top: 40, bottom: 40, left: 60, right: 60 },
  });
  const valueText = (c, v) => (c.money && v !== '' && v != null ? fmtMoney(v) : v);

  // 表头
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell(t('colNo'), { bold: true, fill: HEAD_FILL }),
      ...cols.map(c => cell(c.label(data.project), { bold: true, fill: HEAD_FILL })),
      ...Array.from({ length: nPhotos }, (_, i) => cell(nPhotos > 1 ? `${t('colPhoto')} ${i + 1}` : t('colPhoto'), { bold: true, fill: HEAD_FILL })),
    ],
  });

  const amountIdx = cols.findIndex(c => c.key === 'amount'); // 在 cols 中的位置
  const sumRow = (text, amount, fill) => new TableRow({
    children: [
      cell('', { fill }),
      ...cols.map((c, i) => i === 0 && amountIdx !== 0 ? cell(text, { bold: true, fill })
        : i === amountIdx ? cell(fmtMoney(Math.round(amount * 100) / 100), { bold: true, fill, right: true })
        : cell('', { fill })),
      ...Array.from({ length: nPhotos }, () => cell('', { fill })),
    ],
  });

  const body = [];
  let total = 0, groupSum = 0;
  for (let i = 0; i < rows.length; i++) {
    const { it, p, g } = rows[i];
    const sup = p ? data.supplierMap[p.supplierId] : null;
    const photoCells = [];
    for (let k = 0; k < nPhotos; k++) {
      const id = p?.photoIds?.[k];
      const ph = id && await db.get('photos', id);
      if (ph) {
        const { data: png, size } = await toPng(ph.thumb, IMG);
        photoCells.push(cell([new ImageRun({ data: png, transformation: size })]));
      } else photoCells.push(cell(''));
    }
    body.push(new TableRow({
      cantSplit: true,
      children: [
        cell(i + 1),
        ...cols.map(c => cell(valueText(c, c.get(it, p, sup)), { right: !!c.num })),
        ...photoCells,
      ],
    }));
    const amt = rowAmount(it, p) || 0;
    total += amt; groupSum += amt;
    if (groupTotals && (i === rows.length - 1 || rows[i + 1].g.key !== g.key)) {
      body.push(sumRow(`${t('groupTotal')}${colon}${g.name}`, groupSum, GROUP_FILL));
      groupSum = 0;
    }
  }
  if (wantTotal && rows.length) body.push(sumRow(t('total'), total, HEAD_FILL));

  // 标题与项目信息
  const p = data.project;
  const info = [projectSummary(p), p.desc].filter(Boolean);
  const intro = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: p.name })] }),
    ...info.map(line => new Paragraph({ children: [new TextRun({ text: line, color: '555555' })] })),
    new Paragraph({ children: [new TextRun({ text: `${t('exportedAt')}${colon}${fmtDateTime(new Date().toISOString())}`, color: '888888', size: 16 })] }),
    new Paragraph({ text: '' }),
  ];

  const doc = new Document({
    creator: 'Socinfo',
    title: p.name,
    styles: { default: { document: { run: { size: 18, font: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Microsoft YaHei' } } } } },
    sections: [{
      properties: {
        page: {
          size: { orientation: cols.length + nPhotos > 6 ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
          margin: { top: 720, bottom: 720, left: 720, right: 720 }, // 0.5 英寸
        },
      },
      children: [
        ...intro,
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...body] }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  return { blob, filename: exportFileName(data, 'docx'), rowCount: rows.length };
}
