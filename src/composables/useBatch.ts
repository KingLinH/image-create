import { computed, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { runBatchTasks, type BatchStatus, type BatchTask } from "@/core/batch";
import { useConfigStore } from "@/stores/config";
import { useHistoryStore } from "@/stores/history";
import { useProjectsStore } from "@/stores/projects";
import { buildOutputPath } from "@/core/fileNames";
import { generateId, type ImageRecord } from "@/core/history";
import { describeError } from "./useImageGeneration";
import type { ParsedImage } from "@/core/api";
import {
  BUILT_IN_SPLIT_TEMPLATES,
  splitPromptWithTextModel,
  type SplitTemplateId,
} from "@/core/promptSplitter";
import { MAX_BATCH_TASK_COUNT } from "@/core/config";

export const SPLIT_TEMPLATES = BUILT_IN_SPLIT_TEMPLATES;

export type BatchMode = "same" | "custom" | "split";

export function useBatch() {
  const configStore = useConfigStore();
  const historyStore = useHistoryStore();
  const projectStore = useProjectsStore();

  const mode = ref<BatchMode>("same");
  const masterPrompt = ref("");
  const taskCount = ref(configStore.config.batchDefaultTaskCount);
  const customPrompts = ref<string[]>([""]);
  const styleLock = ref("");

  // AI 拆分相关状态
  const splitMasterPrompt = ref("");
  const splitCount = ref(configStore.config.batchDefaultTaskCount);
  const splitTemplate = ref<SplitTemplateId>("basic");
  const splitting = ref(false);
  const splitInfo = ref<{ recommendedCount?: number; countReason?: string } | null>(null);

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

  // 批量粘贴导入：每行一条提示词，去空去重，上限 MAX_BATCH_TASK_COUNT。
  function bulkImport(text: string): number {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const deduped = Array.from(new Set(lines)).slice(0, MAX_BATCH_TASK_COUNT);
    if (deduped.length === 0) {
      ElMessage.warning("没有可导入的提示词。");
      return 0;
    }
    customPrompts.value = deduped;
    mode.value = "custom";
    tasks.value = [];
    status.value = "idle";
    ElMessage.success(`已导入 ${deduped.length} 条提示词。`);
    return deduped.length;
  }

  // AI 拆分：主提示词 → 文字模型拆成多条子任务，填入 customPrompts 供人工 review。
  async function runSplit(): Promise<void> {
    if (!splitMasterPrompt.value.trim()) {
      ElMessage.warning("请填写要拆分的主提示词。");
      return;
    }
    if (!configStore.isValid) {
      ElMessage.error("配置有误，请先到「设置」检查。");
      return;
    }
    splitting.value = true;
    splitInfo.value = null;
    try {
      const result = await splitPromptWithTextModel({
        config: configStore.config,
        masterPrompt: splitMasterPrompt.value,
        count: splitCount.value,
        templateId: splitTemplate.value,
        styleLock: styleLock.value,
      });
      customPrompts.value = result.items.map((it) => it.prompt);
      splitCount.value = result.recommendedCount ?? result.items.length;
      splitInfo.value = {
        recommendedCount: result.recommendedCount,
        countReason: result.countReason,
      };
      mode.value = "custom";
      tasks.value = [];
      status.value = "idle";
      ElMessage.success(`AI 拆分完成，共 ${result.items.length} 条，已转入自定义模式可编辑。`);
    } catch (error) {
      ElMessage.error(`AI 拆分失败：${describeError(error)}`);
    } finally {
      splitting.value = false;
    }
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
    const images: Record<string, ParsedImage> = {};
    const batchCtx = {
      id: batchMeta.value.id,
      title: batchMeta.value.title,
      createdAt: batchMeta.value.createdAt,
      totalTasks: finalTasks.length,
    };
    for (const task of finalTasks) {
      if (task.status !== "succeeded" && task.status !== "failed") continue;
      const id = generateId();
      const succeeded = task.status === "succeeded" && !!task.image;
      records.push({
        id,
        status: succeeded ? "success" : "failed",
        createdAt: task.completedAt || new Date().toISOString(),
        prompt: task.prompt,
        optimizedPrompt: "",
        model: configStore.config.imageModel,
        size: configStore.config.defaultSize,
        format: configStore.config.defaultFormat,
        outputPath: succeeded
          ? buildOutputPath(
              configStore.config.outputDirectory,
              task.prompt,
              configStore.config.defaultFormat,
              new Date(task.completedAt || Date.now()),
            )
          : "",
        durationMs: task.durationMs,
        errorMessage: succeeded ? undefined : task.errorMessage,
        project: projectStore.current || undefined,
        batch: {
          ...batchCtx,
          taskId: task.id,
          taskIndex: task.index,
          taskTitle: task.title,
        },
      });
      if (succeeded && task.image) images[id] = task.image;
    }
    if (records.length > 0) await historyStore.addMany(records, images);
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
    splitMasterPrompt,
    splitCount,
    splitTemplate,
    splitting,
    splitInfo,
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
    bulkImport,
    runSplit,
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
