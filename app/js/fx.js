// 汇率：以人民币为基准，每天联网取一次并缓存；取不到时用上次缓存的汇率。
// 产品保存时会记下当时的汇率（快照），以后回看不随汇率变化。

import * as db from './db.js';

export const FX_CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'HKD', 'JPY'];

// 两个免费、无需密钥的接口，依次尝试
const SOURCES = [
  async () => {
    const r = await fetchJson('https://open.er-api.com/v6/latest/CNY');
    if (r.result !== 'success') throw new Error('er-api failed');
    return { date: new Date(r.time_last_update_unix * 1000).toISOString().slice(0, 10), rates: r.rates };
  },
  async () => {
    const r = await fetchJson('https://api.frankfurter.app/latest?from=CNY');
    return { date: r.date, rates: r.rates };
  },
];

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * @param {{force?: boolean}} opts force=true 时无论缓存是否当天都重新获取
 * @returns {Promise<{date: string, fetchedOn: string, rates: Object<string, number>}|null>}
 */
export async function getRates({ force = false } = {}) {
  const cached = await db.getMeta('fxRates');
  if (cached && cached.fetchedOn === today() && !force) return cached;
  for (const src of SOURCES) {
    try {
      const { date, rates } = await src();
      const keep = Object.fromEntries(FX_CURRENCIES.filter(c => rates[c]).map(c => [c, rates[c]]));
      if (!Object.keys(keep).length) continue;
      const rec = { date, fetchedOn: today(), rates: keep };
      await db.setMeta('fxRates', rec);
      return rec;
    } catch { /* 试下一个来源 */ }
  }
  return cached || null;
}

export function convert(cny, rate) {
  if (cny === null || cny === undefined || cny === '' || !rate) return null;
  return Math.round(Number(cny) * rate * 100) / 100;
}

export function fmtFx(amount, currency) {
  if (amount === null || amount === undefined) return '';
  return `${currency} ${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 产品的换算价格（右边选的币种）：优先用保存时的汇率快照。和报价币种相同时不显示。 */
export function productFx(p) {
  if (!p || !p.fxCurrency || !p.fxRate) return '';
  if (p.fxCurrency === productPrice(p).currency) return '';
  return fmtFx(convert(p.priceCny, p.fxRate), p.fxCurrency);
}

/** 价格可选的币种（人民币在前）。 */
export const PRICE_CURRENCIES = ['CNY', ...FX_CURRENCIES];

/** 产品的报价（原币种）：没有记录币种的旧数据按人民币。 */
export function productPrice(p) {
  if (!p) return { amount: null, currency: 'CNY' };
  if (p.priceCurrency && p.priceCurrency !== 'CNY') return { amount: p.price ?? null, currency: p.priceCurrency };
  return { amount: p.price ?? p.priceCny ?? null, currency: 'CNY' };
}

/** 报价的显示文字：人民币用 ¥，外币用 USD 12.00 */
export function fmtProductPrice(p) {
  const { amount, currency } = productPrice(p);
  if (amount === null || amount === undefined || amount === '') return '';
  return currency === 'CNY' ? '¥' + Number(amount).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : fmtFx(amount, currency);
}
