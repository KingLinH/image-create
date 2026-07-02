<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessage } from "element-plus";
import { Delete, DocumentAdd, Search } from "@element-plus/icons-vue";
import { useSnippetsStore } from "@/stores/snippets";

const props = defineProps<{
  modelValue: boolean;
  currentPrompt: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "insert", content: string): void;
}>();

const store = useSnippetsStore();
const keyword = ref("");
const newTitle = ref("");

const filtered = computed(() => store.search(keyword.value));

function close() {
  emit("update:modelValue", false);
}

function insert(content: string) {
  emit("insert", content);
  close();
}

function saveCurrent() {
  if (!props.currentPrompt.trim()) {
    ElMessage.warning("当前没有可保存的提示词。");
    return;
  }
  store.add({ title: newTitle.value, content: props.currentPrompt });
  newTitle.value = "";
  ElMessage.success("已保存为片段。");
}

function remove(id: string) {
  store.remove(id);
  ElMessage.info("已删除片段。");
}
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="提示词片段库"
    direction="rtl"
    size="400px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="save-box">
      <div class="muted">把当前提示词存为片段，方便下次复用：</div>
      <div class="save-row">
        <el-input v-model="newTitle" placeholder="片段标题（可选）" size="small" />
        <el-button type="primary" size="small" @click="saveCurrent">
          <el-icon><DocumentAdd /></el-icon> 保存
        </el-button>
      </div>
    </div>

    <el-input
      v-model="keyword"
      placeholder="搜索标题 / 内容 / 标签"
      size="default"
      clearable
      class="search"
    >
      <template #prefix><el-icon><Search /></el-icon></template>
    </el-input>

    <el-empty v-if="filtered.length === 0" description="还没有片段" :image-size="60" />

    <div v-else class="snippet-list">
      <el-card v-for="s in filtered" :key="s.id" shadow="hover" class="snippet-card">
        <div class="snippet-title">{{ s.title }}</div>
        <div class="snippet-content">{{ s.content }}</div>
        <div class="snippet-foot">
          <div class="snippet-tags">
            <el-tag v-for="t in s.tags" :key="t" size="small" effect="plain">{{ t }}</el-tag>
          </div>
          <div class="snippet-actions">
            <el-button link type="primary" size="small" @click="insert(s.content)">插入</el-button>
            <el-button link type="danger" size="small" :icon="Delete" @click="remove(s.id)" />
          </div>
        </div>
      </el-card>
    </div>
  </el-drawer>
</template>

<style scoped>
.save-box {
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.save-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.search {
  margin-bottom: 12px;
}
.snippet-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.snippet-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}
.snippet-content {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: pre-wrap;
  max-height: 72px;
  overflow: hidden;
  margin-bottom: 8px;
}
.snippet-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.snippet-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.snippet-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.muted {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
