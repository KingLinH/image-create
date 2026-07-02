import { ref } from "vue";
import { ElMessage } from "element-plus";
import { generateImages, optimizePrompt, type ParsedImage } from "@/core/api";
import { ApiClientError } from "@/core/api";
import { useConfigStore } from "@/stores/config";
import { useHistoryStore } from "@/stores/history";
import { buildOutputPath } from "@/core/fileNames";
import { generateId, type ImageRecord } from "@/core/history";
import { downloadImage, makeThumbnail } from "@/core/storage";

export function useImageGeneration() {
  const configStore = useConfigStore();
  const historyStore = useHistoryStore();

  const loading = ref(false);
  const optimizing = ref(false);
  const prompt = ref("");
  const optimizedPrompt = ref("");
  const referenceImages = ref<File[]>([]);
  const images = ref<ParsedImage[]>([]);
  const errorMessage = ref("");

  async function optimize() {
    if (!prompt.value.trim()) {
      ElMessage.warning("请先填写提示词。");
      return;
    }
    optimizing.value = true;
    errorMessage.value = "";
    try {
      const result = await optimizePrompt(configStore.config, prompt.value);
      optimizedPrompt.value = result;
      prompt.value = result;
      ElMessage.success("提示词已优化。");
    } catch (error) {
      errorMessage.value = describeError(error);
      ElMessage.error(errorMessage.value);
    } finally {
      optimizing.value = false;
    }
  }

  async function generate(): Promise<void> {
    const currentPrompt = prompt.value.trim();
    if (!currentPrompt) {
      ElMessage.warning("请填写提示词。");
      return;
    }
    if (!configStore.isValid) {
      ElMessage.error("配置有误，请先到「设置」检查。");
      return;
    }

    loading.value = true;
    errorMessage.value = "";
    images.value = [];
    const startedAt = Date.now();

    try {
      const result = await generateImages(configStore.config, currentPrompt, {
        referenceImages: referenceImages.value,
      });
      images.value = result;

      const record: ImageRecord = {
        id: generateId(),
        status: "success",
        createdAt: new Date().toISOString(),
        prompt: currentPrompt,
        optimizedPrompt: optimizedPrompt.value,
        model: configStore.config.imageModel,
        size: configStore.config.defaultSize,
        format: configStore.config.defaultFormat,
        outputPath: buildOutputPath(
          configStore.config.outputDirectory,
          currentPrompt,
          configStore.config.defaultFormat,
        ),
        durationMs: Date.now() - startedAt,
        thumbnail: await makeThumbnail(result[0]),
      };
      historyStore.add(record);
      ElMessage.success(`生成成功，共 ${result.length} 张。`);
    } catch (error) {
      errorMessage.value = describeError(error);
      const record: ImageRecord = {
        id: generateId(),
        status: "failed",
        createdAt: new Date().toISOString(),
        prompt: currentPrompt,
        optimizedPrompt: optimizedPrompt.value,
        model: configStore.config.imageModel,
        size: configStore.config.defaultSize,
        format: configStore.config.defaultFormat,
        outputPath: "",
        durationMs: Date.now() - startedAt,
        errorMessage: errorMessage.value,
      };
      historyStore.add(record);
      ElMessage.error(errorMessage.value);
    } finally {
      loading.value = false;
    }
  }

  async function download(image: ParsedImage, index: number) {
    const date = new Date();
    const ts = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
      date.getHours(),
    )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    const name = `${ts}_image${index > 0 ? `-${index + 1}` : ""}.${configStore.config.defaultFormat}`;
    try {
      await downloadImage(image, name, configStore.config.defaultFormat);
    } catch (error) {
      ElMessage.error(describeError(error));
    }
  }

  function reset() {
    prompt.value = "";
    optimizedPrompt.value = "";
    referenceImages.value = [];
    images.value = [];
    errorMessage.value = "";
  }

  return {
    loading,
    optimizing,
    prompt,
    optimizedPrompt,
    referenceImages,
    images,
    errorMessage,
    optimize,
    generate,
    download,
    reset,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function describeError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.kind === "timeout") return `请求超时：${error.message}`;
    if (error.kind === "network") return `网络错误（可能是 CORS 被拦截）：${error.message}`;
    return error.message;
  }
  return error instanceof Error ? error.message : "发生未知错误。";
}
