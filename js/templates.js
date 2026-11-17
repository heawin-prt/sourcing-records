// 品类模板：清单物品的字段随品类变化（需求第 3 条）。
// M1 固定在代码里；M3 起可在 App 内编辑。

export const COMMON_FIELDS = [
  { key: 'room', zh: '用途', en: 'Usage' },
  { key: 'material', zh: '材料', en: 'Material' },
  { key: 'size', zh: '尺寸', en: 'Size' },
  { key: 'color', zh: '颜色', en: 'Color' },
  { key: 'spec', zh: '规格', en: 'Specification' },
  { key: 'special', zh: '特殊要求', en: 'Special requirements', multiline: true },
  { key: 'budget', zh: '预算', en: 'Budget', type: 'number', currency: true },
];

export const CATEGORIES = [
  { key: 'general', zh: '通用', en: 'General', fields: [] },
  {
    key: 'furniture', zh: '家具', en: 'Furniture', fields: [
      { key: 'style', zh: '风格', en: 'Style' },
    ],
  },
  {
    key: 'appliance', zh: '电器', en: 'Appliance', fields: [
      { key: 'brand', zh: '品牌', en: 'Brand' },
      { key: 'model', zh: '型号', en: 'Model' },
      { key: 'power', zh: '功率', en: 'Power' },
      { key: 'voltage', zh: '电压/插头标准', en: 'Voltage / plug' },
      { key: 'cert', zh: '认证（CE/UL/CSA）', en: 'Certification (CE/UL/CSA)' },
    ],
  },
  {
    key: 'lighting', zh: '灯具', en: 'Lighting', fields: [
      { key: 'lightSource', zh: '光源类型', en: 'Light source' },
      { key: 'colorTemp', zh: '色温', en: 'Color temperature' },
      { key: 'power', zh: '功率', en: 'Power' },
      { key: 'base', zh: '灯头', en: 'Lamp base' },
      { key: 'dimmable', zh: '调光', en: 'Dimmable' },
      { key: 'ip', zh: 'IP 等级', en: 'IP rating' },
    ],
  },
];

/** 内置品类；自定义品类（用户自己输入的文字）返回"通用"，只用通用字段。 */
export function getCategory(key) {
  return CATEGORIES.find(c => c.key === key) || CATEGORIES[0];
}

export function isBuiltinCategory(key) {
  return CATEGORIES.some(c => c.key === key);
}

/** 品类显示名：内置品类按语言显示，自定义品类原样显示。 */
export function categoryLabel(key, lang) {
  if (!key) return label(CATEGORIES[0], lang);
  const c = CATEGORIES.find(x => x.key === key);
  return c ? label(c, lang) : key;
}

/** 输入的品类文字 → 存储值：和内置品类的中文或英文名相同就存内置键，否则存文字本身。 */
export function resolveCategory(text) {
  const v = (text || '').trim();
  if (!v) return 'general';
  const low = v.toLowerCase();
  const c = CATEGORIES.find(x => x.key === low || x.zh === v || x.en.toLowerCase() === low);
  return c ? c.key : v;
}

/** 某品类的全部字段（通用字段在前）。 */
export function fieldsFor(categoryKey) {
  return [...COMMON_FIELDS, ...getCategory(categoryKey).fields];
}

export function label(obj, lang) {
  return lang === 'en' ? obj.en : obj.zh;
}
