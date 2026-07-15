<script setup lang="ts">
import { computed } from "vue";
import { formatFileSize, type StickerAnimationInfo, type StickerImageInfo } from "@/core/stickerSpecs";
import type { StickerOptimizationInfo } from "@/core/stickerAnimation";
import type { StickerStaticOptimizeResult } from "@/core/stickerCanvas";

const props = defineProps<{
  mode: "static" | "animated";
  hasSource: boolean;
  hasFrames: boolean;
  staticPreview?: string | null;
  gifPreview?: string | null;
  staticInfo?: StickerImageInfo | null;
  gifInfo?: StickerAnimationInfo | null;
  staticOptimization?: StickerStaticOptimizeResult | null;
  gifOptimization?: StickerOptimizationInfo | null;
  exporting: boolean;
}>();
const emit = defineEmits<{
  static: [];
  gif: [];
  zip: [];
  downloadStatic: [];
  downloadGif: [];
}>();

const canExportStatic = computed(() => props.hasSource && props.mode === "static");
const canExportGif = computed(() => props.hasFrames && props.mode === "animated");
const hasStaticExport = computed(() => Boolean(props.staticPreview));
const hasGifExport = computed(() => Boolean(props.gifPreview));
const hasInvalidStaticExport = computed(() => Boolean(props.staticInfo && props.staticOptimization && props.staticInfo.bytes > props.staticOptimization.maxBytes));
const hasInvalidGifExport = computed(() => Boolean(props.gifInfo && props.gifOptimization && props.gifInfo.bytes > props.gifOptimization.maxBytes));
const hasInvalidExport = computed(() => hasInvalidStaticExport.value || hasInvalidGifExport.value);
const hasAnyExport = computed(() => hasStaticExport.value || hasGifExport.value);
const staticPreviewList = computed(() => props.staticPreview ? [props.staticPreview] : []);
const gifPreviewList = computed(() => props.gifPreview ? [props.gifPreview] : []);
const staticActionText = computed(() => props.exporting && props.mode === "static" ? "正在处理并优化…" : "处理静态表情");
const gifActionText = computed(() => props.exporting && props.mode === "animated" ? "正在合成并压缩…" : "合成 GIF");
const zipActionText = computed(() => props.exporting ? "正在准备导出…" : "生成投稿 ZIP");
</script>

<template>
  <div>
    <el-alert
      v-if="!canExportStatic && !canExportGif"
      class="empty-tip"
      type="info"
      :closable="false"
      show-icon
      title="请先上传素材。静态模式上传一张图片；动态模式上传多张图片或视频。"
    />
    <div class="export-actions">
      <el-button
        v-if="props.mode === 'static'"
        type="primary"
        :loading="props.exporting"
        :disabled="!canExportStatic"
        @click="emit('static')"
      >
        {{ staticActionText }}
      </el-button>
      <el-button
        v-else
        type="primary"
        :loading="props.exporting"
        :disabled="!canExportGif"
        @click="emit('gif')"
      >
        {{ gifActionText }}
      </el-button>
      <el-button type="success" :loading="props.exporting" :disabled="!hasAnyExport || hasInvalidExport" @click="emit('zip')">
        {{ zipActionText }}
      </el-button>
      <span v-if="props.exporting" class="exporting-tip">
        {{ props.mode === 'animated' ? '正在尝试不同颜色数和帧数，素材越复杂耗时越久。' : '正在尝试不同压缩参数，尽量贴近规格上限。' }}
      </span>
      <span v-if="hasInvalidExport" class="invalid-export-tip">结果仍超出规格，调整素材后重新处理/合成再下载。</span>
    </div>
    <div class="preview-grid">
      <div v-if="props.staticPreview" class="preview-card">
        <p>静态预览</p>
        <el-image
          class="preview-image"
          :src="props.staticPreview"
          fit="contain"
          :preview-src-list="staticPreviewList"
          preview-teleported
          hide-on-click-modal
        />
        <span v-if="props.staticInfo" class="muted">
          {{ props.staticInfo.width }}×{{ props.staticInfo.height }} · {{ props.staticInfo.format.toUpperCase() }} · {{ formatFileSize(props.staticInfo.bytes) }}
        </span>
        <span v-if="props.staticOptimization" class="optimization-line">
          已自动优化至 {{ formatFileSize(props.staticInfo?.bytes ?? 0) }} / {{ formatFileSize(props.staticOptimization.maxBytes) }}
          <template v-if="props.staticOptimization.colors"> · PNG 颜色数 {{ props.staticOptimization.colors }}</template>
          <template v-if="props.staticOptimization.quality"> · 质量 {{ Math.round(props.staticOptimization.quality * 100) }}%</template>
        </span>
        <span v-if="hasInvalidStaticExport" class="invalid-line">
          当前静态图仍超过规格上限，请调整素材复杂度后重新处理。
        </span>
        <el-button type="primary" plain size="small" :disabled="hasInvalidStaticExport" @click="emit('downloadStatic')">
          下载静态表情
        </el-button>
      </div>
      <div v-if="props.gifPreview" class="preview-card">
        <p>GIF 预览</p>
        <el-image
          class="preview-image"
          :src="props.gifPreview"
          fit="contain"
          :preview-src-list="gifPreviewList"
          preview-teleported
          hide-on-click-modal
        />
        <span v-if="props.gifInfo" class="muted">
          {{ props.gifInfo.frameCount }} 帧 · {{ formatFileSize(props.gifInfo.bytes) }}
        </span>
        <span v-if="props.gifOptimization" class="optimization-line">
          已自动优化至 {{ formatFileSize(props.gifInfo?.bytes ?? 0) }} / {{ formatFileSize(props.gifOptimization.maxBytes) }}
          <template v-if="props.gifOptimization.colors"> · {{ props.gifOptimization.colors }} 色</template>
          <template v-if="props.gifOptimization.outputFrameCount && props.gifOptimization.originalFrameCount">
            · 帧数 {{ props.gifOptimization.outputFrameCount }} / {{ props.gifOptimization.originalFrameCount }}
          </template>
        </span>
        <span v-if="hasInvalidGifExport" class="invalid-line">
          当前 GIF 仍超过规格上限，请减少帧数/颜色或调整素材后重新合成。
        </span>
        <el-button type="primary" plain size="small" :disabled="hasInvalidGifExport" @click="emit('downloadGif')">
          下载 GIF 表情
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.empty-tip {
  margin-bottom: 12px;
}
.export-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.exporting-tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  align-self: center;
}
.invalid-export-tip {
  color: var(--el-color-danger);
  font-size: 12px;
  align-self: center;
}
.preview-grid {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 14px;
}
.preview-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 12px;
}
.preview-card p {
  margin: 0;
  font-weight: 600;
}
.preview-image {
  width: 160px;
  height: 160px;
}
.preview-image :deep(.el-image__inner) {
  width: 160px;
  height: 160px;
  object-fit: contain;
  cursor: zoom-in;
}
.invalid-line {
  max-width: 220px;
  color: var(--el-color-danger);
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
}
.optimization-line {
  max-width: 220px;
  color: var(--el-color-success);
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
}
</style>
