import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import {
  DEFAULT_CONFIG,
  mergeConfig,
  validateConfig,
  type AppConfig,
  type ValidationResult,
} from "@/core/config";

const STORAGE_KEY = "gpt-image-2:config";

export const useConfigStore = defineStore("config", () => {
  const raw = loadStored();
  const config = ref<AppConfig>(mergeConfig(raw));

  const validation = computed<ValidationResult>(() => validateConfig(config.value));
  const isValid = computed(() => validation.value.errors.length === 0);
  const isConfigured = computed(() => Boolean(config.value.apiKey && config.value.baseUrl));

  // 自动持久化。
  watch(
    config,
    (value) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch (error) {
        console.warn("保存配置失败：", error);
      }
    },
    { deep: true },
  );

  function update(patch: Partial<AppConfig>): void {
    config.value = { ...config.value, ...patch };
  }

  function reset(): void {
    config.value = { ...DEFAULT_CONFIG };
  }

  return { config, validation, isValid, isConfigured, update, reset };
});

function loadStored(): Partial<Record<keyof AppConfig, unknown>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<keyof AppConfig, unknown>>) : {};
  } catch {
    return {};
  }
}
