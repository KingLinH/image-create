import { computed, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { runBatchTasks, type BatchStatus, type BatchTask } from "@/core/batch";
import { useConfigStore } from "@/stores/config";
import { useHistoryStore } from "@/stores/history";
import { buildOutputPath } from "@/core/fileNames";
import { generateId, type ImageRecord } from "@/core/history";
import { makeThumbnail } from "@/core/storage";
import { describeError } from "./useImageGeneration";
import { MAX_BATCH_TASK_COUNT } from "@/core/config";

export type BatchMode = "same" | "custom";

export function useBatch() {
  const configStore = useConfigStore();
  const historyStore = useHistoryStore();

  const mode = ref<BatchMode>("same");
  const masterPrompt = ref("");
  const taskCount = ref(configStore.config.batchDefaultTaskCount);
  const customPrompts = ref<string[]>([""]);
  const styleLock = ref("");

  const referenceImages = ref<File[]>([]);

  const concurrency = ref(configStore.config.batchDefaultConcurrency);
  const intervalSeconds = ref(configStore.config.batchDefaultIntervalSeconds);
  const maxRetries = ref(configStore.config.batchDefaultMaxRetries);

  const tasks = ref<BatchTask[]>([]);
  const status = ref<BatchStatus>("idle");
  const latestImage = ref<string | undefined>();

  const pauseRequested = ref(false);
  const cancelRequested = ref(false);

  const batchMeta = ref<{ id: string; title: string; createdAt: string } | null>(null);

  const isRunning = computed(() => status.value === "running");
  const progress = computed(() => {
    const total = tasks.value.length || 1;
    const done = tasks.value.filter(
      (t) => t.status === "succeeded" || t.status === "failed" || t.status === "skipped",
    ).length;
    return Math.round((done / total) * 100);
  });
  const succeededCount = computed(() => tasks.value.filter((t) => t.status === "succeeded").length);
  const failedCount = computed(() => tasks.value.filter((t) => t.status === "failed").length);

  function buildTasks(): BatchTask[] | null {
    if (mode.value === "same") {
      const prompt = masterPrompt.value.trim();
      if (!prompt) {
        ElMessage.warning("请填写主提示词。");
        return null;
      }
      const n = clampTaskCount(taskCount.value);
      const styleSuffix = styleLock.value.trim() ? `\n\n（统一风格：${styleLock.value.trim()}）` : "";
      return Array.from({ length: n }, (_, i) => ({
        id: generateId(),
        index: i,
        title: `变体 ${i + 1}`,
        prompt: prompt + styleSuffix,
        status: "pending" as const,
        attemptCount: 0,
        startedAt: "",
        completedAt: "",
        durationMs: 0,
        errorMessage: "",
        failureCategory: null,
      }));
    }

    // 自定义多条
    const prompts = customPrompts.value.map((p) => p.trim()).filter(Boolean);
    if (prompts.length === 0) {
      ElMessage.warning("请至少填写一条提示词。");
      return null;
    }
    return prompts.slice(0, MAX_BATCH_TASK_COUNT).map((prompt, i) => ({
      id: generateId(),
      index: i,
      title: `任务 ${i + 1}`,
      prompt,
      status: "pending" as const,
      attemptCount: 0,
      startedAt: "",
      completedAt: "",
      durationMs: 0,
      errorMessage: "",
      failureCategory: null,
    }));
  }

  function planTasks(): void {
    const built = buildTasks();
    if (!built) return;
    tasks.value = built;
    status.value = "idle";
    latestImage.value = undefined;
    ElMessage.success(`已生成 ${built.length} 个任务，确认后开始批量生成。`);
  }

  function addCustomPrompt(): void {
    if (customPrompts.value.length >= MAX_BATCH_TASK_COUNT) {
      ElMessage.warning(`最多 ${MAX_BATCH_TASK_COUNT} 条。`);
      return;
    }
    customPrompts.value.push("");
  }

  function removeCustomPrompt(index: number): void {
    if (customPrompts.value.length <= 1) return;
    customPrompts.value.splice(index, 1);
  }

  async function start(): Promise<void> {
    if (tasks.value.length === 0) {
      ElMessage.warning("请先生成任务列表。");
      return;
    }
    if (!configStore.isValid) {
      ElMessage.error("配置有误，请先到「设置」检查。");
      return;
    }

    pauseRequested.value = false;
    cancelRequested.value = false;
    status.value = "running";
    batchMeta.value = {
      id: generateId(),
      title: mode.value === "same" ? truncate(masterPrompt.value) : `自定义批量 ${new Date().toLocaleString()}`,
      createdAt: new Date().toISOString(),
    };

    // 重置待执行任务状态。
    tasks.value = tasks.value.map((t) => ({
      ...t,
      status: t.status === "succeeded" ? t.status : ("pending" as const),
      errorMessage: "",
      failureCategory: null,
      attemptCount: 0,
    }));

    const result = await runBatchTasks({
      batchId: batchMeta.value.id,
      batchTitle: batchMeta.value.title,
      batchCreatedAt: batchMeta.value.createdAt,
      config: configStore.config,
      tasks: tasks.value,
      executionConfig: {
        concurrency: concurrency.value,
        intervalSeconds: intervalSeconds.value,
        maxRetries: maxRetries.value,
      },
      referenceImages: referenceImages.value,
      onTaskUpdate: (updated) => {
        tasks.value = updated;
        const latest = updated.find((t) => t.status === "succeeded" && t.previewUrl);
        if (latest?.previewUrl) latestImage.value = latest.previewUrl;
      },
      shouldCancel: () => cancelRequested.value,
      shouldPause: () => pauseRequested.value,
    });

    tasks.value = result.tasks;
    status.value = result.status;

    // 写入历史。
    await persistBatchHistory(result.tasks);

    if (result.status === "completed") {
      ElMessage.success(`批量完成：成功 ${succeededCount.value} / 失败 ${failedCount.value}。`);
    } else if (result.status === "paused" && result.pauseReason) {
      ElMessageBox.alert(
        `批次已暂停：${result.pauseReason.message}（${result.pauseReason.failureCategory}）`,
        "批次暂停",
        { type: "warning" },
      );
    } else if (result.status === "cancelled") {
      ElMessage.info("批次已取消。");
    }
  }

  function pause(): void {
    pauseRequested.value = true;
  }

  function cancel(): void {
    cancelRequested.value = true;
    pauseRequested.value = true;
  }

  async function retryFailed(): Promise<void> {
    tasks.value = tasks.value.map((t) =>
      t.status === "failed" || t.status === "skipped"
        ? { ...t, status: "pending", errorMessage: "", failureCategory: null, attemptCount: 0 }
        : t,
    );
    await start();
  }

  async function persistBatchHistory(finalTasks: BatchTask[]): Promise<void> {
    if (!batchMeta.value) return;
    const records: ImageRecord[] = [];
    for (const task of finalTasks) {
      if (task.status === "succeeded" && task.image) {
        records.push({
          id: generateId(),
          status: "success",
          createdAt: task.completedAt || new Date().toISOString(),
          prompt: task.prompt,
          optimizedPrompt: "",
          model: configStore.config.imageModel,
          size: configStore.config.defaultSize,
          format: configStore.config.defaultFormat,
          outputPath: buildOutputPath(
            configStore.config.outputDirectory,
            task.prompt,
            configStore.config.defaultFormat,
            new Date(task.completedAt || Date.now()),
          ),
          durationMs: task.durationMs,
          thumbnail: await makeThumbnail(task.image),
          batch: {
            id: batchMeta.value.id,
            title: batchMeta.value.title,
            createdAt: batchMeta.value.createdAt,
            taskId: task.id,
            taskIndex: task.index,
            taskTitle: task.title,
            totalTasks: finalTasks.length,
          },
        });
      } else if (task.status === "failed") {
        records.push({
          id: generateId(),
          status: "failed",
          createdAt: task.completedAt || new Date().toISOString(),
          prompt: task.prompt,
          optimizedPrompt: "",
          model: configStore.config.imageModel,
          size: configStore.config.defaultSize,
          format: configStore.config.defaultFormat,
          outputPath: "",
          durationMs: task.durationMs,
          errorMessage: task.errorMessage,
          batch: {
            id: batchMeta.value.id,
            title: batchMeta.value.title,
            createdAt: batchMeta.value.createdAt,
            taskId: task.id,
            taskIndex: task.index,
            taskTitle: task.title,
            totalTasks: finalTasks.length,
          },
        });
      }
    }
    if (records.length > 0) historyStore.addMany(records);
  }

  function reset(): void {
    tasks.value = [];
    status.value = "idle";
    latestImage.value = undefined;
  }

  return {
    mode,
    masterPrompt,
    taskCount,
    customPrompts,
    styleLock,
    referenceImages,
    concurrency,
    intervalSeconds,
    maxRetries,
    tasks,
    status,
    isRunning,
    progress,
    succeededCount,
    failedCount,
    latestImage,
    planTasks,
    addCustomPrompt,
    removeCustomPrompt,
    start,
    pause,
    cancel,
    retryFailed,
    reset,
  };
}

function clampTaskCount(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_BATCH_TASK_COUNT, Math.max(1, Math.round(value)));
}

function truncate(text: string, max = 20): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export { describeError };
