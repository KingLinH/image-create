<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";

const emit = defineEmits<{ (e: "assemble", text: string): void }>();

const topic = ref("");
const color = ref("");
const title = ref("");
const subtitle = ref("");

function assemble() {
  const segs: string[] = [];
  if (topic.value.trim()) segs.push(`主题：${topic.value.trim()}`);
  if (color.value.trim()) segs.push(`主色调：${color.value.trim()}`);
  if (title.value.trim()) segs.push(`画面需呈现的标题文字：「${title.value.trim()}」`);
  if (subtitle.value.trim()) segs.push(`其他文字：「${subtitle.value.trim()}」`);
  if (segs.length === 0) {
    ElMessage.warning("请至少填写一项再组装。");
    return;
  }
  emit("assemble", segs.join("，"));
  ElMessage.success("已组装并追加到提示词。");
}
</script>

<template>
  <div class="builder">
    <div class="muted">填表组装海报提示词（风格/构图用下方标签，文案写这里）：</div>
    <el-form label-width="90px" label-position="right" size="small" class="builder-form">
      <el-form-item label="主题/产品">
        <el-input v-model="topic" placeholder="如：无线降噪耳机 / 双十二促销" />
      </el-form-item>
      <el-form-item label="主色调">
        <el-input v-model="color" placeholder="如：科技蓝 + 银色 / 暖橘红" />
      </el-form-item>
      <el-form-item label="标题文案">
        <el-input v-model="title" placeholder="如：听见纯粹" />
      </el-form-item>
      <el-form-item label="其他文案">
        <el-input v-model="subtitle" placeholder="副标题 / 卖点 / 日期等" />
      </el-form-item>
    </el-form>
    <el-button type="primary" size="small" @click="assemble">
      <el-icon><MagicStick /></el-icon> 组装到提示词
    </el-button>
  </div>
</template>

<style scoped>
.builder {
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 12px;
}
.builder-form {
  margin: 10px 0;
}
.muted {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
