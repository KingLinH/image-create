import { defineStore } from "pinia";
import { computed, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { groupHistoryRecordsForDisplay, generateId, type ImageRecord } from "@/core/history";
import { readJson, writeJson, downloadImage, makeThumbnail } from "@/core/storage";
import { saveImage, getImage, getThumb, deleteImage, clearImages } from "@/core/imageStore";
import { slugifyPrompt } from "@/core/fileNames";
import type { ParsedImage } from "@/core/api";

const STORAGE_KEY = "gpt-image-2:history";
const MAX_RECORDS = 300;

// 旧版记录可能带 thumbnail 字段（迁移用）。
type LegacyRecord = ImageRecord & { thumbnail?: string };

export const useHistoryStore = defineStore("history", () => {
  const records = ref<ImageRecord[]>([]);
  const displayItems = ref(groupHistoryRecordsForDisplay([]));
  const projectFilter = ref("");
  // id -> 缩略图 data URL（从 IndexedDB 异步载入）
  const thumbnailById = reactive<Record<string, string>>({});

  // 所有出现过的项目名（用于历史页筛选下拉）。
  const projects = computed(() => {
    const set = new Set<string>();
    for (const r of records.value) if (r.project) set.add(r.project);
    return Array.from(set);
  });

  function filteredRecords(): ImageRecord[] {
    const f = projectFilter.value.trim();
    if (!f) return records.value;
    return records.value.filter((r) => (r.project ?? "") === f);
  }

  function refreshDisplay(): void {
    displayItems.value = groupHistoryRecordsForDisplay(filteredRecords());
  }

  function setProjectFilter(name: string): void {
    projectFilter.value = name;
    refreshDisplay();
  }

  function persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records.value));
    } catch {
      // 配额超限：保留较新的一半并重试一次，给用户可见提示。
      const trimmed = records.value.slice(0, Math.floor(MAX_RECORDS / 2));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        ElMessage.warning("本地历史已接近存储上限，已自动清理较旧记录。");
      } catch {
        ElMessage.warning("本地存储已满，历史未能保存。");
      }
    }
  }

  function load(): void {
    const stored = readJson<LegacyRecord[]>(STORAGE_KEY, []);
    // 一次性迁移：旧记录的 thumbnail 搬进 IndexedDB，元数据里剔除该字段。
    records.value = stored
      .slice(0, MAX_RECORDS)
      .map((r) => {
        if (r.thumbnail) {
          void saveImage(r.id, {
            full: { base64: stripDataPrefix(r.thumbnail) },
            thumb: r.thumbnail,
          });
        }
        const { thumbnail: _omit, ...rest } = r;
        return rest as ImageRecord;
      });
    refreshDisplay();
  }

  load();

  async function add(record: ImageRecord, image?: ParsedImage): Promise<void> {
    records.value = [record, ...records.value].slice(0, MAX_RECORDS);
    persist();
    refreshDisplay();
    if (image) {
      const thumb = (await makeThumbnail(image)) ?? "";
      await saveImage(record.id, { full: image, thumb });
      if (thumb) thumbnailById[record.id] = thumb;
    }
  }

  async function addMany(
    newRecords: ImageRecord[],
    images?: Record<string, ParsedImage>,
  ): Promise<void> {
    records.value = [...newRecords, ...records.value].slice(0, MAX_RECORDS);
    persist();
    refreshDisplay();
    if (images) {
      for (const rec of newRecords) {
        const image = images[rec.id];
        if (image) {
          const thumb = (await makeThumbnail(image)) ?? "";
          await saveImage(rec.id, { full: image, thumb });
          if (thumb) thumbnailById[rec.id] = thumb;
        }
      }
    }
  }

  async function remove(id: string): Promise<void> {
    records.value = records.value.filter((r) => r.id !== id);
    persist();
    refreshDisplay();
    delete thumbnailById[id];
    await deleteImage(id);
  }

  async function clear(): Promise<void> {
    records.value = [];
    writeJson(STORAGE_KEY, []);
    refreshDisplay();
    for (const key of Object.keys(thumbnailById)) delete thumbnailById[key];
    await clearImages();
  }

  // 按当前记录批量载入缩略图（供历史页预览）。
  async function hydrateThumbnails(): Promise<void> {
    const ids = records.value.map((r) => r.id).filter((id) => !(id in thumbnailById));
    await Promise.all(
      ids.map(async (id) => {
        const thumb = await getThumb(id);
        if (thumb) thumbnailById[id] = thumb;
      }),
    );
  }

  // 从 IndexedDB 取原图并触发下载（历史页「下载」按钮）。
  async function downloadOriginal(record: ImageRecord): Promise<void> {
    const entry = await getImage(record.id);
    if (!entry?.full) {
      ElMessage.warning("该记录没有可下载的原图。");
      return;
    }
    const ext = record.format || "png";
    const name = `${slugifyPrompt(record.prompt)}-${record.id.slice(-6)}.${ext}`;
    try {
      await downloadImage(entry.full, name, ext);
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : "下载失败。");
    }
  }

  return {
    records,
    displayItems,
    thumbnailById,
    projects,
    projectFilter,
    setProjectFilter,
    add,
    addMany,
    remove,
    clear,
    hydrateThumbnails,
    downloadOriginal,
    refreshDisplay,
  };
});

function stripDataPrefix(dataUrl: string): string | undefined {
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : undefined;
}

export { generateId };
