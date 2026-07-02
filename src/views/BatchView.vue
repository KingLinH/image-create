<script setup lang="ts">
defineOptions({ name: "BatchView" });
import { computed, ref } from "vue";
import { ElMessage, type UploadFile } from "element-plus";
import { useBatch, SPLIT_TEMPLATES } from "@/composables/useBatch";
import { describeError } from "@/composables/useImageGeneration";
import { downloadImage, compressImage } from "@/core/storage";
import { useConfigStore } from "@/stores/config";
import SnippetDrawer from "@/components/SnippetDrawer.vue";
import BulkPasteDialog from "@/components/BulkPasteDialog.vue";
import ProjectSelect from "@/components/ProjectSelect.vue";

const batch = useBatch();
const configStore = useConfigStore();

const snippetDrawerVisible = ref(false);
const bulkPasteVisible = ref(false);
const snippetCurrent = computed(() => {
  if (batch.mode.value === "same") return batch.masterPrompt.value;
  if (batch.mode.value === "split") return batch.splitMasterPrompt.value;
  return batch.customPrompts.value[0] ?? "";
});

const statusText = computed(() => {
  switch (batch.status.value) {
    case "running":
      return "生成中";
    case "paused":
      return "已暂停";
    case "cancelled":
      return "已取消";
    case "completed":
      return "已完成";
    default:
      return "待执行";
  }
});

const statusType = computed<"primary" | "warning" | "info" | "success">(() => {
  switch (batch.status.value) {
    case "running":
      return "primary";
    case "paused":
      return "warning";
    case "completed":
      return "success";
    default:
      return "info";
  }
});

async function onRefChange(_file: UploadFile, files: UploadFile[]) {
  const raws = files.map((f) => f.raw).filter(Boolean) as unknown as File[];
  batch.referenceImages.value = await Promise.all(raws.map((f) => compressImage(f)));
}

function insertSnippet(content: string) {
  if (batch.mode.value === "custom") {
    batch.customPrompts.value.push(content);
    ElMessage.success("已追加到自定义列表。");
  } else if (batch.mode.value === "split") {
    batch.splitMasterPrompt.value = content;
  } else {
    batch.masterPrompt.value = content;
  }
}

function onBulkImport(text: string) {
  batch.bulkImport(text);
}

async function downloadTask(previewUrl: string) {
  const isDataUrl = previewUrl.startsWith("data:");
  const base64 = isDataUrl ? previewUrl.split(",")[1] : undefined;
  const url = isDataUrl ? undefined : previewUrl;
  try {
    await downloadImage({ base64, url }, `batch-${Date.now()}.${configStore.config.defaultFormat}`, configStore.config.defaultFormat);
  } catch (error) {
    ElMessage.error(describeError(error));
  }
}

function taskStatusType(status: string): "success" | "warning" | "info" | "primary" | "danger" {
  switch (status) {
    case "succeeded":
      return "success";
    case "failed":
      return "danger";
    case "running":
      return "primary";
    case "skipped":
      return "info";
    default:
      return "warning";
  }
}
</script>

<template>
  <div>
    <div class="panel">
      <p class="panel-title">任务编排</p>
      <el-radio-group v-model="batch.mode.value">
        <el-radio-button value="same">同一提示词生成多张</el-radio-button>
        <el-radio-button value="custom">自定义多条提示词</el-radio-button>
        <el-radio-button value="split">✨ AI 拆分提示词</el-radio-button>
      </el-radio-group>

      <div v-if="batch.mode.value === 'same'" class="mode-block">
        <el-form label-width="100px" label-position="right">
          <el-form-item label="主提示词">
            <el-input v-model="batch.masterPrompt.value" type="textarea" :rows="3" placeholder="主任务描述…" />
          </el-form-item>
          <el-form-item label="任务数量">
            <el-input-number v-model="batch.taskCount.value" :min="1" :max="20" />
          </el-form-item>
          <el-form-item label="风格锁定">
            <el-input v-model="batch.styleLock.value" placeholder="可选：统一风格，会追加到每条提示词" />
          </el-form-item>
        </el-form>
      </div>

      <div v-else-if="batch.mode.value === 'custom'" class="mode-block">
        <div class="custom-toolbar">
          <el-button size="small" @click="bulkPasteVisible = true">
            <el-icon><Document /></el-icon> 批量粘贴导入
          </el-button>
          <span class="muted">每行一条；或逐条填写 / 增删。</span>
        </div>
        <div v-for="(_, i) in batch.customPrompts.value" :key="i" class="custom-row">
          <el-input
            v-model="batch.customPrompts.value[i]"
            type="textarea"
            :rows="2"
            :placeholder="`第 ${i + 1} 条提示词`"
          />
          <el-button
            link
            type="danger"
            :disabled="batch.customPrompts.value.length <= 1"
            @click="batch.removeCustomPrompt(i)"
          >
            删除
          </el-button>
        </div>
        <el-button link type="primary" @click="batch.addCustomPrompt">
          <el-icon><Plus /></el-icon> 增加一条
        </el-button>
      </div>

      <div v-else class="mode-block">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="输入一个主提示词，调用文字模型自动拆成多条子任务，再人工微调。"
          class="split-alert"
        />
        <el-form label-width="100px" label-position="right">
          <el-form-item label="主提示词">
            <el-input
              v-model="batch.splitMasterPrompt.value"
              type="textarea"
              :rows="3"
              placeholder="如：为中国、日本、韩国、巴西各做一张世界杯海报"
            />
          </el-form-item>
          <el-form-item label="数量">
            <el-input-number v-model="batch.splitCount.value" :min="1" :max="20" />
            <span class="muted">AI 会按主任务意图推荐合适数量。</span>
          </el-form-item>
          <el-form-item label="拆分模板">
            <el-select v-model="batch.splitTemplate.value" style="width: 200px">
              <el-option v-for="t in SPLIT_TEMPLATES" :key="t.id" :label="t.label" :value="t.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="风格锁定">
            <el-input v-model="batch.styleLock.value" placeholder="可选：统一风格，会追加到每条子提示词" />
          </el-form-item>
        </el-form>
        <el-button type="primary" :loading="batch.splitting.value" @click="batch.runSplit">
          <el-icon><MagicStick /></el-icon> 调用 AI 拆分
        </el-button>
        <div v-if="batch.splitInfo.value" class="split-info muted">
          <template v-if="batch.splitInfo.value.recommendedCount">
            推荐数量：{{ batch.splitInfo.value.recommendedCount }} 条
          </template>
          <span v-if="batch.splitInfo.value.countReason"> · {{ batch.splitInfo.value.countReason }}</span>
        </div>
      </div>

      <div class="plan-actions">
        <el-button @click="batch.planTasks">
          <el-icon><List /></el-icon> 生成任务列表
        </el-button>
        <el-button @click="snippetDrawerVisible = true">
          <el-icon><Files /></el-icon> 片段库
        </el-button>
      </div>
    </div>

    <SnippetDrawer
      v-model="snippetDrawerVisible"
      :current-prompt="snippetCurrent"
      @insert="insertSnippet"
    />
    <BulkPasteDialog v-model="bulkPasteVisible" @import="onBulkImport" />

    <div class="panel">
      <p class="panel-title">执行设置 & 参考图</p>
      <el-form label-width="100px" label-position="right" inline>
        <el-form-item label="并发数">
          <el-input-number v-model="batch.concurrency.value" :min="1" :max="8" />
        </el-form-item>
        <el-form-item label="间隔(秒)">
          <el-input-number v-model="batch.intervalSeconds.value" :min="0" :max="60" />
        </el-form-item>
        <el-form-item label="重试">
          <el-input-number v-model="batch.maxRetries.value" :min="0" :max="5" />
        </el-form-item>
      </el-form>
      <el-upload
        :auto-upload="false"
        list-type="picture-card"
        :on-change="onRefChange"
        accept="image/png,image/jpeg,image/webp"
        multiple
      >
        <el-icon><Plus /></el-icon>
      </el-upload>
      <div class="muted">批量图生图：同一组参考图会发给每个任务。</div>
    </div>

    <div class="actions">
      <span class="muted action-label">项目：</span>
      <ProjectSelect />
      <el-button
        type="primary"
        size="large"
        :disabled="batch.tasks.value.length === 0 || batch.isRunning.value"
        @click="batch.start"
      >
        <el-icon><VideoPlay /></el-icon> 开始批量生成
      </el-button>
      <el-button size="large" :disabled="!batch.isRunning.value" @click="batch.pause">暂停</el-button>
      <el-button size="large" :disabled="!batch.isRunning.value" @click="batch.cancel">取消</el-button>
      <el-button
        size="large"
        :disabled="batch.tasks.value.length === 0 || batch.isRunning.value"
        @click="batch.retryFailed"
      >
        重试失败项
      </el-button>
    </div>

    <div class="panel" v-if="batch.tasks.value.length > 0">
      <div class="progress-row">
        <p class="panel-title" style="margin-bottom: 0">任务进度</p>
        <el-tag :type="statusType">{{ statusText }}</el-tag>
        <el-tag type="success">成功 {{ batch.succeededCount.value }}</el-tag>
        <el-tag type="danger">失败 {{ batch.failedCount.value }}</el-tag>
      </div>
      <el-progress :percentage="batch.progress.value" :status="batch.status.value === 'completed' ? 'success' : undefined" />

      <el-table :data="batch.tasks.value" stripe style="width: 100%; margin-top: 12px">
        <el-table-column label="#" width="60" prop="index">
          <template #default="{ row }">{{ row.index + 1 }}</template>
        </el-table-column>
        <el-table-column label="提示词" min-width="240">
          <template #default="{ row }">
            <div class="cell-prompt">{{ row.prompt }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="taskStatusType(row.status)" size="small">{{ row.status }}</el-tag>
            <span class="muted" v-if="row.attemptCount > 1"> ×{{ row.attemptCount }}</span>
          </template>
        </el-table-column>
        <el-table-column label="预览" width="90">
          <template #default="{ row }">
            <el-image
              v-if="row.previewUrl"
              class="mini-thumb"
              :src="row.previewUrl"
              :preview-src-list="[row.previewUrl]"
              fit="cover"
              preview-teleported
            />
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'succeeded' && row.previewUrl"
              link
              type="primary"
              size="small"
              @click="downloadTask(row.previewUrl)"
            >
              下载
            </el-button>
            <el-tooltip v-if="row.errorMessage" :content="row.errorMessage" placement="top">
              <el-icon><WarningFilled /></el-icon>
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped>
.mode-block {
  margin-top: 14px;
}
.custom-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.split-alert {
  margin-bottom: 14px;
}
.split-info {
  margin-top: 10px;
}
.plan-actions {
  margin-top: 12px;
}
.custom-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}
.actions {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.cell-prompt {
  max-height: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  font-size: 12px;
}
.mini-thumb {
  width: 56px;
  height: 56px;
  border-radius: 6px;
}
</style>
