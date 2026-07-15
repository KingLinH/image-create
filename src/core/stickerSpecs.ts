export type StickerAssetKind = "static-main" | "animated-main" | "thumbnail" | "cover";
export type StickerOutputFormat = "png" | "jpeg" | "webp" | "gif";
export type StickerValidationLevel = "error" | "warning";

export type StickerSpec = {
  kind: StickerAssetKind;
  label: string;
  description: string;
  width: number;
  height: number;
  formats: StickerOutputFormat[];
  maxBytes: number;
  minFrames?: number;
  maxFrames?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  requiresSquare?: boolean;
  allowTransparency?: boolean;
  sourceNote: string;
};

export type StickerValidationIssue = {
  level: StickerValidationLevel;
  message: string;
  suggestion?: string;
};

export type StickerValidationResult = {
  ok: boolean;
  issues: StickerValidationIssue[];
};

export type StickerImageInfo = {
  width: number;
  height: number;
  format: StickerOutputFormat;
  bytes: number;
};

export type StickerAnimationInfo = StickerImageInfo & {
  frameCount: number;
  delays: number[];
};

const KB = 1024;

// 规格集中放在这里，便于按微信表情开放平台最新页面更新。
// 当前默认值按常见投稿要求整理；正式投稿前请以开放平台后台/官方规范页为准。
export const STICKER_SPEC_SOURCE_NOTE = "按微信表情开放平台常见投稿要求整理；发布前请以当前官方规范复核。";

export const STICKER_SPECS: StickerSpec[] = [
  {
    kind: "static-main",
    label: "静态表情主图",
    description: "用于单个静态表情。建议主体居中、边缘留白、小尺寸下仍清晰。",
    width: 240,
    height: 240,
    formats: ["png"],
    maxBytes: 500 * KB,
    requiresSquare: true,
    allowTransparency: true,
    sourceNote: STICKER_SPEC_SOURCE_NOTE,
  },
  {
    kind: "animated-main",
    label: "动态表情主图",
    description: "用于单个动态表情。第一版导出 GIF，建议减少复杂背景与帧数以控制体积。",
    width: 240,
    height: 240,
    formats: ["gif"],
    maxBytes: 500 * KB,
    minFrames: 2,
    maxFrames: 24,
    minDelayMs: 60,
    maxDelayMs: 1000,
    requiresSquare: true,
    allowTransparency: true,
    sourceNote: STICKER_SPEC_SOURCE_NOTE,
  },
  {
    kind: "thumbnail",
    label: "表情缩略图",
    description: "用于表情列表缩略展示。通常由主图缩小导出。",
    width: 120,
    height: 120,
    formats: ["png"],
    maxBytes: 100 * KB,
    requiresSquare: true,
    allowTransparency: true,
    sourceNote: STICKER_SPEC_SOURCE_NOTE,
  },
  {
    kind: "cover",
    label: "专辑封面图",
    description: "用于表情专辑展示。可用主视觉或代表角色制作。",
    width: 750,
    height: 400,
    formats: ["png", "jpeg"],
    maxBytes: 500 * KB,
    allowTransparency: false,
    sourceNote: STICKER_SPEC_SOURCE_NOTE,
  },
];

export function getStickerSpec(kind: StickerAssetKind): StickerSpec {
  const spec = STICKER_SPECS.find((item) => item.kind === kind);
  if (!spec) throw new Error(`未知表情规格：${kind}`);
  return spec;
}

export function validateStickerImage(info: StickerImageInfo, spec: StickerSpec): StickerValidationResult {
  const issues: StickerValidationIssue[] = [];
  if (info.width !== spec.width || info.height !== spec.height) {
    issues.push({
      level: "error",
      message: `尺寸为 ${info.width}×${info.height}，目标规格为 ${spec.width}×${spec.height}。`,
      suggestion: "请使用表情工具重新裁切/缩放后导出。",
    });
  }
  if (!spec.formats.includes(info.format)) {
    issues.push({
      level: "error",
      message: `格式为 ${info.format.toUpperCase()}，允许格式：${spec.formats.map((f) => f.toUpperCase()).join(" / ")}。`,
      suggestion: "请切换导出格式。",
    });
  }
  if (info.bytes > spec.maxBytes) {
    issues.push({
      level: "error",
      message: `文件大小 ${formatFileSize(info.bytes)}，超过上限 ${formatFileSize(spec.maxBytes)}。`,
      suggestion: "请减少背景细节、改用更少颜色，或降低 JPEG/WebP 质量。",
    });
  }
  if (spec.requiresSquare && info.width !== info.height) {
    issues.push({ level: "error", message: "该规格要求正方形图片。" });
  }
  if (info.bytes > spec.maxBytes * 0.85 && info.bytes <= spec.maxBytes) {
    issues.push({
      level: "warning",
      message: `文件大小接近上限（${formatFileSize(info.bytes)} / ${formatFileSize(spec.maxBytes)}）。`,
      suggestion: "建议保留一些体积余量，避免平台二次处理后超限。",
    });
  }
  return { ok: !issues.some((issue) => issue.level === "error"), issues };
}

export function validateStickerAnimation(info: StickerAnimationInfo, spec: StickerSpec): StickerValidationResult {
  const base = validateStickerImage(info, spec);
  const issues = [...base.issues];
  if (spec.minFrames && info.frameCount < spec.minFrames) {
    issues.push({ level: "error", message: `帧数为 ${info.frameCount}，至少需要 ${spec.minFrames} 帧。` });
  }
  if (spec.maxFrames && info.frameCount > spec.maxFrames) {
    issues.push({
      level: "error",
      message: `帧数为 ${info.frameCount}，超过建议上限 ${spec.maxFrames} 帧。`,
      suggestion: "请删除相近帧或提高帧间隔。",
    });
  }
  const tooFast = spec.minDelayMs ? info.delays.some((delay) => delay < spec.minDelayMs!) : false;
  const tooSlow = spec.maxDelayMs ? info.delays.some((delay) => delay > spec.maxDelayMs!) : false;
  if (tooFast) {
    issues.push({ level: "warning", message: `存在帧延迟低于 ${spec.minDelayMs}ms，可能播放过快或体积偏大。` });
  }
  if (tooSlow) {
    issues.push({ level: "warning", message: `存在帧延迟高于 ${spec.maxDelayMs}ms，动画可能不连贯。` });
  }
  return { ok: !issues.some((issue) => issue.level === "error"), issues };
}

export function formatFileSize(bytes: number): string {
  if (bytes < KB) return `${bytes} B`;
  const mb = KB * KB;
  if (bytes < mb) return `${(bytes / KB).toFixed(bytes >= 100 * KB ? 0 : 1)} KB`;
  return `${(bytes / mb).toFixed(2)} MB`;
}

export function mimeToStickerFormat(type: string): StickerOutputFormat | null {
  if (type.includes("png")) return "png";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpeg";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  return null;
}

export function extensionForFormat(format: StickerOutputFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

export function mimeForFormat(format: StickerOutputFormat): string {
  return format === "jpeg" ? "image/jpeg" : `image/${format}`;
}
