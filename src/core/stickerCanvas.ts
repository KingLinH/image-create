import { applyPalette, quantize } from "gifenc";
import type { ParsedImage } from "./api";
import { loadImage } from "./storage";
import { mimeForFormat, type StickerOutputFormat } from "./stickerSpecs";

export type StickerCropMode = "contain" | "cover";
export type StickerBackground = "transparent" | "white" | string;
export type StickerTextOverlayPosition = "top" | "center" | "bottom";
export type StickerTextOverlayAlign = "left" | "center" | "right";

export type StickerTextOverlay = {
  enabled: boolean;
  text: string;
  position: StickerTextOverlayPosition;
  fontSizeRatio: number;
  color: string;
  strokeColor: string;
  strokeWidthRatio: number;
  maxWidthRatio: number;
  offsetYRatio: number;
  xRatio?: number;
  yRatio?: number;
  align?: StickerTextOverlayAlign;
};

export type StickerImageSource = {
  src: string;
  name: string;
  revoke?: () => void;
};

export type StickerRenderOptions = {
  width: number;
  height: number;
  cropMode: StickerCropMode;
  background: StickerBackground;
  paddingRatio: number;
  textOverlay?: StickerTextOverlay;
};

export type StickerStaticOptimizeResult = {
  blob: Blob;
  quality?: number;
  colors?: number;
  strategy: string;
  attempts: number;
  targetBytes: number;
  maxBytes: number;
};

export async function fileToImageSource(file: File): Promise<StickerImageSource> {
  const src = URL.createObjectURL(file);
  return { src, name: file.name, revoke: () => URL.revokeObjectURL(src) };
}

export function parsedImageToImageSource(image: ParsedImage, name = "generated.png"): StickerImageSource {
  if (image.base64) return { src: `data:image/png;base64,${image.base64}`, name };
  if (image.url) return { src: image.url, name };
  throw new Error("图片没有可用的数据。");
}

export async function renderStickerFrame(source: StickerImageSource, options: StickerRenderOptions): Promise<HTMLCanvasElement> {
  const img = await loadImage(source.src);
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new Error("图片尺寸无效，无法绘制表情。 ");
  }
  const canvas = document.createElement("canvas");
  canvas.width = options.width;
  canvas.height = options.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器不支持 Canvas。 ");

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (options.background !== "transparent") {
    ctx.fillStyle = options.background === "white" ? "#ffffff" : options.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const padding = Math.max(0, Math.min(0.45, options.paddingRatio));
  const innerWidth = canvas.width * (1 - padding * 2);
  const innerHeight = canvas.height * (1 - padding * 2);
  const innerX = canvas.width * padding;
  const innerY = canvas.height * padding;

  const scale = options.cropMode === "cover"
    ? Math.max(innerWidth / img.width, innerHeight / img.height)
    : Math.min(innerWidth / img.width, innerHeight / img.height);
  const drawWidth = img.width * scale;
  const drawHeight = img.height * scale;
  const drawX = innerX + (innerWidth - drawWidth) / 2;
  const drawY = innerY + (innerHeight - drawHeight) / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
  drawStickerTextOverlay(ctx, canvas, options.textOverlay);
  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: Exclude<StickerOutputFormat, "gif">,
  quality = 0.92,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.size === 0) reject(new Error("导出图片失败。"));
      else resolve(blob);
    }, mimeForFormat(format), format === "png" ? undefined : quality);
  });
}

export async function exportCanvasNearSizeLimit(
  canvas: HTMLCanvasElement,
  format: Exclude<StickerOutputFormat, "gif">,
  maxBytes: number,
  preferredQuality = 0.92,
  targetRatio = 0.98,
): Promise<StickerStaticOptimizeResult> {
  const targetBytes = Math.floor(maxBytes * targetRatio);
  if (format === "png") return exportPngNearSizeLimit(canvas, maxBytes, targetBytes);
  return exportQualityFormatNearSizeLimit(canvas, format, maxBytes, targetBytes, preferredQuality);
}

export async function canvasToFile(
  canvas: HTMLCanvasElement,
  fileName: string,
  format: Exclude<StickerOutputFormat, "gif">,
  quality = 0.92,
): Promise<File> {
  const blob = await canvasToBlob(canvas, format, quality);
  return new File([blob], fileName, { type: blob.type || mimeForFormat(format) });
}

export function canvasToPreviewUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

export async function canvasToObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await canvasToBlob(canvas, "png");
  return URL.createObjectURL(blob);
}

async function exportQualityFormatNearSizeLimit(
  canvas: HTMLCanvasElement,
  format: Exclude<StickerOutputFormat, "gif">,
  maxBytes: number,
  targetBytes: number,
  preferredQuality: number,
): Promise<StickerStaticOptimizeResult> {
  const candidates: Array<{ blob: Blob; quality: number; strategy: string }> = [];
  const preferred = clamp(preferredQuality, 0.4, 1);
  candidates.push({ blob: await canvasToBlob(canvas, format, preferred), quality: preferred, strategy: "首选质量" });

  let low = 0.2;
  let high = 1;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const quality = Number(((low + high) / 2).toFixed(3));
    const blob = await canvasToBlob(canvas, format, quality);
    candidates.push({ blob, quality, strategy: "质量二分" });
    if (blob.size > targetBytes) high = quality;
    else low = quality;
  }

  const best = chooseBestBlob(candidates, maxBytes, targetBytes) ?? candidates.reduce((smallest, item) => item.blob.size < smallest.blob.size ? item : smallest);
  return {
    blob: best.blob,
    quality: best.quality,
    strategy: best.strategy,
    attempts: candidates.length,
    targetBytes,
    maxBytes,
  };
}

async function exportPngNearSizeLimit(
  canvas: HTMLCanvasElement, maxBytes: number, targetBytes: number): Promise<StickerStaticOptimizeResult> {
  const original = await canvasToBlob(canvas, "png");
  const candidates: Array<{ blob: Blob; colors?: number; strategy: string }> = [{ blob: original, strategy: "原始 PNG" }];
  if (original.size > maxBytes || original.size < targetBytes * 0.85) {
    for (const colors of [256, 192, 128, 96, 64, 48, 32, 24, 16, 12, 8]) {
      candidates.push({ blob: await exportQuantizedPng(canvas, colors), colors, strategy: "PNG 减色" });
    }
  }

  const best = chooseBestBlob(candidates, maxBytes, targetBytes) ?? candidates.reduce((smallest, item) => item.blob.size < smallest.blob.size ? item : smallest);
  return {
    blob: best.blob,
    colors: best.colors,
    strategy: best.strategy,
    attempts: candidates.length,
    targetBytes,
    maxBytes,
  };
}

async function exportQuantizedPng(canvas: HTMLCanvasElement, colors: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器不支持 Canvas。 ");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const palette = quantize(imageData.data, colors);
  const indexed = applyPalette(imageData.data, palette);
  const quantized = new ImageData(canvas.width, canvas.height);
  for (let pixel = 0, offset = 0; offset < imageData.data.length; pixel += 1, offset += 4) {
    const color = palette[indexed[pixel]] ?? [0, 0, 0];
    quantized.data[offset] = color[0];
    quantized.data[offset + 1] = color[1];
    quantized.data[offset + 2] = color[2];
    quantized.data[offset + 3] = imageData.data[offset + 3];
  }
  const next = document.createElement("canvas");
  next.width = canvas.width;
  next.height = canvas.height;
  const nextCtx = next.getContext("2d");
  if (!nextCtx) throw new Error("浏览器不支持 Canvas。 ");
  nextCtx.putImageData(quantized, 0, 0);
  return canvasToBlob(next, "png");
}

function drawStickerTextOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  overlay?: StickerTextOverlay,
) {
  const text = overlay?.text.trim();
  if (!overlay?.enabled || !text) return;

  const base = Math.min(canvas.width, canvas.height);
  const fontSize = Math.max(10, Math.round(base * clamp(overlay.fontSizeRatio, 0.05, 0.4)));
  const safeMarginX = base * 0.06;
  const safeMarginY = base * 0.06;
  const maxWidth = Math.min(canvas.width - safeMarginX * 2, canvas.width * clamp(overlay.maxWidthRatio, 0.3, 1));
  const lineHeight = fontSize * 1.15;
  const lines = wrapText(ctx, text, maxWidth, fontSize);
  const strokeWidth = Math.max(0, base * clamp(overlay.strokeWidthRatio, 0, 0.08));
  const measuredWidth = Math.max(...lines.map((line) => ctx.measureText(line).width), 0);
  const blockWidth = Math.min(maxWidth, Math.max(fontSize, measuredWidth + strokeWidth * 2));
  const blockHeight = lines.length * lineHeight;
  const usesFreePosition = typeof overlay.xRatio === "number" && typeof overlay.yRatio === "number";
  const align = overlay.align ?? "center";
  const fallbackX = (canvas.width - blockWidth) / 2;
  const fallbackY = getTextStartY(canvas.height, blockHeight, safeMarginY, overlay.position) + base * clamp(overlay.offsetYRatio, -0.5, 0.5);
  const boxX = usesFreePosition
    ? lerpWithin(safeMarginX, canvas.width - safeMarginX - blockWidth, overlay.xRatio!, fallbackX)
    : fallbackX;
  const firstY = usesFreePosition
    ? lerpWithin(safeMarginY, canvas.height - safeMarginY - blockHeight, overlay.yRatio!, fallbackY)
    : clamp(fallbackY, safeMarginY, Math.max(safeMarginY, canvas.height - safeMarginY - blockHeight));
  const x = getTextDrawX(boxX, blockWidth, align);

  ctx.save();
  try {
    ctx.font = `800 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = usesFreePosition ? align : "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.fillStyle = overlay.color || "#ffffff";
    ctx.strokeStyle = overlay.strokeColor || "#111111";
    ctx.lineWidth = strokeWidth;

    lines.forEach((line, index) => {
      const y = firstY + lineHeight * index + lineHeight / 2;
      if (ctx.lineWidth > 0) ctx.strokeText(line, x, y, maxWidth);
      ctx.fillText(line, x, y, maxWidth);
    });
  } finally {
    ctx.restore();
  }
}

function getTextDrawX(boxX: number, blockWidth: number, align: StickerTextOverlayAlign) {
  if (align === "left") return boxX;
  if (align === "right") return boxX + blockWidth;
  return boxX + blockWidth / 2;
}

function lerpWithin(min: number, max: number, ratio: number, fallback: number) {
  if (max <= min) return fallback;
  return min + (max - min) * clamp(ratio, 0, 1);
}

function getTextStartY(height: number, blockHeight: number, margin: number, position: StickerTextOverlayPosition) {
  if (position === "top") return margin;
  if (position === "center") return (height - blockHeight) / 2;
  return height - margin - blockHeight;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, fontSize: number) {
  ctx.font = `800 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  return text
    .split(/\r?\n/)
    .flatMap((rawLine) => wrapLine(ctx, rawLine.trim(), maxWidth))
    .filter(Boolean)
    .slice(0, 4);
}

function wrapLine(ctx: CanvasRenderingContext2D, line: string, maxWidth: number) {
  if (!line) return [""];
  const tokens = line.includes(" ") ? line.split(/(\s+)/).filter(Boolean) : Array.from(line);
  const lines: string[] = [];
  let current = "";

  tokens.forEach((token) => {
    const candidate = `${current}${token}`;
    if (!current || ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      return;
    }
    lines.push(current.trim());
    current = token.trimStart();
  });

  if (current) lines.push(current.trim());
  return lines;
}

function chooseBestBlob<T extends { blob: Blob }>(candidates: T[], maxBytes: number, targetBytes: number) {
  return candidates
    .filter((item) => item.blob.size <= maxBytes)
    .sort((a, b) => Math.abs(a.blob.size - targetBytes) - Math.abs(b.blob.size - targetBytes))[0];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
