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

/** 产品的外币价格：优先用保存时的汇率快照。 */
export function productFx(p) {
  if (!p || !p.fxCurrency || !p.fxRate) return '';
  return fmtFx(convert(p.priceCny, p.fxRate), p.fxCurrency);
}
