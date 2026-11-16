// 照片处理：读取拍摄时间（EXIF）、压缩原图、生成缩略图。

const FULL_EDGE = 1600;
const THUMB_EDGE = 320;

async function readTakenAt(file) {
  try {
    if (window.exifr) {
      const data = await window.exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
      const d = data && (data.DateTimeOriginal || data.CreateDate);
      if (d instanceof Date && !isNaN(d)) return d.toISOString();
    }
  } catch { /* 没有 EXIF 时忽略 */ }
  return null;
}

async function loadBitmap(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* 回退 */ }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function resize(bitmap, maxEdge, quality) {
  const w = bitmap.width, h = bitmap.height;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * 处理一张照片文件。
 * @returns {Promise<{blob: Blob, thumb: Blob, takenAt: string|null}>}
 */
export async function processPhoto(file) {
  const takenAt = await readTakenAt(file);
  const bitmap = await loadBitmap(file);
  const blob = await resize(bitmap, FULL_EDGE, 0.82);
  const thumb = await resize(bitmap, THUMB_EDGE, 0.75);
  if (bitmap.close) bitmap.close();
  return { blob, thumb, takenAt };
}
