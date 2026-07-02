// 图片参数类型与校验逻辑（移植自参考项目 src/core/imageOptions.ts）

export type ImageQuality = "auto" | "low" | "medium" | "high";
export type ImageOutputFormat = "png" | "jpeg" | "webp";
export type ImageSizePresetCategory = "auto" | "1K" | "2K" | "4K" | "custom";

export type ImageSizePreset = {
  value: string;
  category: Exclude<ImageSizePresetCategory, "custom">;
};

export type ParsedImageSize = { width: number; height: number };
export type ImageSizeValidationResult = { error: string | null; warning: string | null };

const SIZE_MULTIPLE = 16;
const MAX_EDGE = 3840;
const MAX_ASPECT_RATIO = 3;
const MIN_TOTAL_PIXELS = 655_360;
const MAX_TOTAL_PIXELS = 8_294_400;
const HIGH_RESOLUTION_PIXELS = 2_560 * 1_440;

export const IMAGE_SIZE_PRESETS: ImageSizePreset[] = [
  { value: "auto", category: "auto" },
  { value: "864x1536", category: "1K" },
  { value: "1024x1024", category: "1K" },
  { value: "1024x1536", category: "1K" },
  { value: "1536x1024", category: "1K" },
  { value: "1536x864", category: "1K" },
  { value: "1152x2048", category: "2K" },
  { value: "1360x2048", category: "2K" },
  { value: "2048x2048", category: "2K" },
  { value: "2048x1152", category: "2K" },
  { value: "2048x1360", category: "2K" },
  { value: "2160x3840", category: "4K" },
  { value: "2304x3456", category: "4K" },
  { value: "2880x2880", category: "4K" },
  { value: "3840x2160", category: "4K" },
  { value: "3456x2304", category: "4K" },
];

const PRESET_VALUES = new Set(IMAGE_SIZE_PRESETS.map((p) => p.value));
const IMAGE_QUALITY_VALUES = new Set<ImageQuality>(["auto", "low", "medium", "high"]);
const IMAGE_OUTPUT_FORMAT_VALUES = new Set<ImageOutputFormat>(["png", "jpeg", "webp"]);

export function parseImageSize(value: string): ParsedImageSize | null {
  const match = value.trim().match(/^(\d+)x(\d+)$/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

export function isImageSizePreset(value: string): boolean {
  return PRESET_VALUES.has(value.trim());
}

export function getImageSizePresetCategory(value: string): ImageSizePresetCategory {
  const preset = IMAGE_SIZE_PRESETS.find((item) => item.value === value.trim());
  return preset?.category ?? "custom";
}

export function isImageQuality(value: string): value is ImageQuality {
  return IMAGE_QUALITY_VALUES.has(value as ImageQuality);
}

export function isImageOutputFormat(value: string): value is ImageOutputFormat {
  return IMAGE_OUTPUT_FORMAT_VALUES.has(value as ImageOutputFormat);
}

export function isCompressionFormat(value: string): value is "jpeg" | "webp" {
  return value === "jpeg" || value === "webp";
}

export function validateImageSize(value: string): ImageSizeValidationResult {
  const normalized = value.trim().toLowerCase();
  if (normalized === "auto") return { error: null, warning: null };

  const parsed = parseImageSize(normalized);
  if (!parsed) {
    return { error: "尺寸必须为 auto 或「宽x高」格式。", warning: null };
  }

  const { width, height } = parsed;
  if (width % SIZE_MULTIPLE !== 0 || height % SIZE_MULTIPLE !== 0) {
    return { error: "尺寸宽高都必须是 16 的倍数。", warning: null };
  }
  if (width > MAX_EDGE || height > MAX_EDGE) {
    return { error: "尺寸任一边不能超过 3840 像素。", warning: null };
  }
  const ratio = Math.max(width / height, height / width);
  if (ratio > MAX_ASPECT_RATIO) {
    return { error: "尺寸长宽比不能超过 3:1。", warning: null };
  }
  const totalPixels = width * height;
  if (totalPixels < MIN_TOTAL_PIXELS || totalPixels > MAX_TOTAL_PIXELS) {
    return { error: "尺寸总像素须在 655,360 ~ 8,294,400 之间。", warning: null };
  }

  return {
    error: null,
    warning:
      width * height >= HIGH_RESOLUTION_PIXELS
        ? "高分辨率尺寸生成更慢，部分供应商可能不支持。"
        : null,
  };
}
