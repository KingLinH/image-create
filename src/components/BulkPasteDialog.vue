<script setup lang="ts">
import { ref, watch } from "vue";
import { MAX_BATCH_TASK_COUNT } from "@/core/config";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "import", text: string): void;
}>();

const text = ref("");

// 每次打开清空。
watch(
  () => props.modelValue,
  (v) => {
    if (v) text.value = "";
  },
);

function doImport() {
  emit("import", text.value);
  emit("update:modelValue", false);
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="批量粘贴导入"
    width="560"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="muted">每行一条提示词，自动去空去重，最多 {{ MAX_BATCH_TASK_COUNT }} 条。</div>
    <el-input
      v-model="text"
      type="textarea"
      :rows="10"
      placeholder="一只在月光下的猫&#10;赛博朋克城市天际线&#10;水彩风格的富士山"
      class="paste-area"
    />
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :disabled="!text.trim()" @click="doImport">导入</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.paste-area {
  margin-top: 10px;
}
.muted {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
