// 导入采购清单（Excel .xlsx / Word .docx / CSV），转换成清单物品。
//
// 识别方法：
// - 表格：在前几行里找表头（品名、数量、品类、用途、尺寸、材料、颜色、规格、预算、备注等，中英文都认），按列取值。
//   只有一个格子有字的行当作分区标题（如"主卧"），作为后面各行的"用途"。
// - 没有表格的 Word / 找不到表头的表格：每行一个物品，从文字里识别数量（"Sofa ×2""2 pcs""数量：3"）。
//   Word 的标题段落、以冒号结尾的行当作分区标题。

import { loadExcelJs } from './export-excel.js';
import { resolveCategory } from './templates.js';

/** 表头关键词 → 字段。顺序有意义：先匹配的优先。 */
const HEADERS = [
  ['skip', /^(no\.?|#|序号|编号|item\s*no\.?|s\/?n)$/i],
  ['qty', /^(qty|q'?ty|quantity|quantities|pcs|units?|数量|件数|台数|套数)(?![a-z])/i],
  ['category', /^(category|categories|type|品类|类别|分类|种类)/i],
  ['room', /^(room|usage|use|location|area|space|zone|用途|房间|位置|区域|场合|使用场合)/i],
  ['size', /^(size|dimensions?|尺寸|大小|规格尺寸)/i],
  ['material', /^(materials?|材质|材料)/i],
  ['color', /^(colou?rs?|颜色|色彩)/i],
  ['budget', /^(budget|unit\s*price|price|预算|单价|价格)/i],
  ['note', /^(notes?|remarks?|comments?|备注|附注)/i],
  ['name', /^(item\s*name|items?|name|product|article|goods|品名|名称|物品|产品|货品|商品|项目)/i],
  ['spec', /^(spec|specs|specification|model|description|details?|requirements?|规格|型号|描述|说明|要求)/i],
];

const clean = s => String(s ?? '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();

function headerField(text) {
  const s = clean(text).replace(/[:：*]+$/, '');
  if (!s || s.length > 40) return null;
  for (const [field, re] of HEADERS) if (re.test(s)) return field;
  return null;
}

/** 在前 15 行里找表头：至少 2 个能识别的列，且其中一个是品名/规格。返回 { row, map: {列号: 字段} }。 */
function findHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const map = {};
    rows[r].forEach((c, i) => {
      const f = headerField(c);
      if (f && !Object.values(map).includes(f)) map[i] = f;
    });
    const fields = Object.values(map);
    if (!fields.includes('name') && fields.includes('spec')) {
      // 只有"描述"没有"品名"时，描述列就是品名
      const i = Object.keys(map).find(k => map[k] === 'spec');
      map[i] = 'name';
    }
    if (Object.values(map).includes('name') && Object.values(map).filter(f => f !== 'skip').length >= 2) return { row: r, map };
  }
  return null;
}

const num = s => {
  const m = clean(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

/** 根据品名猜品类（没有品类列时）。 */
function guessCategory(name) {
  const s = name.toLowerCase();
  if (/lamp|light|lighting|chandelier|sconce|pendant|bulb|led|灯/.test(s)) return 'lighting';
  if (/fridge|refrigerator|freezer|washer|dryer|oven|stove|cooktop|microwave|dishwasher|\btv\b|television|air ?con|heater|fan|kettle|电器|冰箱|洗衣机|烤箱|微波炉|电视|空调|热水器/.test(s)) return 'appliance';
  if (/sofa|couch|bed|table|chair|stool|bench|desk|closet|wardrobe|cabinet|dresser|shelf|shelves|sideboard|nightstand|ottoman|armchair|bookcase|vanity|mattress|家具|沙发|床|桌|椅|柜|凳|架/.test(s)) return 'furniture';
  return 'general';
}

const isTotalRow = s => /^(total|subtotal|sum|合计|小计|总计)(?![a-z])/i.test(s);

/** 表格行 → 物品。 */
function tableToItems(rows, sectionDefault = '') {
  rows = rows.map(r => r.map(clean));
  const head = findHeader(rows);
  if (!head) return linesToItems(rows.map(r => r.filter(Boolean).join(' ')), sectionDefault);
  const items = [];
  let section = sectionDefault;
  const mappedCols = Object.keys(head.map).length;
  for (let r = head.row + 1; r < rows.length; r++) {
    const row = rows[r];
    const filled = row.filter(Boolean);
    if (!filled.length) continue;
    if (isTotalRow(filled[0])) continue;
    // 只有一格有字、又不是数字：分区标题
    if (filled.length === 1 && mappedCols >= 2 && num(filled[0]) === null && filled[0].length <= 60) {
      section = filled[0].replace(/[:：]$/, '');
      continue;
    }
    const rec = {};
    for (const [col, field] of Object.entries(head.map)) {
      const v = row[col];
      if (!v || field === 'skip') continue;
      rec[field] = rec[field] ? `${rec[field]}; ${v}` : v;
    }
    if (!rec.name) continue;
    items.push(makeItem(rec, section));
  }
  return items;
}

function makeItem(rec, section) {
  const fields = {};
  for (const k of ['room', 'size', 'material', 'color', 'spec']) if (rec[k]) fields[k] = rec[k];
  if (!fields.room && section) fields.room = section;
  if (rec.budget && num(rec.budget) !== null) fields.budget = String(num(rec.budget));
  const special = [rec.note].filter(Boolean);
  if (special.length) fields.special = special.join('; ');
  const qty = rec.qty ? num(rec.qty) : null;
  const name = rec.name.replace(/\s+/g, ' ');
  return {
    name,
    qty: qty && qty > 0 ? qty : null,
    category: rec.category ? resolveCategory(rec.category) : guessCategory(name),
    fields,
  };
}

/** 一行文字 → { name, qty }。 */
function parseLine(line) {
  let s = clean(line).replace(/^([-•*·●○▪■◦]|\d+[.)、]|[a-z][.)])\s*/i, '');
  let qty = null;
  const pats = [
    /[\s,，]*[x×X*]\s*(\d+)\s*(pcs?|pieces?|sets?|units?|件|个|套|台|张|把)?\s*$/,          // Sofa x2
    /[\s,，(（]*(\d+)\s*(pcs?|pieces?|sets?|units?|件|个|套|台|张|把|只)[)）]?\s*$/i,       // Sofa 2 pcs
    /[\s,，(（]*(?:qty|quantity|数量)\s*[:：]?\s*(\d+)[)）]?\s*$/i,                       // Sofa 数量：2
  ];
  for (const re of pats) {
    const m = s.match(re);
    if (m) { qty = Number(m[1]); s = s.slice(0, m.index).trim(); break; }
  }
  if (qty === null) {
    const m = s.match(/^(\d+)\s*[x×X*]\s+(.+)$/) || s.match(/^(\d+)\s*(?:pcs?|pieces?|sets?|件|个|套|台|张|把)\s+(.+)$/i); // 2 x Sofa
    if (m) { qty = Number(m[1]); s = m[2].trim(); }
  }
  return { name: s.replace(/[,，;；:：-]+$/, '').trim(), qty };
}

/** 文字行 → 物品。line 可以是 { text, heading } 或字符串。 */
function linesToItems(lines, sectionDefault = '') {
  const items = [];
  let section = sectionDefault;
  for (const ln of lines) {
    const text = clean(typeof ln === 'string' ? ln : ln.text);
    if (!text || isTotalRow(text)) continue;
    if ((typeof ln === 'object' && ln.heading) || (/[:：]$/.test(text) && text.length <= 60)) {
      section = text.replace(/[:：]$/, '');
      continue;
    }
    const { name, qty } = parseLine(text);
    if (!name || name.length > 200) continue;
    items.push(makeItem({ name, qty: qty ? String(qty) : '' }, section));
  }
  return items;
}

// —— 读取文件 ——

async function readXlsx(buf) {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const sheets = wb.worksheets.filter(ws => ws.state !== 'hidden' && ws.actualRowCount > 0);
  const items = [];
  for (const ws of sheets) {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, row => {
      const cells = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        const cell = row.getCell(c);
        let v = cell.text;
        if (v === undefined || v === null) v = '';
        cells.push(String(v));
      }
      rows.push(cells);
    });
    // 多个工作表时，工作表名作为分区（用途）
    items.push(...tableToItems(rows, sheets.length > 1 ? ws.name : ''));
  }
  return items;
}

/** 极简 ZIP 读取：取出某个文件的内容（docx 就是 zip）。 */
async function unzipEntry(buf, wanted) {
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid .docx file');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    if (name === wanted) {
      const lNameLen = dv.getUint16(local + 26, true), lExtraLen = dv.getUint16(local + 28, true);
      const data = new Uint8Array(buf, local + 30 + lNameLen + lExtraLen, csize);
      if (method === 0) return dec.decode(data);
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(stream).text();
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('Not a valid .docx file');
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const paraText = p => [...p.getElementsByTagNameNS(W, '*')]
  .map(n => (n.localName === 't' ? n.textContent : n.localName === 'tab' ? ' ' : n.localName === 'br' ? ' ' : ''))
  .join('');

async function readDocx(buf) {
  const xml = await unzipEntry(buf, 'word/document.xml');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  const items = [];
  let lines = [];
  let section = '';
  const flushLines = () => {
    if (lines.length) {
      const got = linesToItems(lines, section);
      items.push(...got);
      // 记住最后一个分区标题，供后面的表格使用
      for (const ln of lines) if (ln.heading || /[:：]$/.test(ln.text.trim())) section = ln.text.trim().replace(/[:：]$/, '');
      lines = [];
    }
  };
  for (const el of body.children) {
    if (el.localName === 'p') {
      const style = el.getElementsByTagNameNS(W, 'pStyle')[0]?.getAttributeNS(W, 'val') || '';
      lines.push({ text: paraText(el), heading: /heading|title|标题/i.test(style) });
    } else if (el.localName === 'tbl') {
      flushLines();
      const rows = [...el.getElementsByTagNameNS(W, 'tr')].map(tr =>
        [...tr.children].filter(c => c.localName === 'tc').map(tc =>
          [...tc.getElementsByTagNameNS(W, 'p')].map(paraText).filter(Boolean).join(' ')));
      items.push(...tableToItems(rows, section));
    }
  }
  flushLines();
  return items;
}

function readCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === '\t' || ch === ';') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return tableToItems(rows);
}

/**
 * 读取清单文件，返回物品数组 [{ name, qty, category, fields }]。
 * 支持 .xlsx、.docx、.csv、.txt；旧格式 .xls / .doc 请先另存为新格式。
 */
export async function importListFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'xls' || ext === 'doc') throw new Error('OLD_FORMAT');
  if (ext === 'csv') return readCsv(await file.text());
  if (ext === 'txt') return linesToItems((await file.text()).split(/\r?\n/));
  const buf = await file.arrayBuffer();
  if (ext === 'docx') return readDocx(buf);
  if (ext === 'xlsx' || ext === 'xlsm') return readXlsx(buf);
  throw new Error('UNSUPPORTED');
}

// 供测试使用
export const _test = { tableToItems, linesToItems, parseLine };
