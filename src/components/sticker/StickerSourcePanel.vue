<script setup lang="ts">
import { computed } from "vue";
import type { UploadFile } from "element-plus";
import type { StickerVideoMetadata } from "@/core/stickerVideo";
import type { VideoPreset, VideoSamplingMode, VideoSamplingPlan } from "@/composables/useStickerMaker";

const props = defineProps<{
  mode: "static" | "animated";
  actionPrompt: string;
  loading: boolean;
  videoExtracting: boolean;
  canReextractVideo: boolean;
  videoFrameCount: number;
  videoTargetFps: number;
  videoSamplingMode: VideoSamplingMode;
  videoSamplingPlan: VideoSamplingPlan;
  videoStartTime: number;
  videoEndTime: number;
  videoEffectiveStartTime: number;
  videoEffectiveEndTime: number;
  videoStartPreview?: string | null;
  videoEndPreview?: string | null;
  defaultDelay: number;
  toolMaxFrames?: number;
  lastVideoMeta?: StickerVideoMetadata | null;
}>();
const emit = defineEmits<{
  upload: [files: File[]];
  generate: [];
  updateActionPrompt: [value: string];
  updateVideoFrameCount: [value: number];
  updateVideoTargetFps: [value: number];
  updateVideoSamplingMode: [value: VideoSamplingMode];
  updateVideoStartTime: [value: number];
  updateVideoEndTime: [value: number];
  updateVideoRange: [value: [number, number]];
  updateDefaultDelay: [value: number];
  applyVideoPreset: [value: VideoPreset];
  reextractVideo: [];
}>();

function onChange(file: UploadFile) {
  if (file.raw) emit("upload", [file.raw as File]);
}

const videoRangeModel = computed({
  get: (): [number, number] => [props.videoEffectiveStartTime, props.videoEffectiveEndTime],
  set: (value: [number, number]) => emit("updateVideoRange", value),
});

const selectedVideoDurationText = computed(() => {
  const duration = Math.max(0, props.videoEffectiveEndTime - props.videoEffectiveStartTime);
  return `${duration.toFixed(2)}s`;
});

function formatSecondsTooltip(value: number) {
  return `${value.toFixed(2)}s`;
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
          ? "上传视频后默认截取约 2.5 秒关键动作、按 12fps 抽帧；想要更好效果，优先选准片段，再调整流畅度或体积。"
          : "上传一张 PNG/JPEG/WebP 后，工具会按当前规格裁剪、补边、压缩并校验；重新上传会替换当前素材。" }}
      </p>

      <div v-if="props.mode === 'animated'" class="usage-tips">
        <p class="tips-title">视频转动态表情小技巧</p>
        <ul>
          <li>先选动作最集中的 1.5–3 秒，主体越大、背景越简单，越容易做出清晰表情。</li>
          <li>不要只追求帧数更多；片段里有前摇、停顿或无效画面时，抽再多帧也会显得拖沓。</li>
          <li>动作拖沓就缩短起止时间；动作不完整就稍微延长结束秒；不够顺滑再提高 FPS。</li>
          <li>体积超 500KB 时，优先缩短片段、选择“更小体积”，或换背景更简单的视频。</li>
        </ul>
      </div>

      <div v-if="props.mode === 'animated'" class="video-settings">
        <p class="settings-title">视频转 GIF 自动处理</p>
        <el-alert
          class="wechat-frame-tip"
          type="info"
          :closable="false"
          show-icon
          title="普通动态 GIF 主要看 240×240、GIF 格式和 500KB 体积；帧数会影响流畅度和压缩难度，导出时会自动降色并在必要时抽样。"
        />
        <div class="sampling-summary">
          <span>截取时长：{{ props.videoSamplingPlan.selectedDuration ? `${props.videoSamplingPlan.selectedDuration.toFixed(2)}s` : '默认约 2.5s' }}</span>
          <span>预计抽取：{{ props.videoSamplingPlan.compliantFrameCount }} 帧</span>
          <span>有效 FPS：{{ props.videoSamplingPlan.effectiveFps ? props.videoSamplingPlan.effectiveFps.toFixed(1) : '约 12' }}</span>
        </div>
        <p class="muted sampling-tip">{{ props.videoSamplingPlan.tip }}</p>
        <p v-if="props.lastVideoMeta" class="muted">
          最近视频：{{ props.lastVideoMeta.width }}×{{ props.lastVideoMeta.height }} · {{ props.lastVideoMeta.duration.toFixed(2) }}s
        </p>

        <div v-if="props.lastVideoMeta" class="video-range-panel">
          <div class="video-range-previews">
            <div class="video-range-preview">
              <span>起始 {{ props.videoEffectiveStartTime.toFixed(2) }}s</span>
              <img v-if="props.videoStartPreview" :src="props.videoStartPreview" alt="" />
            </div>
            <div class="video-range-preview">
              <span>结束 {{ props.videoEffectiveEndTime.toFixed(2) }}s</span>
              <img v-if="props.videoEndPreview" :src="props.videoEndPreview" alt="" />
            </div>
          </div>
          <div class="video-range-meta">
            <span>已选 {{ selectedVideoDurationText }}</span>
            <span>总长 {{ props.lastVideoMeta.duration.toFixed(2) }}s</span>
          </div>
          <el-slider
            v-model="videoRangeModel"
            range
            :min="0"
            :max="props.lastVideoMeta.duration"
            :step="0.05"
            :format-tooltip="formatSecondsTooltip"
          />
          <div class="video-range-actions">
            <span>调整片段后，需要重新抽帧才会更新下方帧列表。</span>
            <el-button
              size="small"
              type="primary"
              :disabled="!props.canReextractVideo || props.videoExtracting"
              :loading="props.videoExtracting"
              @click="emit('reextractVideo')"
            >
              按当前片段重新抽帧
            </el-button>
          </div>
        </div>

        <el-collapse class="advanced-collapse">
          <el-collapse-item title="高级设置：换片段或调流畅度/体积" name="video-advanced">
            <div class="preset-row">
              <span>效果预设</span>
              <el-tooltip content="提高采样 FPS，适合快速动作或表情变化；画面更顺，但文件更容易变大。" placement="top">
                <el-button size="small" plain @click="emit('applyVideoPreset', 'smooth')">更流畅</el-button>
              </el-tooltip>
              <el-tooltip content="默认平衡方案，适合大多数 1.5–3 秒的关键动作片段。" placement="top">
                <el-button size="small" plain @click="emit('applyVideoPreset', 'normal')">自动推荐</el-button>
              </el-tooltip>
              <el-tooltip content="减少帧数和延长帧间隔，适合背景复杂、体积超限或动作较慢的视频。" placement="top">
                <el-button size="small" plain @click="emit('applyVideoPreset', 'compact')">更小体积</el-button>
              </el-tooltip>
            </div>
            <el-radio-group
              class="sampling-mode"
              :model-value="props.videoSamplingMode"
              size="small"
              @update:model-value="emit('updateVideoSamplingMode', $event as VideoSamplingMode)"
            >
              <el-radio-button value="fps">按 FPS 抽取</el-radio-button>
              <el-radio-button value="frame-count">按帧数抽取</el-radio-button>
            </el-radio-group>
            <div class="settings-grid">
              <label v-if="props.videoSamplingMode === 'frame-count'">
                <span>目标帧数</span>
                <el-input-number
                  :model-value="props.videoFrameCount"
                  :min="2"
                  :max="props.toolMaxFrames ?? props.videoSamplingPlan.toolMaxFrames"
                  size="small"
                  @change="emit('updateVideoFrameCount', Number($event))"
                />
              </label>
              <label v-else>
                <span>目标 FPS</span>
                <el-input-number
                  :model-value="props.videoTargetFps"
                  :min="1"
                  :max="30"
                  :step="1"
                  size="small"
                  @change="emit('updateVideoTargetFps', Number($event))"
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
            <div class="reextract-row">
              <el-button
                size="small"
                type="primary"
                plain
                :disabled="!props.canReextractVideo || props.videoExtracting"
                :loading="props.videoExtracting"
                @click="emit('reextractVideo')"
              >
                按当前设置重新抽帧
              </el-button>
            </div>
            <p class="muted">
              结束秒填 0 会自动使用起始秒后的约 2.5 秒；更短片段通常更流畅也更容易压到 500KB。调整起止时间、FPS 或预设后，点击“按当前设置重新抽帧”即可作用到当前视频。
            </p>
          </el-collapse-item>
        </el-collapse>

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
.usage-tips {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-color-primary-light-9);
  color: var(--el-text-color-regular);
}
.tips-title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-primary);
}
.usage-tips ul {
  margin: 0;
  padding-left: 18px;
}
.usage-tips li {
  margin: 3px 0;
  font-size: 12px;
  line-height: 1.5;
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
.wechat-frame-tip {
  margin-bottom: 10px;
}
.advanced-collapse {
  margin-top: 10px;
  border-top: none;
  border-bottom: none;
}
.preset-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.sampling-mode {
  margin-bottom: 10px;
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
.reextract-row {
  margin: 12px 0 8px;
}
.sampling-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.sampling-summary span {
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.sampling-tip {
  color: var(--el-color-primary);
}
.video-range-panel {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
}
.video-range-previews {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 8px;
}
.video-range-preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.video-range-preview img {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 6px;
  object-fit: cover;
  background: var(--el-fill-color-light);
}
.video-range-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.video-range-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.video-range-actions span {
  min-width: 0;
  line-height: 1.4;
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
