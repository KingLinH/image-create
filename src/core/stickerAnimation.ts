import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { zipSync, strToU8 } from "fflate";
import { extensionForFormat, validateStickerAnimation, type StickerAnimationInfo, type StickerSpec, type StickerValidationResult } from "./stickerSpecs";

export type StickerGifFrame = {
  canvas: HTMLCanvasElement;
  delayMs: number;
  name?: string;
};

export type StickerOptimizationInfo = {
  targetBytes: number;
  maxBytes: number;
  colors?: number;
  originalFrameCount?: number;
  outputFrameCount?: number;
  attempts: number;
  strategy: string;
};

export type StickerGifResult = {
  blob: Blob;
  previewUrl: string;
  info: StickerAnimationInfo;
  validation: StickerValidationResult;
  optimization?: StickerOptimizationInfo;
};

export type StickerGifEncodeOptions = {
  maxColors?: number;
  transparentAlphaThreshold?: number;
  optimization?: StickerOptimizationInfo;
  signal?: AbortSignal;
};

export type StickerGifOptimizeProgress = {
  attempt: number;
  totalAttempts: number;
  colors: number;
  frameCount: number;
  strategy: string;
};

export type StickerGifOptimizeOptions = {
  preferredColors?: number;
  minColors?: number;
  targetRatio?: number;
  transparentAlphaThreshold?: number;
  allowFrameDropping?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: StickerGifOptimizeProgress) => void;
};

export type StickerPackageFile = {
  path: string;
  blob: Blob;
};

export async function encodeStickerGif(
  frames: StickerGifFrame[],
  spec: StickerSpec,
  options: StickerGifEncodeOptions = {},
): Promise<StickerGifResult> {
  if (frames.length === 0) throw new Error("请先添加动态帧。");
  const width = spec.width;
  const height = spec.height;
  const encoder = GIFEncoder();
  const maxColors = clampInt(options.maxColors ?? 256, 2, 256);
  const transparentAlphaThreshold = clampInt(options.transparentAlphaThreshold ?? 16, 0, 255);

  for (const frame of frames) {
    throwIfAborted(options.signal);
    if (frame.canvas.width !== width || frame.canvas.height !== height) {
      throw new Error(`动态帧尺寸必须统一为 ${width}×${height}。`);
    }
    const ctx = frame.canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器不支持 Canvas。 ");
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const encoded = encodeIndexedFrame(rgba, maxColors, transparentAlphaThreshold);
    const writeOptions: Record<string, unknown> = {
      palette: encoded.palette,
      delay: Math.max(20, Math.round(frame.delayMs)),
    };
    if (typeof encoded.transparentIndex === "number") {
      writeOptions.transparent = encoded.transparentIndex;
    }
    encoder.writeFrame(encoded.indexed, width, height, writeOptions);
  }

  throwIfAborted(options.signal);
  encoder.finish();
  const blob = new Blob([encoder.bytes()], { type: "image/gif" });
  const info: StickerAnimationInfo = {
    width,
    height,
    format: "gif",
    bytes: blob.size,
    frameCount: frames.length,
    delays: frames.map((frame) => frame.delayMs),
  };
  const validation = validateStickerAnimation(info, spec);
  return { blob, previewUrl: URL.createObjectURL(blob), info, validation, optimization: options.optimization };
}

export async function encodeStickerGifNearSizeLimit(
  frames: StickerGifFrame[],
  spec: StickerSpec,
  options: StickerGifOptimizeOptions = {},
): Promise<StickerGifResult> {
  const targetBytes = Math.floor(spec.maxBytes * (options.targetRatio ?? 0.98));
  const preferredColors = clampInt(options.preferredColors ?? 256, 2, 256);
  const minColors = clampInt(options.minColors ?? 8, 2, preferredColors);
  const colorCandidates = uniqueNumbers([preferredColors, 256, 192, 160, 128, 96, 64, 48, 32, 24, 16, 12, 8, 6, 4])
    .filter((colors) => colors <= preferredColors && colors >= minColors);
  const frameSets = buildFrameCandidates(frames, spec, options.allowFrameDropping ?? true);
  const totalAttempts = Math.max(1, frameSets.length * colorCandidates.length);
  let attempts = 0;
  const results: StickerGifResult[] = [];

  for (const frameSet of frameSets) {
    for (const colors of colorCandidates) {
      throwIfAborted(options.signal);
      attempts += 1;
      options.onProgress?.({
        attempt: attempts,
        totalAttempts,
        colors,
        frameCount: frameSet.frames.length,
        strategy: frameSet.strategy,
      });
      const result = await encodeStickerGif(frameSet.frames, spec, {
        maxColors: colors,
        transparentAlphaThreshold: options.transparentAlphaThreshold,
        signal: options.signal,
        optimization: {
          targetBytes,
          maxBytes: spec.maxBytes,
          colors,
          originalFrameCount: frames.length,
          outputFrameCount: frameSet.frames.length,
          attempts,
          strategy: frameSet.strategy,
        },
      });
      results.push(result);

      if (result.blob.size <= spec.maxBytes && result.blob.size >= targetBytes) {
        revokeUnusedGifResults(results, result);
        return withAttempts(result, attempts);
      }
    }
  }

  const underLimit = results.filter((result) => result.blob.size <= spec.maxBytes);
  const best = underLimit.length > 0
    ? underLimit.sort((a, b) => Math.abs(a.blob.size - targetBytes) - Math.abs(b.blob.size - targetBytes))[0]
    : results.sort((a, b) => a.blob.size - b.blob.size)[0];
  revokeUnusedGifResults(results, best);
  return withAttempts(best, attempts);
}

export async function buildStickerZip(
  files: StickerPackageFile[],
  report: unknown,
  reportPath = "validation-report.json",
): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    entries[file.path] = new Uint8Array(await file.blob.arrayBuffer());
  }
  entries[reportPath] = strToU8(JSON.stringify(report, null, 2));
  return new Blob([zipSync(entries)], { type: "application/zip" });
}

export function buildStickerExportName(baseName: string, spec: StickerSpec, index?: number): string {
  const safe = baseName.trim().replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || spec.kind;
  const suffix = typeof index === "number" ? `-${String(index + 1).padStart(2, "0")}` : "";
  return `${safe}${suffix}.${extensionForFormat(spec.formats[0])}`;
}

function encodeIndexedFrame(rgba: Uint8ClampedArray, maxColors: number, transparentAlphaThreshold: number) {
  const hasTransparent = hasTransparentPixels(rgba, transparentAlphaThreshold);
  if (!hasTransparent) {
    const palette = quantize(rgba, maxColors);
    return { palette, indexed: applyPalette(rgba, palette) };
  }

  const transparentIndex = 0;
  const opaque = new Uint8ClampedArray(countOpaquePixels(rgba, transparentAlphaThreshold) * 4);
  let opaqueOffset = 0;
  for (let offset = 0; offset < rgba.length; offset += 4) {
    if (rgba[offset + 3] < transparentAlphaThreshold) continue;
    opaque[opaqueOffset] = rgba[offset];
    opaque[opaqueOffset + 1] = rgba[offset + 1];
    opaque[opaqueOffset + 2] = rgba[offset + 2];
    opaque[opaqueOffset + 3] = 255;
    opaqueOffset += 4;
  }

  const colorPalette = opaque.length > 0 ? quantize(opaque, Math.max(1, maxColors - 1)) : [];
  const opaqueIndexed = opaque.length > 0 ? applyPalette(opaque, colorPalette) : new Uint8Array();
  const indexed = new Uint8Array(rgba.length / 4);
  let opaqueIndex = 0;
  for (let pixel = 0, offset = 0; offset < rgba.length; pixel += 1, offset += 4) {
    if (rgba[offset + 3] < transparentAlphaThreshold) {
      indexed[pixel] = transparentIndex;
    } else {
      indexed[pixel] = opaqueIndexed[opaqueIndex] + 1;
      opaqueIndex += 1;
    }
  }

  return { palette: [[0, 0, 0], ...colorPalette], indexed, transparentIndex };
}

function hasTransparentPixels(rgba: Uint8ClampedArray, threshold: number) {
  for (let offset = 3; offset < rgba.length; offset += 4) {
    if (rgba[offset] < threshold) return true;
  }
  return false;
}

function countOpaquePixels(rgba: Uint8ClampedArray, threshold: number) {
  let count = 0;
  for (let offset = 3; offset < rgba.length; offset += 4) {
    if (rgba[offset] >= threshold) count += 1;
  }
  return count;
}

function buildFrameCandidates(frames: StickerGifFrame[], spec: StickerSpec, allowFrameDropping: boolean) {
  const minFrames = spec.minFrames ?? 2;
  const candidates = [{ frames, strategy: "原帧数调色" }];
  if (!allowFrameDropping || frames.length <= minFrames) return candidates;

  uniqueNumbers([Math.ceil(frames.length * 0.75), Math.ceil(frames.length * 0.5), Math.ceil(frames.length * 0.35), Math.ceil(frames.length * 0.25), minFrames])
    .filter((count) => count >= minFrames && count < frames.length)
    .forEach((count) => candidates.push({ frames: sampleFramesWithMergedDelay(frames, count), strategy: `为控制 500KB 体积均匀保留 ${count} 帧并合并延迟` }));
  return candidates;
}

function sampleFramesWithMergedDelay(frames: StickerGifFrame[], targetCount: number) {
  const buckets: StickerGifFrame[] = [];
  for (let index = 0; index < targetCount; index += 1) {
    const start = Math.floor((frames.length * index) / targetCount);
    const end = Math.floor((frames.length * (index + 1)) / targetCount);
    const group = frames.slice(start, Math.max(start + 1, end));
    buckets.push({
      ...group[0],
      delayMs: group.reduce((sum, frame) => sum + frame.delayMs, 0),
    });
  }
  return buckets;
}

function withAttempts(result: StickerGifResult, attempts: number) {
  if (result.optimization) result.optimization.attempts = attempts;
  return result;
}

function revokeUnusedGifResults(results: StickerGifResult[], keep: StickerGifResult) {
  results.forEach((result) => {
    if (result !== keep) URL.revokeObjectURL(result.previewUrl);
  });
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values.map((value) => Math.round(value))));
}

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw new DOMException("Operation cancelled", "AbortError");
}
