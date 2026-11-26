// 点击图片放大：任何带 data-ph（照片 id）的图片，点一下全屏看原图。
// 点图片：在"适合屏幕"和"原始大小（可拖动查看）"之间切换；点 ✕、背景、返回键或 Esc 关闭。
// 左上角铅笔：编辑（裁剪、旋转、画箭头/圆圈、加文字）。
import * as db from './db.js';
import { openEditor } from './editor.js';
import { ICONS, blobUrl } from './ui.js';

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
  box.innerHTML = `<img src="${url}" alt=""><button type="button" class="pv-edit" aria-label="Edit">${ICONS.edit}</button><button type="button" class="pv-close" aria-label="Close">✕</button>`;
  box.onclick = e => {
    if (e.target.closest('.pv-edit')) {
      openEditor(id, rec => {
        // 页面上这张照片的缩略图立即换成编辑后的（不重新渲染页面，表单里没保存的输入不会丢）
        const u = blobUrl(rec.thumb);
        document.querySelectorAll(`img[data-ph="${CSS.escape(id)}"]`).forEach(img => { img.src = u; });
        open(id);
      });
      return;
    }
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
