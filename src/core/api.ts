// API 客户端（移植自参考项目 src/core/apiClient.ts）
// 纯浏览器 fetch，所有请求带 Authorization: Bearer。无后端。

import { isCompressionFormat, type ImageOutputFormat, type ImageQuality } from "./imageOptions";
import { normalizeBaseUrl, type AppConfig } from "./config";

export type TextRequestInput = {
  model: string;
  input: Array<{ role: "system" | "user" | "assistant"; content: string }>;
};

export type ChatRequestInput = { model: string; system: string; user: string };

export type ImageRequestInput = {
  model: string;
  prompt: string;
  size: string;
  quality: ImageQuality;
  n: number;
  outputFormat: ImageOutputFormat;
  outputCompression: number;
};

export type ImageEditRequestInput = ImageRequestInput & { referenceImages: File[] };

export type ParsedImage = {
  base64?: string;
  url?: string;
  revisedPrompt?: string;
};

export type ApiClientErrorKind = "timeout" | "http" | "network" | "parse";

export class ApiClientError extends Error {
  kind: ApiClientErrorKind;
  status?: number;
  responseBody?: string;

  constructor(
    message: string,
    options: { kind: ApiClientErrorKind; status?: number; responseBody?: string },
  ) {
    super(message);
    this.name = "ApiClientError";
    this.kind = options.kind;
    this.status = options.status;
    this.responseBody = options.responseBody;
  }
}

type JsonRecord = Record<string, unknown>;

// ---- 请求体构造 ----

export function buildResponsesRequest({ model, input }: TextRequestInput) {
  return { model, input };
}

export function buildChatCompletionsRequest({ model, system, user }: ChatRequestInput) {
  return {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}

export function buildImageGenerationRequest(input: ImageRequestInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    size: input.size,
    quality: input.quality,
    n: input.n,
    output_format: input.outputFormat,
  };
  if (isCompressionFormat(input.outputFormat)) {
    payload.output_compression = input.outputCompression;
  }
  return payload;
}

export function buildImageEditRequest(input: ImageEditRequestInput): FormData {
  const payload = new FormData();
  payload.set("model", input.model);
  payload.set("prompt", input.prompt);
  payload.set("size", input.size);
  payload.set("quality", input.quality);
  payload.set("n", String(input.n));
  payload.set("output_format", input.outputFormat);
  if (isCompressionFormat(input.outputFormat)) {
    payload.set("output_compression", String(input.outputCompression));
  }
  for (const image of input.referenceImages) {
    payload.append("image[]", image, image.name);
  }
  return payload;
}

// ---- 响应解析 ----

export function parseTextResponse(payload: unknown): string {
  const record = asRecord(payload);
  const outputText = asString(record.output_text);
  if (outputText) return outputText;

  const output = Array.isArray(record.output) ? record.output : [];
  const segments: string[] = [];
  for (const item of output) {
    const itemRecord = asRecord(item);
    const content = Array.isArray(itemRecord.content) ? itemRecord.content : [];
    for (const part of content) {
      const text = readChatContentPart(asRecord(part));
      if (text) segments.push(text);
    }
  }
  if (segments.length > 0) return segments.join("\n");

  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice.message);
  const content = message.content;

  if (typeof content === "string" && content) return content;
  if (Array.isArray(content)) {
    const combined = content
      .map((part) => readChatContentPart(asRecord(part)))
      .filter(Boolean)
      .join("\n")
      .trim();
    if (combined) return combined;
  }

  throw new ApiClientError("文字响应不包含可读取的内容。", { kind: "parse" });
}

export function parseImageGenerationResponse(payload: unknown): ParsedImage[] {
  const record = asRecord(payload);
  const providerError = readProviderErrorMessage(record);
  if (providerError) throw new ApiClientError(providerError, { kind: "http" });

  const data = Array.isArray(record.data) ? record.data : [];
  const images = data
    .map((entry): ParsedImage | null => {
      const item = asRecord(entry);
      const parsed: ParsedImage = {};
      const base64 = firstNonEmptyString(item.b64_json, item.base64, item.image_base64);
      const url = firstNonEmptyString(item.url, item.image_url);
      const revisedPrompt = asString(item.revised_prompt);
      if (base64) parsed.base64 = base64;
      if (url) parsed.url = url;
      if (revisedPrompt) parsed.revisedPrompt = revisedPrompt;
      return parsed.base64 || parsed.url ? parsed : null;
    })
    .filter((item): item is ParsedImage => item !== null);

  if (images.length > 0) return images;
  throw new ApiClientError("图片生成响应不包含任何图片数据。", { kind: "parse" });
}

// ---- 带超时的请求 ----

export async function requestJsonWithTimeout(
  config: AppConfig,
  path: string,
  body: unknown,
): Promise<unknown> {
  const { controller, timeoutId } = startTimeout(config);
  try {
    const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const details = await readResponseText(response);
      throw new ApiClientError(`请求失败，状态码 ${response.status}${details ? `：${details}` : ""}`, {
        kind: "http",
        status: response.status,
        responseBody: details,
      });
    }
    return response.json();
  } catch (error) {
    throw wrapFetchError(error, config, controller);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function requestMultipartWithTimeout(
  config: AppConfig,
  path: string,
  body: FormData,
): Promise<unknown> {
  const { controller, timeoutId } = startTimeout(config);
  try {
    const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      const details = await readResponseText(response);
      throw new ApiClientError(`请求失败，状态码 ${response.status}${details ? `：${details}` : ""}`, {
        kind: "http",
        status: response.status,
        responseBody: details,
      });
    }
    return response.json();
  } catch (error) {
    throw wrapFetchError(error, config, controller);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---- 高层 API ----

export async function sendTextRequest(config: AppConfig, system: string, user: string): Promise<string> {
  try {
    const payload = await requestJsonWithTimeout(config, "/responses", buildResponsesRequest({
      model: config.textModel,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }));
    return parseTextResponse(payload);
  } catch (error) {
    if (!shouldFallbackToChatCompletions(error)) throw error;
    const payload = await requestJsonWithTimeout(config, "/chat/completions", buildChatCompletionsRequest({
      model: config.textModel,
      system,
      user,
    }));
    return parseTextResponse(payload);
  }
}

export function testTextModel(config: AppConfig): Promise<string> {
  return sendTextRequest(config, "你是一个连通性测试助手，请简短回复。", "请回复 OK。");
}

export function optimizePrompt(config: AppConfig, prompt: string): Promise<string> {
  return sendTextRequest(
    config,
    "你负责优化用于图像生成的提示词。直接返回优化后的提示词，不要任何解释或前后缀。",
    prompt,
  );
}

export async function generateImages(
  config: AppConfig,
  prompt: string,
  options?: { referenceImages?: File[] },
): Promise<ParsedImage[]> {
  const referenceImages = options?.referenceImages?.filter((file) => file instanceof File) ?? [];
  const payload =
    referenceImages.length > 0
      ? await requestMultipartWithTimeout(config, "/images/edits", buildImageEditRequest({
          model: config.imageModel,
          prompt,
          size: config.defaultSize,
          quality: config.defaultQuality,
          n: config.defaultCount,
          outputFormat: config.defaultFormat,
          outputCompression: config.defaultCompression,
          referenceImages,
        }))
      : await requestJsonWithTimeout(config, "/images/generations", buildImageGenerationRequest({
          model: config.imageModel,
          prompt,
          size: config.defaultSize,
          quality: config.defaultQuality,
          n: config.defaultCount,
          outputFormat: config.defaultFormat,
          outputCompression: config.defaultCompression,
        }));
  return parseImageGenerationResponse(payload);
}

export function testImageModel(config: AppConfig): Promise<ParsedImage[]> {
  return generateImages(config, "一张纯色方块色卡图。");
}

// ---- 内部工具 ----

function startTimeout(config: AppConfig): { controller: AbortController; timeoutId: ReturnType<typeof setTimeout> } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutSeconds * 1_000);
  return { controller, timeoutId };
}

function wrapFetchError(error: unknown, config: AppConfig, controller: AbortController): Error {
  if (error instanceof ApiClientError) return error;
  if (controller.signal.aborted || isAbortError(error)) {
    return new ApiClientError(`请求在 ${config.timeoutSeconds} 秒后超时。`, { kind: "timeout" });
  }
  return new ApiClientError(error instanceof Error ? error.message : "请求失败。", { kind: "network" });
}

function shouldFallbackToChatCompletions(error: unknown): boolean {
  if (!(error instanceof ApiClientError) || error.kind !== "http") return false;
  if (error.status !== 404 && error.status !== 405 && error.status !== 501) return false;
  const haystack = `${error.message}\n${error.responseBody ?? ""}`.toLowerCase();
  return (
    haystack.includes("unsupported endpoint") ||
    haystack.includes("unsupported route") ||
    haystack.includes("unsupported path") ||
    haystack.includes("unknown endpoint") ||
    haystack.includes("unknown route") ||
    haystack.includes("unknown path") ||
    haystack.includes("endpoint not implemented") ||
    haystack.includes("route not implemented") ||
    haystack.includes("path not implemented") ||
    haystack.includes("method not allowed") ||
    haystack.includes("no route")
  );
}

function readChatContentPart(part: { type?: string; text?: string }): string {
  if (part.type === "output_text" || part.type === "text") return asString(part.text);
  return "";
}

function readProviderErrorMessage(record: JsonRecord): string {
  const error = asRecord(record.error);
  return firstNonEmptyString(error.message, error.code, record.message);
}

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" ? (value as JsonRecord) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const text = asString(value).trim();
    if (text) return text;
  }
  return "";
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === "AbortError";
  return asRecord(error).name === "AbortError";
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return (await response.text()).trim().slice(0, 1000);
  } catch {
    return "";
  }
}
