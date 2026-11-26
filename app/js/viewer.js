// 点击图片放大：任何带 data-ph（照片 id）的图片，点一下全屏看原图。
// 点图片：在"适合屏幕"和"原始大小（可拖动查看）"之间切换；点 ✕、背景、返回键或 Esc 关闭。
import * as db from './db.js';

let box = null;

function close() {
  if (!box) return;
  const url = box.dataset.url;
  box.remove();
  box = null;
  if (url) URL.revokeObjectURL(url);
}

async function open(id) {
  const ph = await db.get('photos', id);
  if (!ph) return;
  close();
  const url = URL.createObjectURL(ph.blob || ph.thumb);
  box = document.createElement('div');
  box.className = 'photo-viewer';
  box.dataset.url = url;
  box.innerHTML = `<img src="${url}" alt=""><button type="button" class="pv-close" aria-label="Close">✕</button>`;
  box.onclick = e => {
    if (e.target.tagName === 'IMG') box.classList.toggle('full');
    else close();
  };
  document.body.appendChild(box);
}

export function initPhotoViewer() {
  // 捕获阶段处理，避免点图片时触发外层卡片的跳转
  document.addEventListener('click', e => {
    const img = e.target.closest && e.target.closest('img[data-ph]');
    if (!img || box?.contains(img)) return;
    e.preventDefault();
    e.stopPropagation();
    open(img.dataset.ph);
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  window.addEventListener('hashchange', close);
}
