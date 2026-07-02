<script setup lang="ts">
import { reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useConfigStore } from "@/stores/config";
import { testImageModel, testTextModel } from "@/core/api";
import { IMAGE_SIZE_PRESETS, getImageSizePresetCategory } from "@/core/imageOptions";
import { describeError } from "@/composables/useImageGeneration";
import { pickOutputDirectory, supportsDirectoryPicker } from "@/core/storage";
import { DEFAULT_CONFIG } from "@/core/config";

const configStore = useConfigStore();
const form = reactive({ ...configStore.config });
const testingText = ref(false);
const testingImage = ref(false);

const sizeOptions = IMAGE_SIZE_PRESETS.map((p) => ({
  label: p.value === "auto" ? "自动 (auto)" : `${p.value}  [${p.category}]`,
  value: p.value,
}));

function save() {
  configStore.update({ ...form });
  const result = configStore.validation;
  if (result.errors.length > 0) {
    ElMessage.error(`保存失败：${result.errors[0]}`);
  } else {
    ElMessage.success("配置已保存。");
    if (result.warnings.length > 0) ElMessage.warning(result.warnings[0]);
  }
}

function resetDefaults() {
  Object.assign(form, { ...DEFAULT_CONFIG });
  configStore.update({ ...form });
  ElMessage.info("已恢复默认配置。");
}

async function testText() {
  testingText.value = true;
  try {
    configStore.update({ ...form });
    const reply = await testTextModel(configStore.config);
    ElMessage.success(`文字模型连通正常：${truncate(reply)}`);
  } catch (error) {
    ElMessage.error(`文字模型测试失败：${describeError(error)}`);
  } finally {
    testingText.value = false;
  }
}

async function testImage() {
  testingImage.value = true;
  try {
    configStore.update({ ...form });
    await testImageModel(configStore.config);
    ElMessage.success("图片模型连通正常。");
  } catch (error) {
    ElMessage.error(`图片模型测试失败：${describeError(error)}`);
  } finally {
    testingImage.value = false;
  }
}

async function pickDir() {
  const name = await pickOutputDirectory();
  if (name) {
    form.outputDirectory = name;
    ElMessage.success(`已授权目录：${name}`);
  }
}

function truncate(text: string, max = 40): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
</script>

<template>
  <div>
    <div class="panel">
      <p class="panel-title">模型服务</p>
      <el-form label-width="120px" label-position="right">
        <el-form-item label="Base URL">
          <el-input v-model="form.baseUrl" placeholder="https://your-provider.com/v1" />
          <div class="muted">将以 /v1 结尾规范化。请求直发该地址，不经任何后端。</div>
        </el-form-item>
        <el-form-item label="API Key">
          <el-input v-model="form.apiKey" type="password" show-password placeholder="sk-..." />
          <div class="muted">仅保存在当前浏览器本地，不会上传。</div>
        </el-form-item>
        <el-form-item label="文字模型">
          <el-input v-model="form.textModel" placeholder="如 gpt-5.4-mini" />
        </el-form-item>
        <el-form-item label="图片模型">
          <el-input v-model="form.imageModel" placeholder="如 gpt-image-2" />
        </el-form-item>
        <el-form-item label="连通性测试">
          <el-button :loading="testingText" @click="testText">测试文字模型</el-button>
          <el-button :loading="testingImage" @click="testImage">测试图片模型</el-button>
          <span class="muted">建议先测试再正式生成（测试图片模型会产生少量费用）。</span>
        </el-form-item>
      </el-form>
    </div>

    <div class="panel">
      <p class="panel-title">图片默认参数</p>
      <el-form label-width="120px" label-position="right">
        <el-form-item label="超时时间(秒)">
          <el-input-number v-model="form.timeoutSeconds" :min="180" :max="600" :step="30" />
          <span class="muted">生图常需 1~3 分钟，建议 ≥ 180 秒。</span>
        </el-form-item>
        <el-form-item label="图片尺寸">
          <el-select v-model="form.defaultSize" filterable allow-create style="width: 220px">
            <el-option v-for="opt in sizeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
          <span class="muted" v-if="getImageSizePresetCategory(form.defaultSize) === 'custom'">
            自定义尺寸须为 16 的倍数、边长 ≤ 3840、长宽比 ≤ 3:1。
          </span>
        </el-form-item>
        <el-form-item label="单次数量">
          <el-input-number v-model="form.defaultCount" :min="1" :max="4" />
        </el-form-item>
        <el-form-item label="质量">
          <el-radio-group v-model="form.defaultQuality">
            <el-radio-button value="auto">auto</el-radio-button>
            <el-radio-button value="low">low</el-radio-button>
            <el-radio-button value="medium">medium</el-radio-button>
            <el-radio-button value="high">high</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="格式">
          <el-radio-group v-model="form.defaultFormat">
            <el-radio-button value="png">png</el-radio-button>
            <el-radio-button value="jpeg">jpeg</el-radio-button>
            <el-radio-button value="webp">webp</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="压缩率" v-if="form.defaultFormat !== 'png'">
          <el-slider v-model="form.defaultCompression" :min="0" :max="100" show-input style="max-width: 420px" />
        </el-form-item>
        <el-form-item label="输出目录">
          <el-input v-model="form.outputDirectory" placeholder="outputs" />
          <el-button v-if="supportsDirectoryPicker()" link type="primary" @click="pickDir">
            授权本地目录（可选）
          </el-button>
          <div class="muted">默认通过浏览器下载保存；授权后可写入指定目录。</div>
        </el-form-item>
      </el-form>
    </div>

    <div class="panel">
      <p class="panel-title">批量默认值</p>
      <el-form label-width="120px" label-position="right" inline>
        <el-form-item label="任务数量">
          <el-input-number v-model="form.batchDefaultTaskCount" :min="1" :max="20" />
        </el-form-item>
        <el-form-item label="并发数">
          <el-input-number v-model="form.batchDefaultConcurrency" :min="1" :max="8" />
        </el-form-item>
        <el-form-item label="间隔(秒)">
          <el-input-number v-model="form.batchDefaultIntervalSeconds" :min="0" :max="60" />
        </el-form-item>
        <el-form-item label="重试次数">
          <el-input-number v-model="form.batchDefaultMaxRetries" :min="0" :max="5" />
        </el-form-item>
      </el-form>
    </div>

    <div class="actions">
      <el-button type="primary" size="large" @click="save">保存配置</el-button>
      <el-button size="large" @click="resetDefaults">恢复默认</el-button>
    </div>
  </div>
</template>

<style scoped>
.actions {
  display: flex;
  gap: 12px;
  padding: 0 4px;
}
.el-form-item .muted {
  margin-left: 8px;
}
</style>
