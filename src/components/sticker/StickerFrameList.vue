<script setup lang="ts">
import type { StickerFrame } from "@/composables/useStickerMaker";

const props = defineProps<{
  frames: StickerFrame[];
  defaultDelay: number;
}>();
const emit = defineEmits<{
  move: [index: number, direction: -1 | 1];
  remove: [index: number];
  delay: [index: number, delayMs: number];
  allDelay: [delayMs: number];
}>();

function kindLabel(kind?: StickerFrame["sourceKind"]) {
  if (kind === "video") return "视频帧";
  if (kind === "ai") return "AI素材";
  return "图片帧";
}
</script>

<template>
  <div>
    <div class="frame-toolbar">
      <span class="muted">共 {{ props.frames.length }} 帧</span>
      <el-input-number :model-value="props.defaultDelay" :min="20" :max="2000" @change="emit('allDelay', Number($event))" />
      <span class="muted">批量帧延迟 ms</span>
    </div>
    <div v-if="props.frames.length" class="frame-grid">
      <div v-for="(frame, index) in props.frames" :key="frame.id" class="frame-card">
        <el-image
          class="frame-image"
          :src="frame.previewUrl"
          fit="contain"
          :preview-src-list="props.frames.map((item) => item.previewUrl)"
          :initial-index="index"
          preview-teleported
          hide-on-click-modal
        />
        <div class="frame-index">#{{ index + 1 }} · {{ kindLabel(frame.sourceKind) }}</div>
        <div class="frame-name" :title="frame.sourceLabel || frame.source.name">{{ frame.sourceLabel || frame.source.name }}</div>
        <el-input-number
          :model-value="frame.delayMs"
          :min="20"
          :max="2000"
          size="small"
          @change="emit('delay', index, Number($event))"
        />
        <div class="frame-actions">
          <el-button link :disabled="index === 0" @click="emit('move', index, -1)">前移</el-button>
          <el-button link :disabled="index === props.frames.length - 1" @click="emit('move', index, 1)">后移</el-button>
          <el-button link type="danger" @click="emit('remove', index)">删除</el-button>
        </div>
      </div>
    </div>
    <el-empty v-else description="动态模式可上传多张图片，或上传视频自动抽帧" />
  </div>
</template>

<style scoped>
.frame-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.frame-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
.frame-card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 10px;
  text-align: center;
}
.frame-image {
  width: 96px;
  height: 96px;
  background: var(--el-fill-color-light);
}
.frame-image :deep(.el-image__inner) {
  width: 96px;
  height: 96px;
  object-fit: contain;
  cursor: zoom-in;
}
.frame-index {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 4px 0;
}
.frame-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}
.frame-actions {
  display: flex;
  justify-content: center;
  gap: 4px;
}
</style>
