import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { groupHistoryRecordsForDisplay, type ImageRecord } from "@/core/history";
import { readJson, writeJson } from "@/core/storage";

const STORAGE_KEY = "gpt-image-2:history";
const MAX_RECORDS = 300; // 防止 localStorage 爆掉

export const useHistoryStore = defineStore("history", () => {
  const records = ref<ImageRecord[]>(loadStored());
  const displayItems = ref(groupHistoryRecordsForDisplay(records.value));

  function refreshDisplay(): void {
    displayItems.value = groupHistoryRecordsForDisplay(records.value);
  }

  watch(
    records,
    (value) => {
      writeJson(STORAGE_KEY, value);
      refreshDisplay();
    },
    { deep: true },
  );

  function add(record: ImageRecord): void {
    records.value = [record, ...records.value].slice(0, MAX_RECORDS);
    refreshDisplay();
  }

  function addMany(newRecords: ImageRecord[]): void {
    records.value = [...newRecords, ...records.value].slice(0, MAX_RECORDS);
    refreshDisplay();
  }

  function remove(id: string): void {
    records.value = records.value.filter((r) => r.id !== id);
    refreshDisplay();
  }

  function clear(): void {
    records.value = [];
    refreshDisplay();
  }

  return { records, displayItems, add, addMany, remove, clear, refreshDisplay };
});

function loadStored(): ImageRecord[] {
  return readJson<ImageRecord[]>(STORAGE_KEY, []);
}
