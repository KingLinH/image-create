import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { generateId } from "@/core/history";
import { readJson, writeJson } from "@/core/storage";

const STORAGE_KEY = "gpt-image-2:snippets";

export type Snippet = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
};

export const useSnippetsStore = defineStore("snippets", () => {
  const snippets = ref<Snippet[]>(loadStored());

  watch(
    snippets,
    (value) => writeJson(STORAGE_KEY, value),
    { deep: true },
  );

  function add(input: { title: string; content: string; tags?: string[] }): Snippet {
    const snippet: Snippet = {
      id: generateId(),
      title: input.title.trim() || truncate(input.content, 24) || "未命名片段",
      content: input.content,
      tags: input.tags ?? [],
      createdAt: new Date().toISOString(),
    };
    snippets.value = [snippet, ...snippets.value];
    return snippet;
  }

  function update(id: string, patch: Partial<Omit<Snippet, "id">>): void {
    snippets.value = snippets.value.map((s) => (s.id === id ? { ...s, ...patch } : s));
  }

  function remove(id: string): void {
    snippets.value = snippets.value.filter((s) => s.id !== id);
  }

  function clear(): void {
    snippets.value = [];
  }

  // 关键词搜索：标题 / 内容 / 标签模糊匹配。
  function search(keyword: string): Snippet[] {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return snippets.value;
    return snippets.value.filter((s) => {
      const haystack = [s.title, s.content, s.tags.join(" ")].join(" ").toLowerCase();
      return haystack.includes(kw);
    });
  }

  return { snippets, add, update, remove, clear, search };
});

function loadStored(): Snippet[] {
  return readJson<Snippet[]>(STORAGE_KEY, []);
}

function truncate(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
