// 批量任务执行（移植自参考项目 src/core/batchRunner.ts）
// 并发队列、按错误类型重试、auth/cost_risk 整体暂停、可取消/暂停。

import { generateImages as defaultGenerateImages, type ParsedImage } from "./api";
import { clampBatchExecutionConfig, type AppConfig, type BatchExecutionConfig } from "./config";
import {
  classifyBatchFailure,
  isRetryableFailure,
  shouldPauseBatch,
  type BatchFailureCategory,
} from "./providerErrors";

export type BatchStatus = "idle" | "running" | "paused" | "cancelled" | "completed";

export type BatchTaskStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

export type BatchTask = {
  id: string;
  index: number;
  title: string;
  prompt: string;
  status: BatchTaskStatus;
  attemptCount: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  errorMessage: string;
  failureCategory: BatchFailureCategory | null;
  image?: ParsedImage; // 成功后的图片（内存，便于即时预览/下载）
  previewUrl?: string; // = image.base64 data url 或 image.url
};

export type RunBatchTasksInput = {
  batchId: string;
  batchTitle: string;
  batchCreatedAt: string;
  config: AppConfig;
  tasks: BatchTask[];
  executionConfig: BatchExecutionConfig;
  referenceImages: File[];
  getTaskReferenceImages?: (task: BatchTask) => File[];
  generateImages?: typeof defaultGenerateImages;
  onTaskUpdate?: (tasks: BatchTask[]) => void;
  shouldCancel?: () => boolean;
  shouldPause?: () => boolean;
};

export type PauseReason = {
  taskId: string;
  failureCategory: BatchFailureCategory;
  message: string;
} | null;

export type RunBatchTasksResult = {
  status: BatchStatus;
  tasks: BatchTask[];
  pauseReason: PauseReason;
};

export async function runBatchTasks(input: RunBatchTasksInput): Promise<RunBatchTasksResult> {
  const tasks = input.tasks.map((task) => ({ ...task }));
  const executionConfig = clampBatchExecutionConfig(input.executionConfig);
  const runnableCount = Math.max(1, Math.min(executionConfig.concurrency, tasks.length || 1));
  let nextIndex = 0;
  let stoppedStatus: BatchStatus | null = null;
  let pauseReason: PauseReason = null;

  async function worker() {
    while (!stoppedStatus) {
      if (input.shouldCancel?.()) {
        stoppedStatus = "cancelled";
        markRemainingSkipped(tasks);
        notify(input, tasks);
        return;
      }
      if (input.shouldPause?.()) {
        stoppedStatus = "paused";
        notify(input, tasks);
        return;
      }

      const task = takeNextRunnableTask(tasks, () => nextIndex++);
      if (!task) return;

      tasks[task.index] = {
        ...task,
        status: "running",
        attemptCount: Math.max(1, task.attemptCount + 1),
        errorMessage: "",
        failureCategory: null,
        startedAt: new Date().toISOString(),
        completedAt: "",
      };
      notify(input, tasks);

      const updated = await runOneTask({ ...input, executionConfig }, task);
      tasks[task.index] = updated;
      notify(input, tasks);

      if (shouldPauseBatch(updated.failureCategory ?? "unknown")) {
        stoppedStatus = "paused";
        pauseReason = {
          taskId: updated.id,
          failureCategory: updated.failureCategory!,
          message: updated.errorMessage,
        };
        return;
      }

      if (executionConfig.intervalSeconds > 0 && !stoppedStatus) {
        await delay(executionConfig.intervalSeconds * 1000);
      }
    }
  }

  await Promise.all(Array.from({ length: runnableCount }, () => worker()));

  return { status: stoppedStatus ?? "completed", tasks, pauseReason };
}

async function runOneTask(input: RunBatchTasksInput, task: BatchTask): Promise<BatchTask> {
  const generateImages = input.generateImages ?? defaultGenerateImages;
  const maxAttempts = input.executionConfig.maxRetries + 1;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;
    const startedAt = new Date();
    const runningTask: BatchTask = {
      ...task,
      status: "running",
      attemptCount: attempt,
      errorMessage: "",
      failureCategory: null,
      startedAt: startedAt.toISOString(),
      completedAt: "",
    };

    try {
      const referenceImages = input.getTaskReferenceImages?.(runningTask) ?? input.referenceImages;
      const images = await generateImages(
        input.config,
        runningTask.prompt,
        referenceImages.length > 0 ? { referenceImages } : undefined,
      );
      const image = images[0];
      if (!image) throw new Error("图片生成响应不包含任何图片数据。");

      const durationMs = Date.now() - startedAt.getTime();
      return {
        ...runningTask,
        status: "succeeded",
        image,
        previewUrl: image.base64 ? `data:image/png;base64,${image.base64}` : image.url,
        durationMs,
        completedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "批量任务失败。";
      const failureCategory = classifyBatchFailure(error, message);
      const failedTask: BatchTask = {
        ...runningTask,
        status: "failed",
        errorMessage: message,
        failureCategory,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
      };
      if (!isRetryableFailure(failureCategory) || attempt >= maxAttempts) return failedTask;
    }
  }

  return {
    ...task,
    status: "failed",
    errorMessage: "批量任务在重试后仍失败。",
    failureCategory: "unknown",
  };
}

function takeNextRunnableTask(tasks: BatchTask[], next: () => number): BatchTask | null {
  while (true) {
    const index = next();
    if (index >= tasks.length) return null;
    const task = tasks[index];
    if (task.status === "pending" || task.status === "failed") return task;
  }
}

function markRemainingSkipped(tasks: BatchTask[]): void {
  for (const task of tasks) {
    if (task.status === "pending") task.status = "skipped";
  }
}

function notify(input: RunBatchTasksInput, tasks: BatchTask[]): void {
  input.onTaskUpdate?.(tasks.map((task) => ({ ...task })));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}
