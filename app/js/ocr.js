// 名片识别（离线）：Tesseract.js + 简体中文/英文模型，全部文件放在 vendor/tesseract，不依赖网络。
// 识别结果只用来预填供应商字段，必须由用户核对。

let workerPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('load failed: ' + src));
    document.head.appendChild(s);
  });
}

const abs = p => new URL(p, location.href).href;

/** 第一次调用时加载引擎和语言模型（约 8 MB，之后浏览器会缓存）。 */
async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = (async () => {
      await loadScript('vendor/tesseract/tesseract.min.js');
      return window.Tesseract.createWorker(['chi_sim', 'eng'], 1, {
        workerPath: abs('vendor/tesseract/worker.min.js'),
        corePath: abs('vendor/tesseract/core'),
        langPath: abs('vendor/tesseract/lang'),
        gzip: true,
        logger: m => currentLogger && currentLogger(m),
      });
    })().catch(err => { workerPromise = null; throw err; });
  }
  currentLogger = onProgress;
  return workerPromise;
}
let currentLogger = null;

/**
 * 识别一张名片图片。
 * @param {Blob} blob
 * @param {(info: {status: string, progress: number}) => void} [onProgress]
 * @returns {Promise<string>} 识别出的文字
 */
export async function recognize(blob, onProgress) {
  const worker = await getWorker(onProgress);
  currentLogger = onProgress;
  const { data } = await worker.recognize(blob);
  return cleanText(data.text || '');
}

/** 中文识别结果常在汉字之间插空格，去掉它们；合并多余空白。 */
export function cleanText(text) {
  return text
    .replace(/([一-鿿＀-￯])[ \t]+(?=[一-鿿＀-￯])/g, '$1')
    // 汉字与数字之间的空格（如"城 3 号馆"）
    .replace(/([一-鿿])[ \t]+(?=\d)/g, '$1')
    .replace(/(\d)[ \t]+(?=[一-鿿])/g, '$1')
    // 标签后的冒号统一
    .replace(/[ \t]*[:：][ \t]*/g, '：')
    .replace(/[ \t]+/g, ' ')
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n');
}

const COMPANY_RE = /(公司|有限|集团|工厂|厂|商行|商贸|贸易|家具|家私|灯饰|照明|电器|卫浴|建材|陶瓷|工作室|旗舰店|专卖店|门店|店|Co\.|Ltd|Inc|Company|Furniture|Lighting|Trading)/i;
const ADDRESS_RE = /(地址|地 址|Add(ress)?\b|Addr)/i;
const ADDRESS_HINT = /(省|市|区|县|镇|路|街|道|号|大道|广场|大厦|中心|城|馆)/;
const TITLE_RE = /(经理|总经理|总监|董事长|老板|店长|主管|销售|业务|设计师|厂长|Manager|Director|Sales|CEO)/i;
const BOOTH_RE = /(展位|摊位|铺位|档口|号铺|展厅|Booth|Stand)/i;
const STORE_RE = /^(门店位置|门店|店铺|店址|Store|Showroom)\s*[:：]?/i;
const LABEL_RE = /^(公司|单位|名称|姓名|联系人|手机|电话|电话号码|Tel|Mob|Mobile|Phone|微信|WeChat|地址|Add|Address|展位|摊位|E-?mail|邮箱|网址|网站|Web(?:site)?|主营|主营产品|经营范围)\s*[:：]?\s*/i;
const MAIN_RE = /^(主营产品|主营|经营范围|专业生产|专营|Main products?|Products?)\s*[:：]?\s*/i;

/**
 * 从名片文字中猜出供应商字段。
 * @returns {{name?: string, contact?: string, phone?: string, email?: string, website?: string, mainProducts?: string,
 *            booth?: string, storeLocation?: string, address?: string}}
 */
export function parseCard(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const out = {};
  const compact = text.replace(/[\s\-－—]/g, '');

  // 电话：手机号优先，其次座机
  const mobile = compact.match(/(?:\+?86)?(1[3-9]\d{9})/);
  if (mobile) out.phone = mobile[1];
  else {
    const land = text.match(/0\d{2,3}[-－\s]?\d{7,8}/);
    if (land) out.phone = land[0].replace(/\s/g, '');
  }

  // Email（识别时 @ 和 . 两边常多出空格）
  const em = text.match(/[A-Za-z0-9_%+\-]+(?:\s*\.\s*[A-Za-z0-9_%+\-]+)*\s*@\s*[A-Za-z0-9\-]+(?:\s*\.\s*[A-Za-z0-9\-]+)*\s*\.\s*[A-Za-z]{2,}/);
  if (em) out.email = em[0].replace(/\s+/g, '');

  // 网站：www.xxx.com / http(s)://… / 网址：xxx.com（排除邮箱）
  const web = text.replace(/\s*\.\s*/g, '.').match(/(?:https?:\/\/)?(?:www\.)[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+(?:\/\S*)?|https?:\/\/[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+(?:\/\S*)?|(?:网址|网站|Web(?:site)?)\s*[:：]?\s*([A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+)/i);
  if (web) out.website = (web[1] || web[0]).replace(/^(网址|网站|Web(site)?)\s*[:：]?\s*/i, '');

  const used = new Set(lines.filter(l => l.includes('@') || /www\.|https?:\/\/|网址|网站/i.test(l)));
  for (const line of lines) {
    if (used.has(line)) continue; // 邮箱、网址行
    const bare = line.replace(LABEL_RE, '');
    // 主营产品（有"主营/经营范围"等标签的行）
    if (!out.mainProducts && MAIN_RE.test(line)) {
      out.mainProducts = line.replace(MAIN_RE, '').replace(/^[:：\s]+/, '');
      used.add(line);
      continue;
    }
    // 门店位置（有"门店"标签的行，先于地址判断）
    if (!out.storeLocation && STORE_RE.test(line)) {
      out.storeLocation = line.replace(STORE_RE, '').replace(/^[:：\s]+/, '');
      used.add(line);
      continue;
    }
    // 地址
    if (!out.address && (ADDRESS_RE.test(line) || (ADDRESS_HINT.test(line) && /\d/.test(line) && bare.length >= 8))) {
      out.address = bare.replace(ADDRESS_RE, '').replace(/^[:：\s]+/, '');
      used.add(line);
      continue;
    }
    // 摊位
    if (!out.booth && BOOTH_RE.test(line)) {
      out.booth = bare.replace(BOOTH_RE, '').replace(/^[:：\s]+/, '') || bare;
      used.add(line);
      continue;
    }
  }

  // 公司名：含公司类关键词、不是地址/摊位行；"公司/有限/集团"最优先，其次中文名优先于英文名，再取最长
  const score = l => (/(公司|有限|集团)/.test(l) ? 100 : 0) + (/[一-鿿]/.test(l) ? 50 : 0) + l.length;
  const companies = lines.filter(l => COMPANY_RE.test(l) && !used.has(l) && !ADDRESS_RE.test(l) && !/\d{5,}/.test(l));
  if (companies.length) out.name = companies.sort((a, b) => score(b) - score(a))[0].replace(LABEL_RE, '');

  // 联系人：带职位的行里的 2–4 个汉字；或单独一行只有 2–4 个汉字
  for (const line of lines) {
    if (out.contact) break;
    if (/姓名|联系人/.test(line)) {
      const m = line.replace(LABEL_RE, '').match(/[一-鿿]{2,4}/);
      if (m) out.contact = m[0];
    } else if (TITLE_RE.test(line)) {
      const m = line.replace(TITLE_RE, ' ').match(/[一-鿿]{2,4}/);
      if (m) out.contact = m[0];
    }
  }
  if (!out.contact) {
    const solo = lines.find(l => /^[一-鿿]{2,4}$/.test(l) && !COMPANY_RE.test(l) && !ADDRESS_HINT.test(l));
    if (solo) out.contact = solo;
  }
  return out;
}
