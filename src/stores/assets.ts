import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { generateId } from "@/core/history";
import { compressImage, fileToBase64, base64ToFile, makeThumbnail, readJson, writeJson } from "@/core/storage";
import { saveAsset, getAsset, getAssetThumb, deleteAsset, clearAssets } from "@/core/assetStore";

const STORAGE_KEY = "gpt-image-2:assets";

export type Asset = {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  sizeKB: number;
};

export const useAssetsStore = defineStore("assets", () => {
  const assets = ref<Asset[]>(loadStored());
  const thumbnailById = reactive<Record<string, string>>({});

  function persist(): void {
    writeJson(STORAGE_KEY, assets.value);
  }

  async function add(file: File): Promise<void> {
    try {
      const compressed = await compressImage(file);
      const base64 = await fileToBase64(compressed);
      const thumb = (await makeThumbnail({ base64 })) ?? "";
      const id = generateId();
      const asset: Asset = {
        id,
        name: compressed.name,
        type: compressed.type,
        createdAt: new Date().toISOString(),
        sizeKB: Math.round(compressed.size / 1024),
      };
      await saveAsset(id, { full: { base64 }, thumb });
      assets.value = [asset, ...assets.value];
      persist();
      if (thumb) thumbnailById[id] = thumb;
    } catch (error) {
      ElMessage.error(`添加素材失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  }

  async function remove(id: string): Promise<void> {
    assets.value = assets.value.filter((a) => a.id !== id);
    persist();
    delete thumbnailById[id];
    await deleteAsset(id);
  }

  async function clear(): Promise<void> {
    assets.value = [];
    persist();
    for (const k of Object.keys(thumbnailById)) delete thumbnailById[k];
    await clearAssets();
  }

  async function hydrateThumbnails(): Promise<void> {
    const ids = assets.value.map((a) => a.id).filter((id) => !(id in thumbnailById));
    await Promise.all(
      ids.map(async (id) => {
        const thumb = await getAssetThumb(id);
        if (thumb) thumbnailById[id] = thumb;
      }),
    );
  }

  // 还原成 File，供「用作参考图」加到 img2img。
  async function getAssetFile(id: string): Promise<File | undefined> {
    const entry = await getAsset(id);
    const meta = assets.value.find((a) => a.id === id);
    if (!entry?.full.base64 || !meta) return undefined;
    const name = meta.name.replace(/\.(png|jpe?g|webp|bmp|gif)$/i, "") + ".jpg";
    return base64ToFile(entry.full.base64, name);
  }

  return { assets, thumbnailById, add, remove, clear, hydrateThumbnails, getAssetFile };
});

function loadStored(): Asset[] {
  return readJson<Asset[]>(STORAGE_KEY, []);
}
