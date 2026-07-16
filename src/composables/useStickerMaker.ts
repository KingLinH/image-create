import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { generateImages, type ParsedImage } from "@/core/api";
import { formatTimestamp } from "@/core/fileNames";
import { buildStickerExportName, buildStickerZip, encodeStickerGifNearSizeLimit, type StickerGifFrame, type StickerGifResult } from "@/core/stickerAnimation";
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
import { createVideoFramePreview, extractVideoFrames, getVideoMetadata, isVideoFile, type StickerVideoMetadata } from "@/core/stickerVideo";
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

export type VideoSamplingMode = "frame-count" | "fps";
export type VideoPreset = "smooth" | "normal" | "compact";
export type VideoSamplingPlan = {
  selectedDuration: number | null;
  requestedFrameCount: number;
  compliantFrameCount: number;
  effectiveFps: number | null;
  wasClamped: boolean;
  minFrames: number;
  toolMaxFrames: number;
  recommendedMaxFrames: number;
  tip: string;
};

export type StickerProcessingStage = "idle" | "extracting-video" | "rendering-preview" | "rendering-frames" | "encoding-gif";
export type StickerProcessingProgress = {
  current: number;
  total: number;
  text: string;
};

const ANIMATED_PREVIEW_FRAME_LIMIT = 48;

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
  const defaultDelayMs = ref(83);
  const videoFrameCount = ref(30);
  const videoTargetFps = ref(12);
  const videoSamplingMode = ref<VideoSamplingMode>("fps");
  const videoStartTime = ref(0);
  const videoEndTime = ref(0);
  const videoExtracting = ref(false);
  const lastVideoFile = ref<File | null>(null);
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
  const animatedPreviewFrames = ref<string[]>([]);
  const animatedPreviewDelays = ref<number[]>([]);
  const livePreviewLoading = ref(false);
  const videoStartPreviewUrl = ref<string | null>(null);
  const videoEndPreviewUrl = ref<string | null>(null);
  const processingStage = ref<StickerProcessingStage>("idle");
  const processingProgress = ref<StickerProcessingProgress | null>(null);
  const loading = ref(false);
  const exporting = ref(false);
  let previewTimer: number | null = null;
  let videoEndpointPreviewTimer: number | null = null;
  let previewToken = 0;
  let videoEndpointPreviewToken = 0;
  let processingController: AbortController | null = null;

  const spec = computed<StickerSpec>(() => getStickerSpec(specKind.value));
  const effectivePrompt = computed(() => buildStickerPrompt({
    character: promptCharacter.value,
    action: promptAction.value,
    text: promptText.value,
    transparent: background.value === "transparent",
  }));
  const hasSource = computed(() => Boolean(staticSource.value));
  const hasFrames = computed(() => frames.value.length > 0);
  const canReextractVideo = computed(() => Boolean(lastVideoFile.value) && sourceMode.value === "video");
  const animatedPreviewPlaying = computed(() => mode.value === "animated" && animatedPreviewFrames.value.length > 1);
  const canCancelProcessing = computed(() => processingStage.value === "extracting-video" || processingStage.value === "rendering-frames" || processingStage.value === "encoding-gif");
  const videoEffectiveStartTime = computed(() => currentVideoRange()?.start ?? 0);
  const videoEffectiveEndTime = computed(() => currentVideoRange()?.end ?? 0);
  const videoSamplingPlan = computed<VideoSamplingPlan>(() => {
    const currentSpec = spec.value;
    const minFrames = currentSpec.minFrames ?? 2;
    const toolMaxFrames = Math.max(minFrames, currentSpec.toolMaxFrames ?? currentSpec.maxFrames ?? 90);
    const recommendedMaxFrames = Math.max(minFrames, currentSpec.recommendedMaxFrames ?? Math.min(48, toolMaxFrames));
    const duration = selectedVideoDuration(lastVideoMeta.value, videoStartTime.value, videoEndTime.value);
    const requestedFrameCount = videoSamplingMode.value === "fps" && duration
      ? Math.max(minFrames, Math.ceil(duration * clampNumber(videoTargetFps.value, 1, 30)))
      : Math.max(minFrames, Math.floor(Number.isFinite(videoFrameCount.value) ? videoFrameCount.value : recommendedMaxFrames));
    const compliantFrameCount = clampInt(requestedFrameCount, minFrames, toolMaxFrames);
    const effectiveFps = duration ? compliantFrameCount / duration : null;
    const wasClamped = requestedFrameCount > compliantFrameCount;
    const tip = buildVideoSamplingTip(duration, requestedFrameCount, compliantFrameCount, effectiveFps, wasClamped, toolMaxFrames, recommendedMaxFrames);
    return { selectedDuration: duration, requestedFrameCount, compliantFrameCount, effectiveFps, wasClamped, minFrames, toolMaxFrames, recommendedMaxFrames, tip };
  });

  watch([cropMode, background, paddingRatio, quality, textOverlay], () => {
    revokeExport(staticExport.value);
    staticExport.value = null;
    revokeGifExport();
  }, { deep: true });

  watch([mode, specKind, staticSource, frames, cropMode, background, paddingRatio, textOverlay], scheduleLivePreview, {
    deep: true,
    immediate: true,
  });

  watch([lastVideoFile, lastVideoMeta, videoStartTime, videoEndTime], scheduleVideoEndpointPreview);

  onBeforeUnmount(() => {
    if (previewTimer) window.clearTimeout(previewTimer);
    if (videoEndpointPreviewTimer) window.clearTimeout(videoEndpointPreviewTimer);
    cancelProcessing();
    revokeLivePreview();
    revokeVideoEndpointPreviews();
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
    clearCurrentVideo();
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
    const controller = startProcessing("rendering-frames", frames.value.length, "正在渲染 GIF 帧");
    try {
      const currentSpec = spec.value;
      const rendered: StickerGifFrame[] = [];
      for (const [index, frame] of frames.value.entries()) {
        throwIfAborted(controller.signal);
        updateProcessing("rendering-frames", index + 1, frames.value.length, `正在渲染第 ${index + 1}/${frames.value.length} 帧`);
        rendered.push({
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
        });
      }
      throwIfAborted(controller.signal);
      updateProcessing("encoding-gif", 0, 1, "正在优化 GIF");
      const nextGif = await encodeStickerGifNearSizeLimit(rendered, currentSpec, {
        preferredColors: 256,
        targetRatio: 0.98,
        transparentAlphaThreshold: 16,
        signal: controller.signal,
        onProgress: (progress) => {
          updateProcessing(
            "encoding-gif",
            progress.attempt,
            progress.totalAttempts,
            `GIF 优化尝试 ${progress.attempt}/${progress.totalAttempts}：${progress.frameCount} 帧，${progress.colors} 色`,
          );
        },
      });
      revokeGifExport();
      gifExport.value = nextGif;
      ElMessage.success(gifExport.value.validation.ok ? "GIF 已合成并自动优化。" : "GIF 已合成，但存在规格问题。");
    } catch (error) {
      if (isAbortError(error)) {
        ElMessage.info("GIF 处理已取消。");
      } else {
        throw error;
      }
    } finally {
      exporting.value = false;
      finishProcessing(controller);
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
    clearCurrentVideo();
    revokeExport(staticExport.value);
    staticExport.value = null;
    revokeGifExport();
    revokeLivePreview();
  }

  async function addImageFiles(imageFiles: File[]) {
    clearCurrentVideo();
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

    lastVideoFile.value = file;
    await extractFramesFromVideoFile(file, { refreshMeta: true });
  }

  async function reextractCurrentVideo() {
    if (!lastVideoFile.value) {
      ElMessage.warning("请先上传视频素材。");
      return;
    }
    await extractFramesFromVideoFile(lastVideoFile.value, { refreshMeta: false });
  }

  async function extractFramesFromVideoFile(file: File, options: { refreshMeta: boolean }) {
    videoExtracting.value = true;
    const controller = startProcessing("extracting-video", 1, "正在读取视频信息");
    let extractedSources: StickerFrame[] = [];
    try {
      if (options.refreshMeta || !lastVideoMeta.value) {
        lastVideoMeta.value = await getVideoMetadata(file);
        const nextRange = normalizeVideoRange(videoStartTime.value, videoEndTime.value, lastVideoMeta.value);
        videoStartTime.value = nextRange.start;
        videoEndTime.value = nextRange.end;
      }
      const range = currentVideoRange();
      const plan = videoSamplingPlan.value;
      updateProcessing("extracting-video", 0, plan.compliantFrameCount, "正在抽取视频帧");
      const extracted = await extractVideoFrames(file, {
        frameCount: plan.compliantFrameCount,
        startTime: range?.start ?? videoStartTime.value,
        endTime: range?.end ?? videoEndTime.value,
      }, {
        signal: controller.signal,
        onProgress: (done, total, time) => {
          updateProcessing("extracting-video", done, total, `已抽取 ${done}/${total} 帧 @ ${time.toFixed(2)}s`);
        },
      });
      const nextFrames: StickerFrame[] = extracted.map((frame) => ({
        id: crypto.randomUUID(),
        source: frame.source,
        previewUrl: frame.source.src,
        delayMs: defaultDelayMs.value,
        sourceKind: "video" as const,
        sourceLabel: frame.source.name,
      }));
      extractedSources = nextFrames;

      frames.value.forEach((frame) => clearSource(frame.source));
      sourceMode.value = "video";
      frames.value = nextFrames;
      extractedSources = [];
      revokeGifExport();
      if (plan.wasClamped) {
        ElMessage.warning(`当前设置约需 ${plan.requestedFrameCount} 帧，已按工具上限 ${plan.toolMaxFrames} 帧抽取以避免浏览器卡顿和体积过大。`);
      } else if (plan.effectiveFps !== null && plan.effectiveFps < 8) {
        ElMessage.warning(`已从视频提取 ${nextFrames.length} 帧；当前有效约 ${plan.effectiveFps.toFixed(1)}fps，动作可能不连贯，建议缩短截取范围。`);
      } else {
        ElMessage.success(`已按当前设置提取 ${nextFrames.length} 帧，约 ${plan.effectiveFps?.toFixed(1) ?? "-"}fps，可直接合成 GIF 或继续微调。`);
      }
    } catch (error) {
      extractedSources.forEach((frame) => clearSource(frame.source));
      if (isAbortError(error)) {
        ElMessage.info("视频抽帧已取消。");
      } else {
      ElMessage.error(error instanceof Error ? error.message : "视频抽帧失败。 ");
      }
    } finally {
      videoExtracting.value = false;
      finishProcessing(controller);
    }
  }

  function clearCurrentVideo() {
    lastVideoFile.value = null;
    lastVideoMeta.value = null;
    revokeVideoEndpointPreviews();
  }

  function setVideoRange(range: [number, number]) {
    const nextRange = normalizeVideoRange(range[0], range[1], lastVideoMeta.value);
    videoStartTime.value = nextRange.start;
    videoEndTime.value = nextRange.end;
  }

  function currentVideoRange() {
    if (!lastVideoMeta.value) return null;
    return normalizeVideoRange(videoStartTime.value, videoEndTime.value, lastVideoMeta.value);
  }

  function scheduleVideoEndpointPreview() {
    if (videoEndpointPreviewTimer) window.clearTimeout(videoEndpointPreviewTimer);
    videoEndpointPreviewTimer = window.setTimeout(updateVideoEndpointPreview, 180);
  }

  async function updateVideoEndpointPreview() {
    const token = ++videoEndpointPreviewToken;
    const file = lastVideoFile.value;
    const range = currentVideoRange();
    if (!file || !range) {
      revokeVideoEndpointPreviews();
      return;
    }

    try {
      const [startPreview, endPreview] = await Promise.all([
        createVideoFramePreview(file, range.start),
        createVideoFramePreview(file, range.end),
      ]);
      if (token === videoEndpointPreviewToken) {
        revokeVideoEndpointPreviews();
        videoStartPreviewUrl.value = startPreview.src;
        videoEndPreviewUrl.value = endPreview.src;
      } else {
        clearSource(startPreview);
        clearSource(endPreview);
      }
    } catch {
      if (token === videoEndpointPreviewToken) revokeVideoEndpointPreviews();
    }
  }

  function revokeVideoEndpointPreviews() {
    if (videoStartPreviewUrl.value?.startsWith("blob:")) URL.revokeObjectURL(videoStartPreviewUrl.value);
    if (videoEndPreviewUrl.value?.startsWith("blob:")) URL.revokeObjectURL(videoEndPreviewUrl.value);
    videoStartPreviewUrl.value = null;
    videoEndPreviewUrl.value = null;
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
      if (mode.value === "animated") {
        const previewFrames = frames.value.slice(0, ANIMATED_PREVIEW_FRAME_LIMIT);
        const urls: string[] = [];
        for (const frame of previewFrames) {
          const canvas = await renderStickerFrame(frame.source, {
            width: currentSpec.width,
            height: currentSpec.height,
            cropMode: cropMode.value,
            background: background.value,
            paddingRatio: paddingRatio.value,
            textOverlay: textOverlay.value,
          });
          urls.push(await canvasToObjectUrl(canvas));
          if (token !== previewToken) break;
        }
        if (token === previewToken) {
          revokeLivePreview();
          animatedPreviewFrames.value = urls;
          animatedPreviewDelays.value = previewFrames.map((frame) => frame.delayMs);
        } else {
          urls.forEach((url) => URL.revokeObjectURL(url));
        }
        return;
      }
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
        animatedPreviewFrames.value = [];
        animatedPreviewDelays.value = [];
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
    revokeAnimatedPreview();
  }

  function revokeAnimatedPreview() {
    animatedPreviewFrames.value.forEach((url) => {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    });
    animatedPreviewFrames.value = [];
    animatedPreviewDelays.value = [];
  }

  function gifExportBaseName() {
    const firstFrame = frames.value[0]?.source.name;
    return slugifyFileBase(firstFrame, "animated-sticker", 16);
  }

  function applyVideoPreset(preset: VideoPreset) {
    if (preset === "smooth") {
      videoSamplingMode.value = "fps";
      videoTargetFps.value = 15;
      videoFrameCount.value = 36;
      setAllDelay(67);
      return;
    }
    if (preset === "normal") {
      videoSamplingMode.value = "fps";
      videoTargetFps.value = 12;
      videoFrameCount.value = 30;
      setAllDelay(83);
      return;
    }
    videoSamplingMode.value = "frame-count";
    videoFrameCount.value = 18;
    setAllDelay(120);
  }

  function startProcessing(stage: StickerProcessingStage, total: number, text: string) {
    processingController?.abort();
    const controller = new AbortController();
    processingController = controller;
    updateProcessing(stage, 0, total, text);
    return controller;
  }

  function updateProcessing(stage: StickerProcessingStage, current: number, total: number, text: string) {
    processingStage.value = stage;
    processingProgress.value = { current, total: Math.max(1, total), text };
  }

  function finishProcessing(controller: AbortController) {
    if (processingController !== controller) return;
    processingController = null;
    processingStage.value = "idle";
    processingProgress.value = null;
  }

  function cancelProcessing() {
    processingController?.abort();
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
    videoTargetFps,
    videoSamplingMode,
    videoSamplingPlan,
    videoStartTime,
    videoEndTime,
    videoEffectiveStartTime,
    videoEffectiveEndTime,
    videoExtracting,
    videoStartPreviewUrl,
    videoEndPreviewUrl,
    lastVideoMeta,
    canReextractVideo,
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
    animatedPreviewFrames,
    animatedPreviewDelays,
    animatedPreviewPlaying,
    livePreviewLoading,
    processingStage,
    processingProgress,
    canCancelProcessing,
    loading,
    exporting,
    hasSource,
    hasFrames,
    gifExportBaseName,
    applyVideoPreset,
    setVideoRange,
    cancelProcessing,
    reextractCurrentVideo,
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

function selectedVideoDuration(meta: StickerVideoMetadata | null, startValue: number, endValue: number) {
  if (!meta?.duration) return null;
  const { start, end } = normalizeVideoRange(startValue, endValue, meta);
  return Math.max(0.01, end - start);
}

function normalizeVideoRange(startValue: number, endValue: number, meta: StickerVideoMetadata | null) {
  const duration = Math.max(0.01, meta?.duration ?? 0.01);
  const start = clampNumber(startValue, 0, Math.max(0, duration - 0.01));
  const fallbackEnd = Math.min(duration, start + 2.5);
  const rawEnd = endValue > start ? endValue : fallbackEnd;
  const end = clampNumber(rawEnd, Math.min(duration, start + 0.01), duration);
  return { start, end };
}

function buildVideoSamplingTip(
  duration: number | null,
  requestedFrameCount: number,
  compliantFrameCount: number,
  effectiveFps: number | null,
  wasClamped: boolean,
  toolMaxFrames: number,
  recommendedMaxFrames: number,
) {
  if (!duration) return `默认会自动截取约 2.5 秒关键片段并按 12fps 抽帧；普通动态 GIF 主要校验 240×240 和 500KB。`;
  if (wasClamped) {
    return `当前设置约需 ${requestedFrameCount} 帧，工具会按 ${toolMaxFrames} 帧抽取以保护浏览器性能；如需更流畅，建议缩短片段。`;
  }
  if (compliantFrameCount > recommendedMaxFrames) {
    return `预计抽取 ${compliantFrameCount} 帧，动作更完整但更难压到 500KB；导出时会自动降色并在必要时抽样。`;
  }
  if (effectiveFps !== null && effectiveFps < 8) {
    return `当前有效约 ${effectiveFps.toFixed(1)}fps，动作可能偏跳；缩短截取范围会更流畅。`;
  }
  return `当前片段约 ${duration.toFixed(1)} 秒，预计抽取 ${compliantFrameCount} 帧，约 ${effectiveFps?.toFixed(1) ?? "-"}fps。`;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw new DOMException("Operation cancelled", "AbortError");
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
