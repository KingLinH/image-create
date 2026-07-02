<script setup lang="ts">
import { onMounted } from "vue";
import { ElMessage, ElMessageBox, type UploadFile } from "element-plus";
import { useAssetsStore } from "@/stores/assets";

defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "use", file: File): void;
}>();

const store = useAssetsStore();

onMounted(() => {
  void store.hydrateThumbnails();
});

async function onUploadChange(file: UploadFile) {
  if (file.raw) {
    await store.add(file.raw);
  }
}

async function useAsset(id: string) {
  const file = await store.getAssetFile(id);
  if (!file) {
    ElMessage.warning("该素材没有可用的图片数据。");
    return;
  }
  emit("use", file);
  emit("update:modelValue", false);
}

async function removeAsset(id: string, name: string) {
  try {
    await ElMessageBox.confirm(`删除素材「${name}」？`, "删除", { type: "warning" });
    await store.remove(id);
    ElMessage.info("已删除。");
  } catch {
    /* 取消 */
  }
}
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="图片素材库"
    direction="rtl"
    size="420px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-upload
      :auto-upload="false"
      :show-file-list="false"
      accept="image/png,image/jpeg,image/webp"
      multiple
      :on-change="onUploadChange"
    >
      <el-button type="primary">
        <el-icon><Plus /></el-icon> 上传素材
      </el-button>
      <template #tip>
        <div class="muted">支持 PNG/JPEG/WebP，上传后自动压缩并存在本地。</div>
      </template>
    </el-upload>

    <el-empty v-if="store.assets.length === 0" description="还没有素材，上传几张吧" :image-size="60" />

    <div v-else class="asset-grid">
      <div v-for="a in store.assets" :key="a.id" class="asset-card">
        <el-image
          v-if="store.thumbnailById[a.id]"
          class="asset-thumb"
          :src="store.thumbnailById[a.id]"
          :preview-src-list="[store.thumbnailById[a.id]]"
          fit="cover"
          preview-teleported
        />
        <div v-else class="asset-thumb placeholder"><el-icon><Picture /></el-icon></div>
        <div class="asset-name" :title="a.name">{{ a.name }}</div>
        <div class="asset-actions">
          <el-button link type="primary" size="small" @click="useAsset(a.id)">用作参考图</el-button>
          <el-button link type="danger" size="small" @click="removeAsset(a.id, a.name)">删除</el-button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.muted {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
  margin-top: 14px;
}
.asset-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.asset-thumb {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color);
}
.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
}
.asset-name {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset-actions {
  display: flex;
  justify-content: space-between;
}
</style>
