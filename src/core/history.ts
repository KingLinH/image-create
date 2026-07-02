// 历史记录类型与分组（移植自参考项目 src/core/history.ts）

import { formatDateFolder } from "./fileNames";

export type ImageRecordStatus = "success" | "failed" | "cancelled";

export type ImageRecord = {
  id: string;
  status: ImageRecordStatus;
  createdAt: string; // ISO
  prompt: string;
  optimizedPrompt: string;
  model: string;
  size: string;
  format: string;
  outputPath: string;
  durationMs: number;
  errorMessage?: string;
  project?: string;
  batch?: {
    id: string;
    title: string;
    createdAt: string;
    taskId: string;
    taskIndex: number;
    taskTitle: string;
    totalTasks?: number;
  };
};

export type HistoryGroup = { date: string; records: ImageRecord[] };

export type HistoryDisplayItem =
  | { type: "record"; record: ImageRecord }
  | {
      type: "batch";
      id: string;
      title: string;
      createdAt: string;
      records: ImageRecord[];
      totalTasks?: number;
    };

export function sortHistoryNewestFirst(records: ImageRecord[]): ImageRecord[] {
  return [...records].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function groupHistoryByDate(records: ImageRecord[]): HistoryGroup[] {
  const groups = new Map<string, ImageRecord[]>();
  for (const record of sortHistoryNewestFirst(records)) {
    const date = getHistoryGroupDate(record);
    const existing = groups.get(date);
    if (existing) existing.push(record);
    else groups.set(date, [record]);
  }
  return Array.from(groups, ([date, recs]) => ({ date, records: recs }));
}

export function groupHistoryRecordsForDisplay(records: ImageRecord[]): HistoryDisplayItem[] {
  const sorted = sortHistoryNewestFirst(records);
  const items: HistoryDisplayItem[] = [];
  const batchItems = new Map<string, Extract<HistoryDisplayItem, { type: "batch" }>>();

  for (const record of sorted) {
    if (!record.batch) {
      items.push({ type: "record", record });
      continue;
    }
    const existing = batchItems.get(record.batch.id);
    if (existing) {
      existing.records.push(record);
      existing.records.sort(compareBatchRecords);
      continue;
    }
    const batchItem: Extract<HistoryDisplayItem, { type: "batch" }> = {
      type: "batch",
      id: record.batch.id,
      title: record.batch.title,
      createdAt: record.batch.createdAt,
      records: [record],
      totalTasks: record.batch.totalTasks,
    };
    batchItems.set(record.batch.id, batchItem);
    items.push(batchItem);
  }
  return items;
}

function compareBatchRecords(a: ImageRecord, b: ImageRecord): number {
  const ai = a.batch?.taskIndex ?? 0;
  const bi = b.batch?.taskIndex ?? 0;
  if (ai !== bi) return ai - bi;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function getHistoryGroupDate(record: ImageRecord): string {
  const matched = record.outputPath.match(/(?:^|[\\/])(\d{4}-\d{2}-\d{2})(?:[\\/]|$)/)?.[1];
  if (matched) return matched;
  return formatDateFolder(new Date(record.createdAt));
}

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
