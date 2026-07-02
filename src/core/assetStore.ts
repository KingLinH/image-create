// 素材库 IndexedDB 存储（独立 DB，避免与历史冲突）。镜像 imageStore 模式。
import { createStore, get, set, del, clear } from "idb-keyval";
import type { ParsedImage } from "./api";

const store = createStore("gpt-image-2-assets", "assets");

export type StoredAsset = {
  full: ParsedImage; // 原图 base64
  thumb: string; // 缩略图 data URL
};

export async function saveAsset(id: string, value: StoredAsset): Promise<void> {
  try {
    await set(id, value, store);
  } catch (error) {
    console.warn("写入素材 IndexedDB 失败：", error);
  }
}

export async function getAsset(id: string): Promise<StoredAsset | undefined> {
  try {
    return await get<StoredAsset>(id, store);
  } catch {
    return undefined;
  }
}

export async function getAssetThumb(id: string): Promise<string | undefined> {
  return (await getAsset(id))?.thumb;
}

export async function deleteAsset(id: string): Promise<void> {
  try {
    await del(id, store);
  } catch {
    /* ignore */
  }
}

export async function clearAssets(): Promise<void> {
  try {
    await clear(store);
  } catch {
    /* ignore */
  }
}
