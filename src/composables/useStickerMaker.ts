import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { generateImages, type ParsedImage } from "@/core/api";
import { formatTimestamp } from "@/core/fileNames";
import { buildStickerExportName, buildStickerZip, encodeStickerGifNearSizeLimit, type StickerGifResult } from "@/core/stickerAnimation";
import {
  canvasToObjectUrl,
  canvasToPreviewUrl,
  exportCanvasNearSizeLimit,
  fileToImageSource,
  parsedImageToImageSource,
  renderStickerFrame,
  type StickerBackground,
  type StickerCropMode,
  type StickerImageSource,
  type StickerStaticOptimizeResult,
  type StickerTextOverlay,
} from "@/core/stickerCanvas";
import {
  extensionForFormat,
  getStickerSpec,
  validateStickerImage,
  type StickerAssetKind,
  type StickerImageInfo,
  type StickerSpec,
  type StickerValidationResult,
} from "@/core/stickerSpecs";
import { extractVideoFrames, getVideoMetadata, isVideoFile, type StickerVideoMetadata } from "@/core/stickerVideo";
import { useConfigStore } from "@/stores/config";
import { buildStickerPrompt } from "@/core/stickerPrompts";

export type StickerFrame = {
  id: string;
  source: StickerImageSource;
  previewUrl: string;
  delayMs: number;
  sourceKind?: "image" | "video" | "ai";
  sourceLabel?: string;
};

export type StickerExportResult = {
  blob: Blob;
  previewUrl: string;
  info: StickerImageInfo;
  validation: StickerValidationResult;
  fileName: string;
  optimization?: StickerStaticOptimizeResult;
};

export function useStickerMaker() {
  const configStore = useConfigStore();
  const mode = ref<"static" | "animated">("static");
  const specKind = ref<StickerAssetKind>("static-main");
  const cropMode = ref<StickerCropMode>("contain");
  const background = ref<StickerBackground>("transparent");
  const paddingRatio = ref(0);
  const quality = ref(0.92);
  const textOverlay = ref<StickerTextOverlay>({
    enabled: false,
    text: "",
    position: "bottom",
    fontSizeRatio: 0.16,
    color: "#ffffff",
    strokeColor: "#111111",
    strokeWidthRatio: 0.018,
    maxWidthRatio: 0.86,
    offsetYRatio: 0,
    xRatio: 0.5,
    yRatio: 0.82,
    align: "center",
  });
  const defaultDelayMs = ref(120);
  const videoFrameCount = ref(10);
  const videoStartTime = ref(0);
  const videoEndTime = ref(0);
  const videoExtracting = ref(false);
  const lastVideoMeta = ref<StickerVideoMetadata | null>(null);
  const sourceMode = ref<"upload" | "video" | "ai" | null>(null);
  const promptCharacter = ref("可爱的原创卡通角色");
  const promptAction = ref("开心挥手");
  const promptText = ref("");
  const generatedImages = ref<ParsedImage[]>([]);
  const staticSource = ref<StickerImageSource | null>(null);
  const frames = ref<StickerFrame[]>([]);
  const staticExport = ref<StickerExportResult | null>(null);
  const gifExport = ref<StickerGifResult | null>(null);
  const livePreviewUrl = ref<string | null>(null);
  const livePreviewLoading = ref(false);
  const loading = ref(false);
  const exporting = ref(false);
  let previewTimer: number | null = null;
  let previewToken = 0;

  const spec = computed<StickerSpec>(() => getStickerSpec(specKind.value));
  const effectivePrompt = computed(() => buildStickerPrompt({
    character: promptCharacter.value,
    action: promptAction.value,
    text: promptText.value,
    transparent: background.value === "transparent",
  }));
  const hasSource = computed(() => Boolean(staticSource.value));
  const hasFrames = computed(() => frames.value.length > 0);

  watch([cropMode, background, paddingRatio, quality, textOverlay], () => {
    revokeExport(staticExport.value);
    staticExport.value = null;
    revokeGifExport();
  }, { deep: true });

  watch([mode, specKind, staticSource, frames, cropMode, background, paddingRatio, textOverlay], scheduleLivePreview, {
    deep: true,
    immediate: true,
  });

  function setMode(next: "static" | "animated") {
    mode.value = next;
    specKind.value = next === "animated" ? "animated-main" : "static-main";
    staticExport.value = null;
    revokeGifExport();
  }

  async function addFiles(files: File[]) {
    const videoFiles = files.filter(isVideoFile);
    const imageFiles = files.filter((file) => file.type.startsWith("image/") && !isVideoFile(file));
    if (imageFiles.length === 0 && videoFiles.length === 0) {
      ElMessage.warning("请选择图片或视频素材文件。");
      return;
    }

    if (videoFiles.length > 0 && mode.value === "static") {
      ElMessage.warning("视频素材用于动态 GIF，请先切换到「动态 GIF」模式。");
    }

    if (mode.value === "animated" && videoFiles.length > 0) {
      await addVideoFiles(videoFiles);
      return;
    }

    if (imageFiles.length > 0) {
      await addImageFiles(imageFiles);
    }
  }

  function addGeneratedImage(image: ParsedImage, index: number) {
    const source = parsedImageToImageSource(image, `generated-${index + 1}.png`);
    sourceMode.value = "ai";
    if (mode.value === "static") {
      clearSource(staticSource.value);
      staticSource.value = source;
      staticExport.value = null;
    } else {
      frames.value = [...frames.value, {
        id: crypto.randomUUID(),
        source,
        previewUrl: source.src,
        delayMs: defaultDelayMs.value,
        sourceKind: "ai",
        sourceLabel: source.name,
      }];
      revokeGifExport();
    }
  }

  async function generateCandidate() {
    if (!configStore.isValid) {
      ElMessage.error("配置有误，请先到「设置」检查。");
      return;
    }
    loading.value = true;
    generatedImages.value = [];
    try {
      generatedImages.value = await generateImages(configStore.config, effectivePrompt.value);
      ElMessage.success(`候选素材已生成，共 ${generatedImages.value.length} 张；加入后可继续裁剪和校验。`);
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : "生成失败。");
    } finally {
      loading.value = false;
    }
  }

  async function renderStatic() {
    if (!staticSource.value) {
      ElMessage.warning("请先上传或生成一张图片素材。");
      return;
    }
    exporting.value = true;
    try {
      const currentSpec = spec.value;
      const format = currentSpec.formats.find((item) => item !== "gif") ?? "png";
      const canvas = await renderStickerFrame(staticSource.value, {
        width: currentSpec.width,
        height: currentSpec.height,
        cropMode: cropMode.value,
        background: background.value,
        paddingRatio: paddingRatio.value,
        textOverlay: textOverlay.value,
      });
      const optimized = await exportCanvasNearSizeLimit(canvas, format, currentSpec.maxBytes, quality.value);
      const info: StickerImageInfo = {
        width: canvas.width,
        height: canvas.height,
        format,
        bytes: optimized.blob.size,
      };
      const validation = validateStickerImage(info, currentSpec);
      const fileName = `${formatTimestamp(new Date())}_${slugifyFileBase(staticSource.value.name, "static-sticker", 16)}.${extensionForFormat(format)}`;
      revokeExport(staticExport.value);
      staticExport.value = { blob: optimized.blob, previewUrl: canvasToPreviewUrl(canvas), info, validation, fileName, optimization: optimized };
      ElMessage.success(validation.ok ? "静态表情已按规格处理并自动优化。" : "已处理，但存在规格问题。");
    } finally {
      exporting.value = false;
    }
  }

  async function exportGif() {
    if (frames.value.length < 2) {
      ElMessage.warning("动态表情至少需要 2 帧，请上传多张图片或一段视频素材。");
      return;
    }
    exporting.value = true;
    try {
      const currentSpec = spec.value;
      const rendered = await Promise.all(frames.value.map(async (frame) => ({
        canvas: await renderStickerFrame(frame.source, {
          width: currentSpec.width,
          height: currentSpec.height,
          cropMode: cropMode.value,
          background: background.value,
          paddingRatio: paddingRatio.value,
          textOverlay: textOverlay.value,
        }),
        delayMs: frame.delayMs,
        name: frame.source.name,
      })));
      revokeGifExport();
      gifExport.value = await encodeStickerGifNearSizeLimit(rendered, currentSpec, {
        preferredColors: 256,
        targetRatio: 0.98,
        transparentAlphaThreshold: 16,
      });
      ElMessage.success(gifExport.value.validation.ok ? "GIF 已合成并自动优化。" : "GIF 已合成，但存在规格问题。");
    } finally {
      exporting.value = false;
    }
  }

  async function buildPackage(): Promise<Blob | null> {
    const files = [];
    const report: { createdAt: string; files: unknown[] } = { createdAt: new Date().toISOString(), files: [] };
    if (staticExport.value) {
      const path = `static/${staticExport.value.fileName}`;
      files.push({ path, blob: staticExport.value.blob });
      report.files.push({ path, info: staticExport.value.info, validation: staticExport.value.validation, optimization: staticExport.value.optimization });
    }
    if (gifExport.value) {
      const path = `animated/${buildStickerExportName(gifExportBaseName(), getStickerSpec("animated-main"))}`;
      files.push({ path, blob: gifExport.value.blob });
      report.files.push({ path, info: gifExport.value.info, validation: gifExport.value.validation, optimization: gifExport.value.optimization });
    }
    if (files.length === 0) {
      ElMessage.warning("请先处理静态图或合成 GIF。 ");
      return null;
    }
    return buildStickerZip(files, report);
  }

  function moveFrame(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= frames.value.length) return;
    const next = [...frames.value];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    frames.value = next;
    revokeGifExport();
  }

  function removeFrame(index: number) {
    const [removed] = frames.value.splice(index, 1);
    clearSource(removed?.source);
    revokeGifExport();
  }

  function setAllDelay(delayMs: number) {
    defaultDelayMs.value = delayMs;
    frames.value = frames.value.map((frame) => ({ ...frame, delayMs }));
    revokeGifExport();
  }

  function setFrameDelay(index: number, delayMs: number) {
    const frame = frames.value[index];
    if (!frame) return;
    frame.delayMs = delayMs;
    revokeGifExport();
  }

  function clearAll() {
    clearSource(staticSource.value);
    staticSource.value = null;
    frames.value.forEach((frame) => clearSource(frame.source));
    frames.value = [];
    generatedImages.value = [];
    sourceMode.value = null;
    lastVideoMeta.value = null;
    revokeExport(staticExport.value);
    staticExport.value = null;
    revokeGifExport();
    revokeLivePreview();
  }

  async function addImageFiles(imageFiles: File[]) {
    sourceMode.value = "upload";
    if (mode.value === "static") {
      clearSource(staticSource.value);
      staticSource.value = await fileToImageSource(imageFiles[0]);
      staticExport.value = null;
      ElMessage.success("图片素材已导入，可继续裁剪并导出。 ");
    } else {
      const next = await Promise.all(imageFiles.map(async (file) => {
        const source = await fileToImageSource(file);
        return {
          id: crypto.randomUUID(),
          source,
          previewUrl: source.src,
          delayMs: defaultDelayMs.value,
          sourceKind: "image" as const,
          sourceLabel: source.name,
        };
      }));
      frames.value = [...frames.value, ...next];
      revokeGifExport();
      ElMessage.success(`已导入 ${next.length} 张图片帧，可继续调整顺序、延迟并合成 GIF。`);
    }
  }

  async function addVideoFiles(videoFiles: File[]) {
    const file = videoFiles.find(isVideoFile);
    if (!file) return;

    videoExtracting.value = true;
    try {
      lastVideoMeta.value = await getVideoMetadata(file);
      const currentSpec = spec.value;
      const minFrames = currentSpec.minFrames ?? 2;
      const maxFrames = Math.max(minFrames, currentSpec.maxFrames ?? videoFrameCount.value);
      const requestedFrameCount = Number.isFinite(videoFrameCount.value) ? videoFrameCount.value : minFrames;
      const frameCount = Math.max(minFrames, Math.min(Math.floor(requestedFrameCount), maxFrames));
      const extracted = await extractVideoFrames(file, {
        frameCount,
        startTime: videoStartTime.value,
        endTime: videoEndTime.value > videoStartTime.value ? videoEndTime.value : undefined,
      });
      const nextFrames: StickerFrame[] = extracted.map((frame) => ({
        id: crypto.randomUUID(),
        source: frame.source,
        previewUrl: frame.source.src,
        delayMs: defaultDelayMs.value,
        sourceKind: "video" as const,
        sourceLabel: frame.source.name,
      }));

      frames.value.forEach((frame) => clearSource(frame.source));
      sourceMode.value = "video";
      frames.value = nextFrames;
      revokeGifExport();
      ElMessage.success(`已从视频提取 ${nextFrames.length} 帧，可继续调整顺序、延迟并合成 GIF。`);
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : "视频抽帧失败。 ");
    } finally {
      videoExtracting.value = false;
    }
  }

  function scheduleLivePreview() {
    if (previewTimer) window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(updateLivePreview, 160);
  }

  async function updateLivePreview() {
    const token = ++previewToken;
    const source = mode.value === "static" ? staticSource.value : frames.value[0]?.source ?? null;
    if (!source) {
      revokeLivePreview();
      livePreviewLoading.value = false;
      return;
    }

    livePreviewLoading.value = true;
    try {
      const currentSpec = spec.value;
      const canvas = await renderStickerFrame(source, {
        width: currentSpec.width,
        height: currentSpec.height,
        cropMode: cropMode.value,
        background: background.value,
        paddingRatio: paddingRatio.value,
        textOverlay: textOverlay.value,
      });
      const nextUrl = await canvasToObjectUrl(canvas);
      if (token === previewToken) {
        revokeLivePreview();
        livePreviewUrl.value = nextUrl;
      } else {
        URL.revokeObjectURL(nextUrl);
      }
    } catch {
      if (token === previewToken) revokeLivePreview();
    } finally {
      if (token === previewToken) livePreviewLoading.value = false;
    }
  }

  function revokeGifExport() {
    if (gifExport.value) URL.revokeObjectURL(gifExport.value.previewUrl);
    gifExport.value = null;
  }

  function revokeLivePreview() {
    if (livePreviewUrl.value?.startsWith("blob:")) URL.revokeObjectURL(livePreviewUrl.value);
    livePreviewUrl.value = null;
  }

  function gifExportBaseName() {
    const firstFrame = frames.value[0]?.source.name;
    return slugifyFileBase(firstFrame, "animated-sticker", 16);
  }

  return {
    mode,
    specKind,
    spec,
    cropMode,
    background,
    paddingRatio,
    quality,
    textOverlay,
    defaultDelayMs,
    videoFrameCount,
    videoStartTime,
    videoEndTime,
    videoExtracting,
    lastVideoMeta,
    sourceMode,
    promptCharacter,
    promptAction,
    promptText,
    effectivePrompt,
    generatedImages,
    staticSource,
    frames,
    staticExport,
    gifExport,
    livePreviewUrl,
    livePreviewLoading,
    loading,
    exporting,
    hasSource,
    hasFrames,
    gifExportBaseName,
    setMode,
    addFiles,
    addGeneratedImage,
    generateCandidate,
    renderStatic,
    exportGif,
    buildPackage,
    moveFrame,
    removeFrame,
    setAllDelay,
    setFrameDelay,
    clearAll,
  };
}

function clearSource(source?: StickerImageSource | null) {
  source?.revoke?.();
}

function revokeExport(result?: StickerExportResult | null) {
  if (result?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(result.previewUrl);
}

function slugifyFileBase(fileName: string | undefined, fallback: string, maxLen = 24) {
  const baseName = (fileName ?? "")
    .replace(/\.[^.]+$/u, "")
    .trim();
  const cleaned = baseName
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const result = cleaned || fallback;
  return result.length > maxLen ? result.slice(0, maxLen) : result;
}
