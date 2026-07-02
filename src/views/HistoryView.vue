<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { useHistoryStore } from "@/stores/history";
import { setPendingPrompt } from "@/composables/promptTransfer";
import type { ImageRecord } from "@/core/history";

const historyStore = useHistoryStore();
const router = useRouter();

onMounted(() => {
  void historyStore.hydrateThumbnails();
});

function thumbOf(id: string): string | undefined {
  return historyStore.thumbnailById[id];
}

function reuse(record: ImageRecord) {
  setPendingPrompt(record.prompt);
  router.push({ name: "single" });
  ElMessage.success("已载入提示词到单图页。");
}

function remove(record: ImageRecord) {
  historyStore.remove(record.id);
  ElMessage.info("已删除该记录。");
}

async function clearAll() {
  try {
    await ElMessageBox.confirm("确定清空全部历史记录？此操作不可恢复。", "清空历史", {
      type: "warning",
    });
    await historyStore.clear();
    ElMessage.success("已清空历史。");
  } catch {
    /* 取消 */
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function statusText(status: string): string {
  return status === "success" ? "成功" : status === "failed" ? "失败" : "已取消";
}

function statusType(status: string): "success" | "danger" | "info" {
  return status === "success" ? "success" : status === "failed" ? "danger" : "info";
}
</script>

<template>
  <div>
    <div class="panel head-bar">
      <p class="panel-title" style="margin-bottom: 0">历史记录（共 {{ historyStore.records.length }} 条）</p>
      <el-select
        :model-value="historyStore.projectFilter"
        placeholder="按项目筛选"
        clearable
        size="small"
        style="width: 180px"
        :disabled="historyStore.projects.length === 0"
        @change="historyStore.setProjectFilter"
      >
        <el-option v-for="p in historyStore.projects" :key="p" :label="p" :value="p" />
      </el-select>
      <el-button type="danger" plain :disabled="historyStore.records.length === 0" @click="clearAll">
        清空历史
      </el-button>
    </div>

    <el-empty v-if="historyStore.records.length === 0" description="还没有历史记录" />

    <template v-else>
      <div v-for="item in historyStore.displayItems" :key="item.type === 'record' ? item.record.id : item.id" class="panel">
        <!-- 单条记录 -->
        <template v-if="item.type === 'record'">
          <div class="record-card">
            <el-image
              v-if="thumbOf(item.record.id)"
              class="thumb"
              :src="thumbOf(item.record.id)"
              :preview-src-list="thumbOf(item.record.id) ? [thumbOf(item.record.id)!] : []"
              fit="cover"
              preview-teleported
            />
            <div v-else class="thumb placeholder">
              <el-icon :size="28"><Picture /></el-icon>
            </div>
            <div class="record-info">
              <div class="record-top">
                <el-tag :type="statusType(item.record.status)" size="small">
                  {{ statusText(item.record.status) }}
                </el-tag>
                <el-tag
                  v-if="item.record.project"
                  size="small"
                  effect="plain"
                  class="project-tag"
                  @click="historyStore.setProjectFilter(item.record.project!)"
                >
                  📁 {{ item.record.project }}
                </el-tag>
                <span class="muted">{{ formatTime(item.record.createdAt) }}</span>
                <span class="muted">{{ item.record.model }} · {{ item.record.size }}</span>
              </div>
              <div class="record-prompt">{{ item.record.prompt }}</div>
              <div class="muted" v-if="item.record.errorMessage">错误：{{ item.record.errorMessage }}</div>
              <div class="muted" v-else>{{ item.record.outputPath }}</div>
            </div>
            <div class="record-actions">
              <el-button link type="primary" size="small" @click="reuse(item.record)">复用</el-button>
              <el-button
                v-if="item.record.status === 'success'"
                link
                type="primary"
                size="small"
                @click="historyStore.downloadOriginal(item.record)"
              >
                下载
              </el-button>
              <el-button link type="danger" size="small" @click="remove(item.record)">删除</el-button>
            </div>
          </div>
        </template>

        <!-- 批次聚合 -->
        <template v-else>
          <div class="batch-head">
            <el-icon><Files /></el-icon>
            <span class="batch-title">{{ item.title }}</span>
            <el-tag size="small">批次 {{ item.records.length }} 条</el-tag>
            <span class="muted">{{ formatTime(item.createdAt) }}</span>
          </div>
          <div class="thumb-grid">
            <div v-for="rec in item.records" :key="rec.id" class="batch-item">
              <el-image
                v-if="thumbOf(rec.id)"
                class="thumb"
                :src="thumbOf(rec.id)"
                :preview-src-list="thumbOf(rec.id) ? [thumbOf(rec.id)!] : []"
                fit="cover"
                preview-teleported
              />
              <div v-else class="thumb placeholder">
                <el-icon><WarningFilled /></el-icon>
              </div>
              <el-button link type="primary" size="small" @click="reuse(rec)">复用</el-button>
            </div>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.head-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.project-tag {
  cursor: pointer;
}
.record-card {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.record-card .thumb {
  width: 96px;
  height: 96px;
  flex-shrink: 0;
}
.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
}
.record-info {
  flex: 1;
  min-width: 0;
}
.record-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.record-prompt {
  font-size: 13px;
  margin-bottom: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.record-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-end;
}
.batch-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.batch-title {
  font-weight: 600;
  font-size: 14px;
}
.batch-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
</style>
