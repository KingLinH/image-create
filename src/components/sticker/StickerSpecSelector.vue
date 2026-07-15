<script setup lang="ts">
import { STICKER_SPECS, type StickerAssetKind } from "@/core/stickerSpecs";
import { formatFileSize } from "@/core/stickerSpecs";

const model = defineModel<StickerAssetKind>({ required: true });
</script>

<template>
  <div class="spec-grid">
    <el-card
      v-for="spec in STICKER_SPECS"
      :key="spec.kind"
      class="spec-card"
      :class="{ active: model === spec.kind }"
      shadow="never"
      @click="model = spec.kind"
    >
      <div class="spec-head">
        <strong>{{ spec.label }}</strong>
        <el-tag v-if="model === spec.kind" size="small" type="success">当前</el-tag>
      </div>
      <p class="muted">{{ spec.description }}</p>
      <div class="spec-meta">
        <el-tag size="small">{{ spec.width }}×{{ spec.height }}</el-tag>
        <el-tag size="small" type="info">{{ spec.formats.join(" / ").toUpperCase() }}</el-tag>
        <el-tag size="small" type="warning">≤ {{ formatFileSize(spec.maxBytes) }}</el-tag>
      </div>
      <div v-if="spec.maxFrames" class="muted frames">
        帧数：{{ spec.minFrames }}–{{ spec.maxFrames }}，延迟：{{ spec.minDelayMs }}–{{ spec.maxDelayMs }}ms
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.spec-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.spec-card {
  cursor: pointer;
  border: 1px solid var(--el-border-color-light);
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.spec-card:hover {
  transform: translateY(-1px);
}
.spec-card.active {
  border-color: var(--el-color-primary);
}
.spec-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}
.spec-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.frames {
  margin-top: 8px;
  font-size: 12px;
}
</style>
