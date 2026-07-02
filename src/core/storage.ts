// 本地存储 / 图片下载 / 缩略图 / 目录授权（移植并简化）

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // 通常是 localStorage 配额超限（缩略图太多）。
    console.warn("写入本地存储失败：", error);
  }
}

const THUMBNAIL_MAX_EDGE = 256;
const THUMBNAIL_QUALITY = 0.6;

// 把 base64/URL 图片缩放为 jpeg 缩略图 data URL，用于历史预览。
export async function makeThumbnail(source: { base64?: string; url?: string }): Promise<string | undefined> {
  const src = source.base64 ? `data:image/png;base64,${source.base64}` : source.url;
  if (!src) return undefined;

  try {
    const img = await loadImage(src);
    const scale = Math.min(1, THUMBNAIL_MAX_EDGE / Math.max(img.width, img.height));
    if (scale >= 1) return src; // 已经够小，直接返回原图
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", THUMBNAIL_QUALITY);
  } catch {
    return undefined;
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片加载失败。"));
    img.src = src;
  });
}

// 参考图智能压缩：缩到最长边 ≤ maxEdge、转 JPEG q=quality；已足够小则原样返回。
// 用于图生图上传，降低大图 ERR_FAILED 概率，基本不影响生成质量。
export async function compressImage(file: File, maxEdge = 1280, quality = 0.85): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const SMALL = 4 * 1024 * 1024;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    // 已经足够小且无需缩小：原样返回，避免无谓重编码。
    if (scale >= 1 && file.size < SMALL) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) return file;
    const name = file.name.replace(/\.(png|jpe?g|webp|bmp|gif)$/i, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file; // 任何异常 fallback 原图，不阻断上传
  } finally {
    URL.revokeObjectURL(url);
  }
}

// File → 纯 base64（不含 data: 前缀）。
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const i = result.indexOf(",");
      resolve(i >= 0 ? result.slice(i + 1) : result);
    };
    reader.onerror = () => reject(new Error("读取文件失败。"));
    reader.readAsDataURL(file);
  });
}

// 纯 base64 → File（默认 image/jpeg）。
export function base64ToFile(base64: string, name: string, type = "image/jpeg"): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type });
}

// 触发浏览器下载。base64 或远程 url 均可。
export async function downloadImage(
  source: { base64?: string; url?: string },
  fileName: string,
  format: string,
): Promise<void> {
  const href = source.base64
    ? `data:image/${format};base64,${source.base64}`
    : source.url;
  if (!href) throw new Error("没有可下载的图片。");

  const blob = await (source.base64 ? base64ToBlob(source.base64, format) : fetchUrlToBlob(source.url!));
  triggerBlobDownload(blob, fileName);
}

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function base64ToBlob(base64: string, format: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: `image/${format}` });
    if (blob.size === 0) reject(new Error("图片数据为空。"));
    else resolve(blob);
  });
}

async function fetchUrlToBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载图片失败，状态码 ${response.status}。`);
  return response.blob();
}

// ---- 可选：File System Access API，保存到用户授权的目录 ----

let directoryHandle: FileSystemDirectoryHandle | null = null;

export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export async function pickOutputDirectory(): Promise<string | null> {
  if (!supportsDirectoryPicker()) return null;
  try {
    directoryHandle = await window.showDirectoryPicker!({ mode: "readwrite" });
    return directoryHandle.name;
  } catch {
    return null; // 用户取消
  }
}

export async function saveImageToDirectory(
  source: { base64?: string; url?: string },
  fileName: string,
  format: string,
): Promise<string | null> {
  if (!directoryHandle) return null;
  const blob = source.base64
    ? await base64ToBlob(source.base64, format)
    : await fetchUrlToBlob(source.url!);
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return `${directoryHandle.name}/${fileName}`;
}
