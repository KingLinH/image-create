// 供应商错误分类（移植/简化自参考项目 providerErrors.ts + batchRunner.classifyBatchFailure）
// 用于决定批量任务是否可重试、是否应整体暂停。

export type ProviderTransportKind = "timeout" | "network" | "http" | "parse";
export type ProviderErrorCategory =
  | "auth"
  | "rate_limit"
  | "timeout"
  | "network"
  | "validation"
  | "cost_risk"
  | "unknown";

export type ProviderErrorInput = {
  status?: number;
  kind?: ProviderTransportKind;
  message: string;
  code?: string;
  type?: string;
  responseBody?: string;
};

export function classifyProviderError(input: ProviderErrorInput): ProviderErrorCategory {
  const status = input.status;
  const message = `${input.message}\n${input.responseBody ?? ""}`.toLowerCase();
  const code = (input.code ?? "").toLowerCase();
  const type = (input.type ?? "").toLowerCase();

  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";

  if (code === "invalid_api_key" || type === "invalid_request_error" && /api key|unauthor|forbidden/.test(message)) {
    return "auth";
  }
  if (/rate limit|too many requests|quota|429/.test(message)) return "rate_limit";
  if (input.kind === "timeout" || /timed out|timeout/.test(message)) return "timeout";
  if (input.kind === "network" || /network|fetch failed|failed to fetch/.test(message)) return "network";
  if (status === 400 || status === 422 || /invalid|required|unsupported|bad request/.test(message)) {
    return "validation";
  }
  if (/insufficient|balance|payment|billing|credit/.test(message)) return "cost_risk";

  return "unknown";
}

// 批量失败分类 = 供应商分类的超集（多了「空图片响应 → cost_risk」的兜底）。
export type BatchFailureCategory = ProviderErrorCategory;

export function classifyBatchFailure(
  error: unknown,
  message: string,
): BatchFailureCategory {
  const details = error instanceof Error ? error : (error as Record<string, unknown>);
  const providerCategory = classifyProviderError({
    status: asNumber((details as Record<string, unknown>).status),
    kind: asKind((details as Record<string, unknown>).kind),
    message,
    code: asString((details as Record<string, unknown>).code),
    type: asString((details as Record<string, unknown>).type),
    responseBody: asString((details as Record<string, unknown>).responseBody),
  });

  if (providerCategory !== "unknown") return providerCategory;

  if (/did not contain any image data|no image data|empty image response/i.test(message)) return "cost_risk";
  if (/timed out|timeout/i.test(message)) return "timeout";
  if (/network|fetch failed|failed to fetch/i.test(message)) return "network";
  if (/valid|invalid|required|unsupported/i.test(message)) return "validation";

  return "unknown";
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function asKind(value: unknown): ProviderTransportKind | undefined {
  return value === "timeout" || value === "network" || value === "http" || value === "parse"
    ? (value as ProviderTransportKind)
    : undefined;
}

export function isRetryableFailure(category: BatchFailureCategory): boolean {
  return category === "rate_limit" || category === "timeout" || category === "network";
}

export function shouldPauseBatch(category: BatchFailureCategory): boolean {
  return category === "auth" || category === "cost_risk";
}
