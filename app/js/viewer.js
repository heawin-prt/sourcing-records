// 点击图片放大：任何带 data-ph（照片 id）的图片，点一下全屏看原图。
// 左右滑动（或点两侧箭头、键盘左右键）看同一组的其他图片（同一个照片区、同一个产品的照片等），顶部显示"第几张/共几张"。
// 点图片：在"适合屏幕"和"原始大小（可拖动查看）"之间切换；点 ✕、背景、返回键或 Esc 关闭。
// 右下角红色铅笔：编辑（裁剪、旋转、画箭头/圆圈、加文字）。
import * as db from './db.js';
import { openEditor } from './editor.js';
import { ICONS, blobUrl } from './ui.js';

let box = null;
let list = [];   // 这一组照片的 id
let index = 0;   // 当前是第几张
let url = null;  // 当前原图的临时地址

/** 被点的图片所在的那一组（同一个照片区 / 同一个产品卡片里的照片）。 */
function groupOf(img) {
  const g = img.closest('.photo-grid, .item-photos, .photos');
  const ids = g ? [...g.querySelectorAll('img[data-ph]')].map(x => x.dataset.ph) : [];
  return ids.length ? ids : [img.dataset.ph];
}

function close() {
  if (!box) return;
  box.remove();
  box = null;
  if (url) URL.revokeObjectURL(url);
  url = null;
}

async function show(i) {
  index = (i + list.length) % list.length;
  const id = list[index];
  const ph = await db.get('photos', id);
  if (!ph || !box) return;
  const img = box.querySelector('img');
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(ph.blob || ph.thumb);
  img.src = url;
  img.style.transition = 'none';
  img.style.transform = '';
  box.classList.remove('full');
  box.scrollTo(0, 0);
  const many = list.length > 1;
  box.querySelector('.pv-count').textContent = many ? `${index + 1} / ${list.length}` : '';
  box.querySelectorAll('.pv-nav').forEach(b => { b.hidden = !many; });
}

function open(ids, start) {
  close();
  list = ids;
  box = document.createElement('div');
  box.className = 'photo-viewer';
  box.innerHTML = `<img alt="" draggable="false">
    <button type="button" class="pv-edit" aria-label="Edit">${ICONS.edit}</button>
    <span class="pv-count"></span>
    <button type="button" class="pv-close" aria-label="Close">✕</button>
    <button type="button" class="pv-nav pv-prev" aria-label="Previous">‹</button>
    <button type="button" class="pv-nav pv-next" aria-label="Next">›</button>`;
  const img = box.querySelector('img');

  // —— 左右滑动换图（放大到原始大小时不滑动，方便拖动查看）——
  let start0 = null;
  let swiped = false;
  box.onpointerdown = e => {
    if (box.classList.contains('full') || list.length < 2 || e.target.closest('button')) return;
    start0 = { x: e.clientX, y: e.clientY };
    swiped = false;
    img.style.transition = 'none';
  };
  box.onpointermove = e => {
    if (!start0) return;
    const dx = e.clientX - start0.x;
    if (Math.abs(dx) > 8) img.style.transform = `translateX(${dx}px)`;
  };
  const endDrag = e => {
    if (!start0) return;
    const dx = e.clientX - start0.x, dy = e.clientY - start0.y;
    start0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      swiped = true;
      show(index + (dx < 0 ? 1 : -1));
    } else {
      if (Math.abs(dx) > 8) swiped = true; // 拖了一点又放回：不当作点击
      img.style.transition = 'transform .15s';
      img.style.transform = '';
    }
  };
  box.onpointerup = endDrag;
  box.onpointercancel = endDrag;

  box.onclick = e => {
    if (swiped) { swiped = false; return; }
    if (e.target.closest('.pv-prev')) return show(index - 1);
    if (e.target.closest('.pv-next')) return show(index + 1);
    if (e.target.closest('.pv-edit')) {
      const id = list[index];
      openEditor(id, rec => {
        // 页面上这张照片的缩略图立即换成编辑后的（不重新渲染页面，表单里没保存的输入不会丢）
        const u = blobUrl(rec.thumb);
        document.querySelectorAll(`img[data-ph="${CSS.escape(id)}"]`).forEach(x => { x.src = u; });
        show(index);
      });
      return;
    }
    if (e.target === img) box.classList.toggle('full');
    else close();
  };
  document.body.appendChild(box);
  show(Math.max(0, list.indexOf(start)));
}

export function initPhotoViewer() {
  // 捕获阶段处理，避免点图片时触发外层卡片的跳转
  document.addEventListener('click', e => {
    const img = e.target.closest && e.target.closest('img[data-ph]');
    if (!img || box?.contains(img)) return;
    e.preventDefault();
    e.stopPropagation();
    open(groupOf(img), img.dataset.ph);
  }, true);
  document.addEventListener('keydown', e => {
    if (!box || document.querySelector('.photo-editor')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(index - 1);
    else if (e.key === 'ArrowRight') show(index + 1);
  });
  window.addEventListener('hashchange', close);
}
