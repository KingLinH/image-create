<script setup lang="ts">
defineOptions({ name: "StickerView" });
import { computed } from "vue";
import { ElMessage } from "element-plus";
import { useStickerMaker } from "@/composables/useStickerMaker";
import { triggerBlobDownload } from "@/core/storage";
import { buildStickerExportName } from "@/core/stickerAnimation";
import { formatTimestamp } from "@/core/fileNames";
import { getStickerSpec, type StickerValidationResult } from "@/core/stickerSpecs";
import StickerCanvasEditor from "@/components/sticker/StickerCanvasEditor.vue";
import StickerExportPanel from "@/components/sticker/StickerExportPanel.vue";
import StickerFrameList from "@/components/sticker/StickerFrameList.vue";
import StickerSourcePanel from "@/components/sticker/StickerSourcePanel.vue";
import StickerSpecSelector from "@/components/sticker/StickerSpecSelector.vue";
import StickerValidationPanel from "@/components/sticker/StickerValidationPanel.vue";

const maker = useStickerMaker();

const currentValidation = computed(() => {
  if (maker.mode.value === "animated") return maker.gifExport.value?.validation ?? null;
  return maker.staticExport.value?.validation ?? null;
});

const livePreviewList = computed(() => maker.livePreviewUrl.value ? [maker.livePreviewUrl.value] : []);
const gifExportFileName = computed(() => buildStickerExportName(maker.gifExportBaseName(), getStickerSpec("animated-main")));
const hasInvalidExport = computed(() => Boolean(
  maker.staticExport.value && !maker.staticExport.value.validation.ok
  || maker.gifExport.value && !maker.gifExport.value.validation.ok,
));

function warnInvalidDownload(validation: StickerValidationResult) {
  if (validation.ok) return false;
  const errors = validation.issues.filter((issue) => issue.level === "error");
  ElMessage.error(errors[0]?.message ?? "当前结果不符合投稿规格，请调整素材后重新处理。 ");
  return true;
}

function downloadStaticSticker() {
  const result = maker.staticExport.value;
  if (!result) {
    ElMessage.warning("请先处理静态表情。");
    return;
  }
  if (warnInvalidDownload(result.validation)) return;
  triggerBlobDownload(result.blob, result.fileName);
  ElMessage.success("静态表情已开始下载。");
}

function downloadGifSticker() {
  const result = maker.gifExport.value;
  if (!result) {
    ElMessage.warning("请先合成 GIF。");
    return;
  }
  if (warnInvalidDownload(result.validation)) return;
  triggerBlobDownload(result.blob, gifExportFileName.value);
  ElMessage.success("GIF 表情已开始下载。");
}

async function downloadZip() {
  if (hasInvalidExport.value) {
    ElMessage.error("当前存在不符合规格的表情，请按校验提示调整后重新处理/合成。 ");
    return;
  }
  const blob = await maker.buildPackage();
  if (!blob) return;
  triggerBlobDownload(blob, `${formatTimestamp(new Date())}_wechat-stickers.zip`);
  ElMessage.success("投稿 ZIP 已生成。请按微信官方后台要求复核后上传。");
}
</script>

<template>
  <div class="sticker-page">
    <main class="sticker-main">
      <div class="panel hero-panel">
      <div>
        <p class="panel-title">微信表情包制作</p>
        <p class="muted">
          上传自己的图片或视频素材，工具会帮你裁剪、适配、校验并导出微信表情投稿文件；AI 生成仅作为可选素材来源。
        </p>
      </div>
      <el-radio-group :model-value="maker.mode.value" @update:model-value="maker.setMode($event as 'static' | 'animated')">
        <el-radio-button value="static">静态表情</el-radio-button>
        <el-radio-button value="animated">动态 GIF</el-radio-button>
      </el-radio-group>
    </div>

    <div class="panel">
      <p class="panel-title">1. 上传/导入素材</p>
      <StickerSourcePanel
        :mode="maker.mode.value"
        :action-prompt="maker.promptAction.value"
        :loading="maker.loading.value"
        :video-extracting="maker.videoExtracting.value"
        :video-frame-count="maker.videoFrameCount.value"
        :video-start-time="maker.videoStartTime.value"
        :video-end-time="maker.videoEndTime.value"
        :default-delay="maker.defaultDelayMs.value"
        :max-frames="maker.spec.value.maxFrames"
        :last-video-meta="maker.lastVideoMeta.value"
        @update-action-prompt="maker.promptAction.value = $event"
        @update-video-frame-count="maker.videoFrameCount.value = $event"
        @update-video-start-time="maker.videoStartTime.value = $event"
        @update-video-end-time="maker.videoEndTime.value = $event"
        @update-default-delay="maker.setAllDelay"
        @upload="maker.addFiles"
        @generate="maker.generateCandidate"
      />
      <div v-if="maker.generatedImages.value.length" class="candidate-grid">
        <div v-for="(image, i) in maker.generatedImages.value" :key="i" class="candidate-card">
          <el-image
            class="candidate-img"
            :src="image.base64 ? `data:image/png;base64,${image.base64}` : image.url"
            fit="cover"
            :preview-src-list="maker.generatedImages.value.map((item) => item.base64 ? `data:image/png;base64,${item.base64}` : item.url!)"
            preview-teleported
          />
          <el-button link type="primary" @click="maker.addGeneratedImage(image, i)">
            加入{{ maker.mode.value === "animated" ? "帧列表" : "静态制作" }}
          </el-button>
        </div>
      </div>
    </div>

    <div class="panel">
      <p class="panel-title">2. 选择投稿规格</p>
      <StickerSpecSelector v-model="maker.specKind.value" />
      <el-alert class="spec-note" type="warning" :closable="false" show-icon :title="maker.spec.value.sourceNote" />
    </div>

    <div class="panel">
      <p class="panel-title">3. 裁剪与画布调整</p>
      <StickerCanvasEditor
        v-model:crop-mode="maker.cropMode.value"
        v-model:background="maker.background.value"
        v-model:padding-ratio="maker.paddingRatio.value"
        v-model:quality="maker.quality.value"
        v-model:text-overlay="maker.textOverlay.value"
        :target-width="maker.spec.value.width"
        :target-height="maker.spec.value.height"
        :formats="maker.spec.value.formats"
      />
    </div>

    <div v-if="maker.mode.value === 'animated'" class="panel">
      <p class="panel-title">4. 动态帧管理</p>
      <StickerFrameList
        :frames="maker.frames.value"
        :default-delay="maker.defaultDelayMs.value"
        @move="maker.moveFrame"
        @remove="maker.removeFrame"
        @delay="maker.setFrameDelay"
        @all-delay="maker.setAllDelay"
      />
    </div>

    <div class="panel">
      <p class="panel-title">{{ maker.mode.value === 'animated' ? '5' : '4' }}. 校验与导出</p>
      <StickerExportPanel
        :mode="maker.mode.value"
        :has-source="maker.hasSource.value"
        :has-frames="maker.hasFrames.value"
        :static-preview="maker.staticExport.value?.previewUrl"
        :gif-preview="maker.gifExport.value?.previewUrl"
        :static-info="maker.staticExport.value?.info"
        :gif-info="maker.gifExport.value?.info"
        :static-optimization="maker.staticExport.value?.optimization"
        :gif-optimization="maker.gifExport.value?.optimization"
        :exporting="maker.exporting.value"
        @static="maker.renderStatic"
        @gif="maker.exportGif"
        @download-static="downloadStaticSticker"
        @download-gif="downloadGifSticker"
        @zip="downloadZip"
      />
      <div class="validation-block">
        <StickerValidationPanel :result="currentValidation" />
      </div>
    </div>
    </main>

    <aside v-if="maker.livePreviewUrl.value || maker.livePreviewLoading.value" class="preview-rail">
      <div class="floating-live-preview">
        <p class="floating-preview-title">最终效果预览</p>
        <div v-loading="maker.livePreviewLoading.value" class="floating-preview-box">
          <el-image
            v-if="maker.livePreviewUrl.value"
            class="floating-preview-image"
            :src="maker.livePreviewUrl.value"
            fit="contain"
            :preview-src-list="livePreviewList"
            preview-teleported
            hide-on-click-modal
          />
          <el-empty v-else description="上传素材后可实时预览" :image-size="80" />
        </div>
        <p class="floating-preview-help">预览复用最终导出逻辑；动态 GIF 显示第一帧。</p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.sticker-page {
  padding-right: 256px;
}
.sticker-main {
  min-width: 0;
}
.hero-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.spec-note {
  margin-top: 12px;
}
.candidate-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  margin-top: 16px;
}
.candidate-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.candidate-img {
  width: 128px;
  height: 128px;
  border-radius: 8px;
}
.validation-block {
  margin-top: 14px;
}
.preview-rail {
  position: fixed;
  top: 88px;
  right: max(16px, calc((100vw - 1180px) / 2 + 16px));
  z-index: 20;
  width: 240px;
}
.floating-live-preview {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  padding: 12px;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
}
.floating-preview-title {
  margin: 0 0 10px;
  font-weight: 600;
}
.floating-preview-box {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 210px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}
.floating-preview-image {
  width: 200px;
  height: 200px;
  cursor: zoom-in;
}
.floating-preview-help {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
@media (max-width: 1100px) {
  .sticker-page {
    padding-right: 0;
  }
  .preview-rail {
    position: fixed;
    top: auto;
    right: 12px;
    bottom: 12px;
    width: 180px;
    margin-bottom: 0;
  }
  .floating-live-preview {
    padding: 10px;
  }
  .floating-preview-box {
    min-height: 150px;
  }
  .floating-preview-image {
    width: 140px;
    height: 140px;
  }
  .floating-preview-help {
    display: none;
  }
}
@media (max-width: 720px) {
  .hero-panel {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
