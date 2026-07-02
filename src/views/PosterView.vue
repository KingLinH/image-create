<script setup lang="ts">
defineOptions({ name: "PosterView" });
import { computed, onMounted, ref, watch } from "vue";
import { ElMessage, type UploadFile } from "element-plus";
import { useConfigStore } from "@/stores/config";
import { useImageGeneration } from "@/composables/useImageGeneration";
import { POSTER_TYPES, findPosterType } from "@/core/posterTypes";
import { STYLE_PRESETS } from "@/core/stylePresets";
import { COMPOSITION_PRESETS } from "@/core/compositionPresets";
import { compressImage } from "@/core/storage";
import PosterBuilder from "@/components/PosterBuilder.vue";
import ProjectSelect from "@/components/ProjectSelect.vue";
import SnippetDrawer from "@/components/SnippetDrawer.vue";
import AssetsDrawer from "@/components/AssetsDrawer.vue";

const configStore = useConfigStore();
const gen = useImageGeneration();

const selectedType = ref(POSTER_TYPES[0].id);
const currentType = computed(() => findPosterType(selectedType.value)!);
const sizeOptions = computed(() => currentType.value.sizes);
const sizeRef = ref(currentType.value.sizes[0]);
const snippetDrawerVisible = ref(false);
const assetsDrawerVisible = ref(false);

async function onPosterRefChange(_file: UploadFile, files: UploadFile[]) {
  const raws = files.map((f) => f.raw).filter(Boolean) as unknown as File[];
  gen.referenceImages.value = await Promise.all(raws.map((f) => compressImage(f)));
}

function clearPosterRef() {
  gen.referenceImages.value = [];
}

function onUseAsset(file: File) {
  gen.referenceImages.value = [...gen.referenceImages.value, file];
  ElMessage.success("已从素材库加入参考图。");
}

function applySize() {
  if (sizeRef.value) configStore.update({ defaultSize: sizeRef.value });
}

function toggleStyle(id: string) {
  const arr = gen.activeStyles.value;
  gen.activeStyles.value = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
}

function toggleComposition(id: string) {
  const arr = gen.activeComposition.value;
  gen.activeComposition.value = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
}

// 切换海报类型：套用推荐尺寸 + 默认构图。
function applyTypeDefaults() {
  sizeRef.value = currentType.value.sizes[0];
  applySize();
  gen.activeComposition.value = [currentType.value.defaultComposition];
}

function loadTemplate() {
  gen.prompt.value = currentType.value.template;
  ElMessage.info("已载入示例模板，可在此基础上修改。");
}

function onAssemble(text: string) {
  gen.prompt.value = gen.prompt.value.trim()
    ? `${gen.prompt.value.trim()}，${text}`
    : text;
}

onMounted(applyTypeDefaults);
watch(selectedType, applyTypeDefaults);
</script>

<template>
  <div>
    <div class="panel">
      <p class="panel-title">① 选择海报类型</p>
      <div class="type-row">
        <el-check-tag
          v-for="t in POSTER_TYPES"
          :key="t.id"
          :checked="selectedType === t.id"
          @change="selectedType = t.id"
        >
          {{ t.emoji }} {{ t.label }}
        </el-check-tag>
      </div>
    </div>

    <div class="panel">
      <p class="panel-title">② 填写海报信息（生成提示词）</p>
      <PosterBuilder @assemble="onAssemble" />
      <el-button link type="primary" size="small" @click="loadTemplate">
        <el-icon><MagicStick /></el-icon> 载入「{{ currentType.label }}」示例模板
      </el-button>

      <el-input
        v-model="gen.prompt.value"
        type="textarea"
        :rows="5"
        placeholder="提示词会在这里组装 / 你也可直接手写…"
        maxlength="4000"
        show-word-limit
        class="prompt-input"
      />

      <div class="tag-block">
        <span class="tag-label muted">风格：</span>
        <el-check-tag
          v-for="p in STYLE_PRESETS"
          :key="p.id"
          :checked="gen.activeStyles.value.includes(p.id)"
          @change="toggleStyle(p.id)"
        >
          {{ p.emoji }} {{ p.label }}
        </el-check-tag>
      </div>

      <div class="tag-block">
        <span class="tag-label muted">构图：</span>
        <el-check-tag
          v-for="p in COMPOSITION_PRESETS"
          :key="p.id"
          :checked="gen.activeComposition.value.includes(p.id)"
          @change="toggleComposition(p.id)"
        >
          {{ p.label }}
        </el-check-tag>
      </div>

      <div class="effective" v-if="gen.activeStyles.value.length > 0 || gen.activeComposition.value.length > 0">
        <span class="muted">实际发送：</span>
        <code>{{ gen.effectivePrompt.value }}</code>
      </div>
    </div>

    <div class="panel">
      <p class="panel-title">③ 尺寸 & 生成</p>
      <el-form label-width="90px" label-position="right" inline>
        <el-form-item label="尺寸">
          <el-select v-model="sizeRef" style="width: 180px" @change="applySize">
            <el-option v-for="s in sizeOptions" :key="s" :label="s" :value="s" />
          </el-select>
          <span class="muted">{{ configStore.config.defaultCount }} 张 · {{ configStore.config.defaultQuality }}</span>
        </el-form-item>
        <el-form-item label="项目">
          <ProjectSelect />
        </el-form-item>
      </el-form>
      <div class="actions">
        <el-button @click="snippetDrawerVisible = true">
          <el-icon><Files /></el-icon> 片段库
        </el-button>
        <el-button type="primary" size="large" :loading="gen.loading.value" @click="gen.generate">
          <el-icon><Picture /></el-icon> 生成海报
        </el-button>
      </div>
    </div>

    <div class="panel">
      <p class="panel-title">
        参考图（图生图，可选）
        <el-button link type="primary" size="small" @click="assetsDrawerVisible = true">素材库</el-button>
      </p>
      <el-upload
        :auto-upload="false"
        list-type="picture-card"
        :on-change="onPosterRefChange"
        :on-remove="clearPosterRef"
        accept="image/png,image/jpeg,image/webp"
        multiple
      >
        <el-icon><Plus /></el-icon>
      </el-upload>
      <div class="muted">上传产品图/Logo 等做参考，或从「素材库」一键加入。</div>
    </div>

    <div class="panel result-panel" v-if="gen.images.value.length > 0 || gen.loading.value">
      <p class="panel-title">结果</p>
      <div v-if="gen.loading.value" class="loading-block">
        <el-icon class="is-loading" :size="28"><Loading /></el-icon>
        <span>生成中，请耐心等待（通常 1~3 分钟）…</span>
      </div>
      <div class="thumb-grid" v-if="gen.images.value.length > 0">
        <div class="result-item" v-for="(img, i) in gen.images.value" :key="i">
          <el-image
            class="thumb"
            :src="img.base64 ? `data:image/png;base64,${img.base64}` : img.url"
            :preview-src-list="gen.images.value.map((m) => (m.base64 ? `data:image/png;base64,${m.base64}` : m.url!))"
            :initial-index="i"
            fit="cover"
            preview-teleported
          />
          <el-button link type="primary" size="small" @click="gen.download(img, i)">
            <el-icon><Download /></el-icon> 下载
          </el-button>
        </div>
      </div>
    </div>

    <SnippetDrawer
      v-model="snippetDrawerVisible"
      :current-prompt="gen.prompt.value"
      @insert="gen.prompt.value = $event"
    />
    <AssetsDrawer v-model="assetsDrawerVisible" @use="onUseAsset" />
  </div>
</template>

<style scoped>
.type-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.prompt-input {
  margin-top: 12px;
}
.tag-block {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}
.tag-label {
  font-size: 12px;
}
.effective {
  margin-top: 10px;
  padding: 8px 10px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 12px;
}
.effective code {
  word-break: break-all;
  color: var(--el-text-color-regular);
}
.actions {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}
.result-panel {
  min-height: 120px;
}
.loading-block {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--el-text-color-secondary);
}
.result-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
</style>
