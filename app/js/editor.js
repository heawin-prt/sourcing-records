// 照片编辑：旋转、裁剪、画箭头/圆圈、加文字。保存时覆盖这张照片（第一次编辑时保留原图，可随时"恢复原图"）。
// 标记先以矢量形式放在 shapes 里（可撤销），旋转/裁剪/保存时才画进图片。
import * as db from './db.js';
import { t } from './i18n.js';
import { esc, toast } from './ui.js';

const THUMB_EDGE = 320;
const COLORS = ['#e53935', '#fdd835', '#1e88e5', '#43a047', '#ffffff', '#000000'];

const svg = body => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const IC = {
  rotate: svg('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>'),
  crop: svg('<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>'),
  arrow: svg('<path d="M5 19 19 5"/><path d="M9 5h10v10"/>'),
  circle: svg('<ellipse cx="12" cy="12" rx="9" ry="7"/>'),
  text: svg('<path d="M4 6V4h16v2"/><path d="M12 4v16"/><path d="M9 20h6"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  original: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>'),
};

function toCanvas(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

async function blobToCanvas(blob) {
  const bmp = await createImageBitmap(blob);
  const c = toCanvas(bmp);
  if (bmp.close) bmp.close();
  return c;
}

function canvasBlob(c, maxEdge, quality) {
  const scale = Math.min(1, maxEdge / Math.max(c.width, c.height));
  let src = c;
  if (scale < 1) {
    src = document.createElement('canvas');
    src.width = Math.round(c.width * scale); src.height = Math.round(c.height * scale);
    src.getContext('2d').drawImage(c, 0, 0, src.width, src.height);
  }
  return new Promise(r => src.toBlob(r, 'image/jpeg', quality));
}

/** 线宽、字号随图片大小变化，大图小图上看起来一样粗。 */
function unit(base) { return Math.max(base.width, base.height) / 160; }

function drawShape(ctx, s, k) {
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = s.color;
  ctx.lineWidth = s.w * k;
  ctx.lineCap = ctx.lineJoin = 'round';
  if (s.type === 'arrow') {
    const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    const head = s.w * 4.5 * k;
    ctx.beginPath();
    ctx.moveTo(s.x1 * k, s.y1 * k);
    ctx.lineTo(s.x2 * k - Math.cos(ang) * head * 0.6, s.y2 * k - Math.sin(ang) * head * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x2 * k, s.y2 * k);
    ctx.lineTo(s.x2 * k - head * Math.cos(ang - 0.45), s.y2 * k - head * Math.sin(ang - 0.45));
    ctx.lineTo(s.x2 * k - head * Math.cos(ang + 0.45), s.y2 * k - head * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fill();
  } else if (s.type === 'circle') {
    const cx = (s.x1 + s.x2) / 2 * k, cy = (s.y1 + s.y2) / 2 * k;
    const rx = Math.abs(s.x2 - s.x1) / 2 * k, ry = Math.abs(s.y2 - s.y1) / 2 * k;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (s.type === 'text') {
    const size = s.size * k;
    ctx.font = `bold ${size}px -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textBaseline = 'middle';
    // 描一圈反差色的边，任何背景上都看得清
    ctx.lineWidth = size / 7;
    ctx.strokeStyle = isLight(s.color) ? 'rgba(0,0,0,.75)' : 'rgba(255,255,255,.85)';
    s.text.split('\n').forEach((line, i) => {
      const y = s.y * k + i * size * 1.2;
      ctx.strokeText(line, s.x * k, y);
      ctx.fillText(line, s.x * k, y);
    });
  }
  ctx.restore();
}

function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150;
}

/** 把标记画进图片，返回新画布（不改动旧画布，撤销时可直接拿回旧的）。 */
function flatten(base, shapes) {
  if (!shapes.length) return base;
  const c = toCanvas(base);
  const ctx = c.getContext('2d');
  for (const s of shapes) drawShape(ctx, s, 1);
  return c;
}

function rotate90(src) {
  const c = document.createElement('canvas');
  c.width = src.height; c.height = src.width;
  const ctx = c.getContext('2d');
  ctx.translate(c.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, 0, 0);
  return c;
}

function cropCanvas(src, r) {
  const c = document.createElement('canvas');
  c.width = Math.round(r.w); c.height = Math.round(r.h);
  c.getContext('2d').drawImage(src, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  return c;
}

/** 文字输入框（在编辑器里面弹出，避免浏览器自带 prompt）。 */
function askText() {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'pe-ask';
    el.innerHTML = `<div class="dialog">
      <textarea rows="2" placeholder="${esc(t('peTextPrompt'))}"></textarea>
      <div class="dialog-actions">
        <button type="button" class="btn" data-v="0">${esc(t('cancel'))}</button>
        <button type="button" class="btn primary" data-v="1">${esc(t('peApply'))}</button>
      </div></div>`;
    const ta = el.querySelector('textarea');
    el.onclick = e => {
      const b = e.target.closest('[data-v]');
      if (!b && e.target !== el) return;
      el.remove();
      resolve(b && b.dataset.v === '1' ? ta.value.trim() : '');
    };
    document.body.appendChild(el);
    setTimeout(() => ta.focus(), 50);
  });
}

/**
 * 打开编辑器。保存后调用 onSaved(新的照片记录)。
 * @param {string} id 照片 id
 */
export async function openEditor(id, onSaved) {
  const ph = await db.get('photos', id);
  if (!ph) return;
  let base = await blobToCanvas(ph.blob || ph.thumb);
  let shapes = [];
  const history = [];
  let tool = 'arrow';
  let color = COLORS[0];
  let crop = null; // 裁剪模式下的裁剪框（图片坐标）
  let draft = null; // 正在画的标记
  let dirty = false;

  const el = document.createElement('div');
  el.className = 'photo-editor';
  el.innerHTML = `
    <div class="pe-top">
      <button type="button" class="pe-btn" id="pe-cancel">${esc(t('cancel'))}</button>
      <span class="spacer"></span>
      ${ph.original ? `<button type="button" class="pe-btn" id="pe-original">${IC.original}<span>${esc(t('peOriginal'))}</span></button>` : ''}
      <button type="button" class="pe-btn pe-save" id="pe-save">${esc(t('save'))}</button>
    </div>
    <div class="pe-stage"><canvas></canvas></div>
    <div class="pe-colors">${COLORS.map(c => `<button type="button" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>
    <div class="pe-tools">
      ${['rotate', 'crop', 'arrow', 'circle', 'text', 'undo'].map(k => `<button type="button" class="pe-tool" data-tool="${k}">${IC[k]}<span>${esc(t('pe_' + k))}</span></button>`).join('')}
    </div>
    <div class="pe-crop-bar" hidden>
      <button type="button" class="pe-btn" id="pe-crop-cancel">${esc(t('cancel'))}</button>
      <span class="spacer"></span>
      <button type="button" class="pe-btn pe-save" id="pe-crop-ok">${esc(t('peApply'))}</button>
    </div>`;
  document.body.appendChild(el);

  const stage = el.querySelector('.pe-stage');
  const cv = el.querySelector('canvas');
  const ctx = cv.getContext('2d');
  let k = 1; // 显示比例：显示像素 / 图片像素

  function layout() {
    // clientWidth/Height 含内边距，要减掉（裁剪时四周留白就靠内边距）
    const cs = getComputedStyle(stage);
    const sw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const sh = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    k = Math.min(sw / base.width, sh / base.height);
    const dpr = window.devicePixelRatio || 1;
    cv.style.width = Math.round(base.width * k) + 'px';
    cv.style.height = Math.round(base.height * k) + 'px';
    cv.width = Math.round(base.width * k * dpr);
    cv.height = Math.round(base.height * k * dpr);
    draw();
  }

  function draw() {
    const dpr = cv.width / (base.width * k);
    const kk = k * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(base, 0, 0, cv.width, cv.height);
    for (const s of shapes) drawShape(ctx, s, kk);
    if (draft) drawShape(ctx, draft, kk);
    if (crop) {
      const x = crop.x * kk, y = crop.y * kk, w = crop.w * kk, h = crop.h * kk;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.beginPath();
      ctx.rect(0, 0, cv.width, cv.height);
      ctx.rect(x, y, w, h);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(x, y, w, h);
      // 三分线
      ctx.lineWidth = 1 * dpr;
      ctx.strokeStyle = 'rgba(255,255,255,.5)';
      ctx.beginPath();
      for (let i = 1; i < 3; i++) {
        ctx.moveTo(x + w * i / 3, y); ctx.lineTo(x + w * i / 3, y + h);
        ctx.moveTo(x, y + h * i / 3); ctx.lineTo(x + w, y + h * i / 3);
      }
      ctx.stroke();
      // 四个角的把手
      ctx.fillStyle = '#fff';
      const hs = 10 * dpr;
      for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
    }
  }

  function refreshTools() {
    el.querySelectorAll('.pe-tool').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
    el.querySelectorAll('[data-color]').forEach(b => b.classList.toggle('on', b.dataset.color === color));
    el.querySelector('[data-tool="undo"]').disabled = !history.length;
    el.querySelector('.pe-tools').hidden = !!crop;
    el.querySelector('.pe-colors').hidden = !!crop;
    el.querySelector('.pe-crop-bar').hidden = !crop;
    el.querySelector('.pe-top').classList.toggle('dim', !!crop);
    // 裁剪时把图片缩小、四周留出空白，框的边不贴着屏幕边缘（手机边缘手势会抢走拖动）
    if (stage.classList.contains('cropping') !== !!crop) {
      stage.classList.toggle('cropping', !!crop);
      layout();
    }
  }

  function pushHistory() {
    history.push({ base, shapes: [...shapes] });
    if (history.length > 30) history.shift();
    dirty = true;
  }

  function close() {
    el.remove();
    window.removeEventListener('resize', layout);
    window.removeEventListener('hashchange', close);
  }

  // —— 工具栏 ——
  el.querySelector('.pe-tools').onclick = e => {
    const b = e.target.closest('[data-tool]');
    if (!b || b.disabled) return;
    const k2 = b.dataset.tool;
    if (k2 === 'undo') {
      const h = history.pop();
      if (h) { base = h.base; shapes = h.shapes; layout(); }
    } else if (k2 === 'rotate') {
      pushHistory();
      base = rotate90(flatten(base, shapes));
      shapes = [];
      layout();
    } else if (k2 === 'crop') {
      crop = { x: 0, y: 0, w: base.width, h: base.height };
    } else {
      tool = k2;
    }
    refreshTools();
  };
  el.querySelector('.pe-colors').onclick = e => {
    const b = e.target.closest('[data-color]');
    if (b) { color = b.dataset.color; refreshTools(); }
  };
  el.querySelector('#pe-crop-cancel').onclick = () => { crop = null; refreshTools(); };
  el.querySelector('#pe-crop-ok').onclick = () => {
    if (crop.w < base.width - 1 || crop.h < base.height - 1) {
      pushHistory();
      base = cropCanvas(flatten(base, shapes), crop);
      shapes = [];
    }
    crop = null;
    layout();
    refreshTools();
  };
  el.querySelector('#pe-cancel').onclick = close;
  const orig = el.querySelector('#pe-original');
  if (orig) orig.onclick = async () => {
    pushHistory();
    base = await blobToCanvas(ph.original);
    shapes = [];
    layout();
    refreshTools();
  };
  el.querySelector('#pe-save').onclick = async () => {
    if (!dirty && !shapes.length) { close(); return; }
    const out = flatten(base, shapes);
    const blob = await canvasBlob(out, 1600, 0.85);
    const thumb = await canvasBlob(out, THUMB_EDGE, 0.75);
    const rec = await db.put('photos', { ...ph, blob, thumb, original: ph.original || ph.blob });
    close();
    toast(t('saved'));
    onSaved && onSaved(rec);
  };

  // —— 在图片上画 ——
  const pt = e => {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  };
  let drag = null;
  stage.onpointerdown = e => {
    stage.setPointerCapture(e.pointerId);
    const p = pt(e);
    if (crop) {
      const tol = 32 / k;
      const corners = { nw: [crop.x, crop.y], ne: [crop.x + crop.w, crop.y], sw: [crop.x, crop.y + crop.h], se: [crop.x + crop.w, crop.y + crop.h] };
      let mode = null;
      for (const [name, [cx, cy]] of Object.entries(corners)) if (Math.abs(p.x - cx) < tol && Math.abs(p.y - cy) < tol) mode = name;
      if (!mode && p.x > crop.x && p.x < crop.x + crop.w && p.y > crop.y && p.y < crop.y + crop.h) mode = 'move';
      drag = mode && { mode, p, c0: { ...crop } };
      return;
    }
    if (p.x < 0 || p.y < 0 || p.x > base.width || p.y > base.height) return;
    drag = { p };
    if (tool === 'arrow' || tool === 'circle') {
      draft = { type: tool, color, w: unit(base), x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    }
  };
  stage.onpointermove = e => {
    if (!drag) return;
    const p = pt(e);
    if (crop) {
      const { mode, c0 } = drag;
      const dx = p.x - drag.p.x, dy = p.y - drag.p.y;
      const min = Math.max(20, 40 / k);
      let { x, y, w, h } = c0;
      if (mode === 'move') {
        x = Math.min(Math.max(0, c0.x + dx), base.width - w);
        y = Math.min(Math.max(0, c0.y + dy), base.height - h);
      } else {
        let x2 = x + w, y2 = y + h;
        if (mode.includes('w')) x = Math.min(Math.max(0, c0.x + dx), x2 - min);
        if (mode.includes('e')) x2 = Math.max(Math.min(base.width, c0.x + c0.w + dx), x + min);
        if (mode.includes('n')) y = Math.min(Math.max(0, c0.y + dy), y2 - min);
        if (mode.includes('s')) y2 = Math.max(Math.min(base.height, c0.y + c0.h + dy), y + min);
        w = x2 - x; h = y2 - y;
      }
      crop = { x, y, w, h };
      draw();
      return;
    }
    if (draft) { draft.x2 = p.x; draft.y2 = p.y; draw(); }
  };
  stage.onpointerup = async e => {
    if (!drag) return;
    const p = pt(e);
    const start = drag.p;
    drag = null;
    if (crop) return;
    if (draft) {
      const big = Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 12 / k;
      if (big) { pushHistory(); shapes.push(draft); }
      draft = null;
      draw();
      refreshTools();
      return;
    }
    if (tool === 'text' && Math.hypot(p.x - start.x, p.y - start.y) < 12 / k) {
      const text = await askText();
      if (text) {
        pushHistory();
        shapes.push({ type: 'text', color, text, x: start.x, y: start.y, size: unit(base) * 6 });
        draw();
        refreshTools();
      }
    }
  };
  stage.onpointercancel = () => { drag = null; draft = null; draw(); };

  window.addEventListener('resize', layout);
  window.addEventListener('hashchange', close);
  refreshTools();
  requestAnimationFrame(layout);
}
