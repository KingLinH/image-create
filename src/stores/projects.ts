import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { readJson, writeJson } from "@/core/storage";

const STORAGE_KEY = "gpt-image-2:projects";

export const useProjectsStore = defineStore("projects", () => {
  const current = ref("");
  const known = ref<string[]>(loadStored());

  watch(known, (value) => writeJson(STORAGE_KEY, value), { deep: true });

  function ensure(name: string): void {
    const n = name.trim();
    if (!n) return;
    if (!known.value.includes(n)) known.value = [...known.value, n];
  }

  function remove(name: string): void {
    known.value = known.value.filter((p) => p !== name);
    if (current.value === name) current.value = "";
  }

  return { current, known, ensure, remove };
});

function loadStored(): string[] {
  return readJson<string[]>(STORAGE_KEY, []);
}
