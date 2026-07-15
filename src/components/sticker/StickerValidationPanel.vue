<script setup lang="ts">
import type { StickerValidationResult } from "@/core/stickerSpecs";

const props = defineProps<{
  result?: StickerValidationResult | null;
}>();
</script>

<template>
  <div>
    <el-alert
      v-if="!props.result"
      type="info"
      :closable="false"
      title="上传素材后，点击处理/合成即可看到尺寸、格式、体积、帧数等校验结果。"
      show-icon
    />
    <el-alert
      v-else-if="props.result.ok"
      type="success"
      :closable="false"
      title="按当前规格校验通过"
      show-icon
    />
    <el-alert
      v-else
      type="error"
      :closable="false"
      title="存在不符合规格的项目"
      show-icon
    />
    <div v-if="props.result?.issues.length" class="issues">
      <div v-for="(issue, i) in props.result.issues" :key="i" class="issue">
        <el-tag size="small" :type="issue.level === 'error' ? 'danger' : 'warning'">
          {{ issue.level === "error" ? "错误" : "提醒" }}
        </el-tag>
        <span>{{ issue.message }}</span>
        <span v-if="issue.suggestion" class="muted">{{ issue.suggestion }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.issues {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}
.issue {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
