// 应用配置（移植自参考项目 src/core/config.ts）
// 注意：批量执行的默认值/约束也定义在这里，避免与 batch.ts 形成循环依赖。

import {
  isImageOutputFormat,
  isImageQuality,
  validateImageSize,
  type ImageOutputFormat,
  type ImageQuality,
} from "./imageOptions";

export type AppConfig = {
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
  timeoutSeconds: number;
  outputDirectory: string;
  defaultSize: string;
  defaultCount: number;
  defaultQuality: ImageQuality;
  defaultFormat: ImageOutputFormat;
  defaultCompression: number;
  batchDefaultTaskCount: number;
  batchDefaultConcurrency: number;
  batchDefaultIntervalSeconds: number;
  batchDefaultMaxRetries: number;
};

export type ValidationResult = { errors: string[]; warnings: string[] };

// ---- 批量执行约束 ----
export const MAX_BATCH_TASK_COUNT = 20;
export const MIN_BATCH_TASK_COUNT = 1;
export const MAX_BATCH_CONCURRENCY = 8;
export const MAX_BATCH_INTERVAL_SECONDS = 60;
export const MAX_BATCH_RETRIES = 5;

export type BatchExecutionConfig = {
  concurrency: number;
  intervalSeconds: number;
  maxRetries: number;
};

export const DEFAULT_BATCH_EXECUTION_CONFIG: BatchExecutionConfig = {
  concurrency: 2,
  intervalSeconds: 3,
  maxRetries: 1,
};

export function clampBatchTaskCount(value: number): number {
  if (!Number.isFinite(value)) return 4;
  return Math.min(MAX_BATCH_TASK_COUNT, Math.max(MIN_BATCH_TASK_COUNT, Math.round(value)));
}

export function clampBatchExecutionConfig(input: Partial<BatchExecutionConfig>): BatchExecutionConfig {
  const concurrency = clampInt(input.concurrency, 1, MAX_BATCH_CONCURRENCY, DEFAULT_BATCH_EXECUTION_CONFIG.concurrency);
  const intervalSeconds = clampInt(
    input.intervalSeconds,
    0,
    MAX_BATCH_INTERVAL_SECONDS,
    DEFAULT_BATCH_EXECUTION_CONFIG.intervalSeconds,
  );
  const maxRetries = clampInt(input.maxRetries, 0, MAX_BATCH_RETRIES, DEFAULT_BATCH_EXECUTION_CONFIG.maxRetries);
  return { concurrency, intervalSeconds, maxRetries };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export const DEFAULT_CONFIG: AppConfig = {
  baseUrl: "https://ruoli.dev/v1",
  apiKey: "",
  textModel: "gpt-5.4-mini",
  imageModel: "gpt-image-2",
  timeoutSeconds: 180,
  outputDirectory: "outputs",
  defaultSize: "1024x1024",
  defaultCount: 1,
  defaultQuality: "auto",
  defaultFormat: "png",
  defaultCompression: 90,
  batchDefaultTaskCount: 4,
  batchDefaultConcurrency: DEFAULT_BATCH_EXECUTION_CONFIG.concurrency,
  batchDefaultIntervalSeconds: DEFAULT_BATCH_EXECUTION_CONFIG.intervalSeconds,
  batchDefaultMaxRetries: DEFAULT_BATCH_EXECUTION_CONFIG.maxRetries,
};

export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_CONFIG.baseUrl;
  if (trimmed.endsWith("/v1")) return trimmed;
  return `${trimmed}/v1`;
}

type MaybeConfig = Partial<Record<keyof AppConfig, unknown>>;

export function mergeConfig(value: MaybeConfig | null | undefined): AppConfig {
  const source = (value ?? {}) as MaybeConfig;
  const merged: AppConfig = { ...DEFAULT_CONFIG };

  for (const key of Object.keys(source) as (keyof AppConfig)[]) {
    const fieldValue = source[key];
    if (fieldValue !== undefined) {
      (merged as Record<string, unknown>)[key] = fieldValue;
    }
  }

  merged.baseUrl = normalizeBaseUrl(asString(merged.baseUrl));
  merged.timeoutSeconds = asNumber(merged.timeoutSeconds) || DEFAULT_CONFIG.timeoutSeconds;
  merged.defaultCount = clampInt(merged.defaultCount, 1, 4, DEFAULT_CONFIG.defaultCount);
  merged.defaultCompression = clampInt(merged.defaultCompression, 0, 100, DEFAULT_CONFIG.defaultCompression);
  merged.defaultQuality = isImageQuality(merged.defaultQuality) ? merged.defaultQuality : DEFAULT_CONFIG.defaultQuality;
  merged.defaultFormat = isImageOutputFormat(merged.defaultFormat) ? merged.defaultFormat : DEFAULT_CONFIG.defaultFormat;
  merged.batchDefaultTaskCount = clampBatchTaskCount(asNumber(merged.batchDefaultTaskCount));
  const exec = clampBatchExecutionConfig({
    concurrency: asNumber(merged.batchDefaultConcurrency),
    intervalSeconds: asNumber(merged.batchDefaultIntervalSeconds),
    maxRetries: asNumber(merged.batchDefaultMaxRetries),
  });
  merged.batchDefaultConcurrency = exec.concurrency;
  merged.batchDefaultIntervalSeconds = exec.intervalSeconds;
  merged.batchDefaultMaxRetries = exec.maxRetries;

  return merged;
}

export function validateConfig(config: AppConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const c = config as MaybeConfig;

  try {
    new URL(normalizeBaseUrl(asString(c.baseUrl)));
  } catch {
    errors.push("Base URL 不是合法的网址。");
  }
  if (!asString(c.apiKey).trim()) errors.push("API Key 不能为空。");
  if (!asString(c.textModel).trim()) errors.push("文字模型名不能为空。");
  if (!asString(c.imageModel).trim()) errors.push("图片模型名不能为空。");

  const timeout = asNumber(c.timeoutSeconds);
  if (!Number.isFinite(timeout) || timeout < 180) errors.push("超时时间至少为 180 秒。");

  const count = asNumber(c.defaultCount);
  if (!Number.isInteger(count) || count < 1 || count > 4) errors.push("图片数量须在 1 ~ 4 之间。");

  const sizeValidation = validateImageSize(asString(c.defaultSize));
  if (sizeValidation.error) errors.push(sizeValidation.error);
  if (!isImageQuality(asString(c.defaultQuality))) errors.push("质量必须为 auto/low/medium/high。");
  if (!isImageOutputFormat(asString(c.defaultFormat))) errors.push("格式必须为 png/jpeg/webp。");

  const compression = asNumber(c.defaultCompression);
  if (!Number.isInteger(compression) || compression < 0 || compression > 100) {
    errors.push("压缩率须为 0 ~ 100 的整数。");
  }

  if (!asString(c.outputDirectory).trim()) warnings.push("输出目录为空，将默认使用 outputs/。");
  if (sizeValidation.warning) warnings.push(sizeValidation.warning);

  return { errors, warnings };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}
