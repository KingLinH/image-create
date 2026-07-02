<script setup lang="ts">
defineOptions({ name: "SingleView" });
import { computed, onMounted, ref } from "vue";
import type { UploadFile } from "element-plus";
import { useConfigStore } from "@/stores/config";
import { useImageGeneration } from "@/composables/useImageGeneration";
import { consumePendingPrompt } from "@/composables/promptTransfer";
import { STYLE_PRESETS } from "@/core/stylePresets";
import SnippetDrawer from "@/components/SnippetDrawer.vue";
import ProjectSelect from "@/components/ProjectSelect.vue";

const configStore = useConfigStore();
const gen = useImageGeneration();

onMounted(() => {
  const reused = consumePendingPrompt();
  if (reused) gen.prompt.value = reused;
});

const currentSize = computed(() => configStore.config.defaultSize);
const currentCount = computed(() => configStore.config.defaultCount);
const currentQuality = computed(() => configStore.config.defaultQuality);
const currentFormat = computed(() => configStore.config.defaultFormat);

const snippetDrawerVisible = ref(false);

const sizeInput = ref(configStore.config.defaultSize);
function applySize() {
  if (sizeInput.value.trim()) configStore.update({ defaultSize: sizeInput.value.trim() });
}

function toggleStyle(id: string) {
  const arr = gen.activeStyles.value;
  gen.activeStyles.value = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
}

function onReferenceChange(_file: UploadFile, files: UploadFile[]) {
  gen.referenceImages.value = files.map((f) => f.raw).filter(Boolean) as unknown as File[];
}

function clearReference() {
  gen.referenceImages.value = [];
}
</script>

<template>
  <div>
    <div class="panel">
      <p class="panel-title">提示词</p>
      <el-input
        v-model="gen.prompt.value"
        type="textarea"
        :rows="5"
        placeholder="描述你想生成的图片，越具体越好…"
        maxlength="4000"
        show-word-limit
      />
      <div class="prompt-actions">
        <el-button :loading="gen.optimizing.value" @click="gen.optimize">
          <el-icon><MagicStick /></el-icon>
          <span>用文字模型优化提示词</span>
        </el-button>
        <el-button @click="snippetDrawerVisible = true">
          <el-icon><Files /></el-icon>
          <span>片段库</span>
        </el-button>
        <span class="muted">优化后的提示词会替换上方内容。</span>
      </div>

      <div class="style-row">
        <span class="style-label muted">风格预设：</span>
        <el-check-tag
          v-for="p in STYLE_PRESETS"
          :key="p.id"
          :checked="gen.activeStyles.value.includes(p.id)"
          @change="toggleStyle(p.id)"
        >
          {{ p.emoji }} {{ p.label }}
        </el-check-tag>
      </div>
      <div class="effective" v-if="gen.activeStyles.value.length > 0">
        <span class="muted">实际发送：</span>
        <code>{{ gen.effectivePrompt.value }}</code>
      </div>
    </div>

    <div class="panel">
      <p class="panel-title">参数</p>
      <el-form label-width="100px" label-position="right">
        <el-form-item label="尺寸">
          <el-input v-model="sizeInput" style="width: 200px" @change="applySize" />
          <span class="muted">当前生效：{{ currentSize }}</span>
        </el-form-item>
        <el-form-item label="数量">
          <span>{{ currentCount }} 张</span>
          <span class="muted">（在「设置」中调整默认数量）</span>
        </el-form-item>
        <el-form-item label="质量">{{ currentQuality }} · 格式 {{ currentFormat }}</el-form-item>
      </el-form>
    </div>

    <div class="panel">
      <p class="panel-title">参考图（图生图，可选）</p>
      <el-upload
        :auto-upload="false"
        list-type="picture-card"
        :on-change="onReferenceChange"
        :on-remove="clearReference"
        accept="image/png,image/jpeg,image/webp"
        multiple
      >
        <el-icon><Plus /></el-icon>
      </el-upload>
      <div class="muted">上传参考图后将调用图生图接口（/images/edits）。</div>
    </div>

    <div class="actions">
      <span class="muted action-label">项目：</span>
      <ProjectSelect />
      <el-button type="primary" size="large" :loading="gen.loading.value" @click="gen.generate">
        <el-icon><Picture /></el-icon>
        <span>生成图片</span>
      </el-button>
      <el-button size="large" @click="gen.reset">清空</el-button>
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
          <div class="muted" v-if="img.revisedPrompt">修订：{{ img.revisedPrompt }}</div>
        </div>
      </div>
    </div>

    <SnippetDrawer
      v-model="snippetDrawerVisible"
      :current-prompt="gen.prompt.value"
      @insert="gen.prompt.value = $event"
    />
  </div>
</template>

<style scoped>
.prompt-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
.style-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}
.style-label {
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
  margin-bottom: 16px;
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
.result-item .muted {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
