<script setup lang="ts">
import type { UploadFile } from "element-plus";
import type { StickerVideoMetadata } from "@/core/stickerVideo";

const props = defineProps<{
  mode: "static" | "animated";
  actionPrompt: string;
  loading: boolean;
  videoExtracting: boolean;
  videoFrameCount: number;
  videoStartTime: number;
  videoEndTime: number;
  defaultDelay: number;
  maxFrames?: number;
  lastVideoMeta?: StickerVideoMetadata | null;
}>();
const emit = defineEmits<{
  upload: [files: File[]];
  generate: [];
  updateActionPrompt: [value: string];
  updateVideoFrameCount: [value: number];
  updateVideoStartTime: [value: number];
  updateVideoEndTime: [value: number];
  updateDefaultDelay: [value: number];
}>();

function onChange(file: UploadFile) {
  if (file.raw) emit("upload", [file.raw as File]);
}
</script>

<template>
  <div class="source-panel">
    <div class="upload-card">
      <div class="section-heading">
        <p class="sub-title">上传自己的素材</p>
        <el-tag type="success" effect="plain">主流程</el-tag>
      </div>
      <el-upload
        :auto-upload="false"
        list-type="picture-card"
        :show-file-list="false"
        :on-change="onChange"
        :accept="props.mode === 'animated' ? 'image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,.mov,.m4v' : 'image/png,image/jpeg,image/webp'"
        :multiple="props.mode === 'animated'"
        :disabled="props.videoExtracting"
      >
        <el-icon><Plus /></el-icon>
      </el-upload>
      <p class="muted">
        {{ props.mode === "animated"
          ? "可上传多张图片作为帧，也可上传视频自动抽帧；之后统一裁剪、校验并合成 GIF。"
          : "上传一张 PNG/JPEG/WebP 后，工具会按当前规格裁剪、补边、压缩并校验；重新上传会替换当前素材。" }}
      </p>

      <div v-if="props.mode === 'animated'" class="video-settings">
        <p class="settings-title">视频抽帧设置</p>
        <div class="settings-grid">
          <label>
            <span>目标帧数</span>
            <el-input-number
              :model-value="props.videoFrameCount"
              :min="2"
              :max="props.maxFrames ?? 24"
              size="small"
              @change="emit('updateVideoFrameCount', Number($event))"
            />
          </label>
          <label>
            <span>起始秒</span>
            <el-input-number
              :model-value="props.videoStartTime"
              :min="0"
              :step="0.1"
              size="small"
              @change="emit('updateVideoStartTime', Number($event))"
            />
          </label>
          <label>
            <span>结束秒</span>
            <el-input-number
              :model-value="props.videoEndTime"
              :min="0"
              :step="0.1"
              size="small"
              @change="emit('updateVideoEndTime', Number($event))"
            />
          </label>
          <label>
            <span>帧延迟 ms</span>
            <el-input-number
              :model-value="props.defaultDelay"
              :min="20"
              :max="2000"
              size="small"
              @change="emit('updateDefaultDelay', Number($event))"
            />
          </label>
        </div>
        <p class="muted">
          上传视频会按目标帧数重新生成帧列表；目标帧数受当前规格上限限制。结束秒填 0 表示使用视频结尾。
          再次上传视频会替换当前视频帧；如需手动追加帧，请上传图片帧。
        </p>
        <p v-if="props.lastVideoMeta" class="muted">
          最近视频：{{ props.lastVideoMeta.width }}×{{ props.lastVideoMeta.height }} · {{ props.lastVideoMeta.duration.toFixed(2) }}s
        </p>
        <el-alert
          v-if="props.videoExtracting"
          class="extracting"
          type="info"
          :closable="false"
          show-icon
          title="正在从视频抽帧，请稍候…"
        />
      </div>
    </div>

    <el-collapse class="ai-collapse">
      <el-collapse-item title="可选：没有素材时用 AI 生成候选素材" name="ai">
        <p class="muted">AI 只生成候选素材；加入后仍会走同一套裁剪、校验和导出流程。</p>
        <el-input
          :model-value="props.actionPrompt"
          type="textarea"
          :rows="3"
          placeholder="描述动作/表情，如：开心挥手、委屈流泪"
          @update:model-value="emit('updateActionPrompt', $event)"
        />
        <div class="prompt-actions">
          <el-button type="primary" :loading="props.loading" @click="emit('generate')">
            <el-icon><Picture /></el-icon> 生成候选素材
          </el-button>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.source-panel {
  display: grid;
  gap: 16px;
}
.upload-card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  padding: 16px;
  background: var(--el-fill-color-blank);
}
.section-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.sub-title {
  margin: 0;
  font-weight: 600;
}
.video-settings {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed var(--el-border-color);
}
.settings-title {
  margin: 0 0 10px;
  font-weight: 600;
}
.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}
.settings-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.extracting {
  margin-top: 10px;
}
.ai-collapse {
  border-top: none;
  border-bottom: none;
}
.prompt-actions {
  margin-top: 10px;
}
</style>
