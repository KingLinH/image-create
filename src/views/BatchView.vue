<script setup lang="ts">
import { computed } from "vue";
import type { UploadFile } from "element-plus";
import { useBatch } from "@/composables/useBatch";
import { describeError } from "@/composables/useImageGeneration";
import { downloadImage } from "@/core/storage";
import { useConfigStore } from "@/stores/config";

const batch = useBatch();
const configStore = useConfigStore();

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

function onRefChange(_file: UploadFile, files: UploadFile[]) {
  batch.referenceImages.value = files.map((f) => f.raw).filter(Boolean) as unknown as File[];
}

async function downloadTask(previewUrl: string) {
  const isDataUrl = previewUrl.startsWith("data:");
  const base64 = isDataUrl ? previewUrl.split(",")[1] : undefined;
  const url = isDataUrl ? undefined : previewUrl;
  try {
    await downloadImage({ base64, url }, `batch-${Date.now()}.${configStore.config.defaultFormat}`, configStore.config.defaultFormat);
  } catch (error) {
    describeError(error);
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

      <div v-else class="mode-block">
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

      <div class="plan-actions">
        <el-button @click="batch.planTasks">
          <el-icon><List /></el-icon> 生成任务列表
        </el-button>
      </div>
    </div>

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
