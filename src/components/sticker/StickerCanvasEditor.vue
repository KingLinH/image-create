<script setup lang="ts">
import { computed } from "vue";
import type { StickerBackground, StickerCropMode, StickerTextOverlay } from "@/core/stickerCanvas";
import type { StickerOutputFormat } from "@/core/stickerSpecs";

const props = defineProps<{
  targetWidth: number;
  targetHeight: number;
  formats: StickerOutputFormat[];
}>();
const cropMode = defineModel<StickerCropMode>("cropMode", { required: true });
const background = defineModel<StickerBackground>("background", { required: true });
const paddingRatio = defineModel<number>("paddingRatio", { required: true });
const quality = defineModel<number>("quality", { required: true });
const textOverlay = defineModel<StickerTextOverlay>("textOverlay", { required: true });

const textXRatioModel = computed({
  get: () => normalizeRatio(textOverlay.value.xRatio, 0.5),
  set: (value: number) => {
    ensureTextPosition();
    textOverlay.value.xRatio = normalizeRatio(value, 0.5);
  },
});
const textYRatioModel = computed({
  get: () => normalizeRatio(textOverlay.value.yRatio, defaultYRatio()),
  set: (value: number) => {
    ensureTextPosition();
    textOverlay.value.yRatio = normalizeRatio(value, defaultYRatio());
  },
});

function applyTextPreset(position: "top" | "center" | "bottom") {
  textOverlay.value.position = position;
  textOverlay.value.xRatio = 0.5;
  textOverlay.value.yRatio = position === "top" ? 0.18 : position === "center" ? 0.5 : 0.82;
  textOverlay.value.align = "center";
}

function ensureTextPosition() {
  textOverlay.value.xRatio ??= 0.5;
  textOverlay.value.yRatio ??= defaultYRatio();
  textOverlay.value.align ??= "center";
}

function defaultYRatio() {
  return textOverlay.value.position === "top" ? 0.18 : textOverlay.value.position === "center" ? 0.5 : 0.82;
}

function normalizeRatio(value: unknown, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(1, Math.max(0, numberValue));
}
</script>

<template>
  <div>
    <el-alert
        class="editor-tip"
        type="info"
        :closable="false"
        show-icon
        :title="`当前会导出为 ${props.targetWidth}×${props.targetHeight}，格式：${props.formats.map((item) => item.toUpperCase()).join(' / ')}。调整后点击导出/合成才会重新生成结果。`"
      />
      <el-form label-width="100px" label-position="right">
        <el-form-item label="裁切模式">
          <el-radio-group v-model="cropMode">
            <el-radio-button value="contain">完整适配</el-radio-button>
            <el-radio-button value="cover">填满裁切</el-radio-button>
          </el-radio-group>
          <p class="help-text">
            完整适配会保留素材全貌并自动留白；填满裁切会铺满目标尺寸，可能裁掉边缘。
          </p>
        </el-form-item>
        <el-form-item label="背景">
          <el-radio-group v-model="background">
            <el-radio-button value="transparent">透明</el-radio-button>
            <el-radio-button value="white">白色</el-radio-button>
            <el-radio-button value="#f7f7f7">浅灰</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="边距">
          <el-slider v-model="paddingRatio" :min="0" :max="0.3" :step="0.01" show-input />
        </el-form-item>
        <el-form-item label="压缩质量">
          <el-slider v-model="quality" :min="0.4" :max="1" :step="0.01" show-input />
          <p class="help-text">导出时会以当前质量为起点，自动优化到尽量接近规格体积上限。</p>
        </el-form-item>
        <el-divider content-position="left">本地叠字</el-divider>
        <el-form-item label="启用叠字">
          <el-switch v-model="textOverlay.enabled" active-text="导出时绘制文字" @change="ensureTextPosition" />
          <p class="help-text">
            本地叠字会在导出时绘制到静态图或 GIF 每一帧，不会发送给 AI。
          </p>
        </el-form-item>
        <el-form-item label="文字内容">
          <el-input
            v-model="textOverlay.text"
            type="textarea"
            :rows="2"
            maxlength="24"
            show-word-limit
            placeholder="例如：谢谢、收到、哈哈哈"
            :disabled="!textOverlay.enabled"
          />
        </el-form-item>
        <el-form-item label="位置预设">
          <el-radio-group :model-value="textOverlay.position" :disabled="!textOverlay.enabled" @update:model-value="applyTextPreset($event as 'top' | 'center' | 'bottom')">
            <el-radio-button value="top">顶部</el-radio-button>
            <el-radio-button value="center">居中</el-radio-button>
            <el-radio-button value="bottom">底部</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="水平位置">
          <el-slider v-model="textXRatioModel" :min="0" :max="1" :step="0.01" show-input :disabled="!textOverlay.enabled" />
        </el-form-item>
        <el-form-item label="垂直位置">
          <el-slider v-model="textYRatioModel" :min="0" :max="1" :step="0.01" show-input :disabled="!textOverlay.enabled" />
        </el-form-item>
        <el-form-item label="对齐方式">
          <el-radio-group v-model="textOverlay.align" :disabled="!textOverlay.enabled">
            <el-radio-button value="left">左对齐</el-radio-button>
            <el-radio-button value="center">居中</el-radio-button>
            <el-radio-button value="right">右对齐</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="字号">
          <el-slider v-model="textOverlay.fontSizeRatio" :min="0.08" :max="0.28" :step="0.01" show-input :disabled="!textOverlay.enabled" />
        </el-form-item>
        <el-form-item label="文字颜色">
          <el-color-picker v-model="textOverlay.color" :disabled="!textOverlay.enabled" />
        </el-form-item>
        <el-form-item label="描边颜色">
          <el-color-picker v-model="textOverlay.strokeColor" :disabled="!textOverlay.enabled" />
        </el-form-item>
        <el-form-item label="描边粗细">
          <el-slider v-model="textOverlay.strokeWidthRatio" :min="0" :max="0.04" :step="0.002" show-input :disabled="!textOverlay.enabled" />
          <p class="help-text">
            拖动位置后，导出静态图和 GIF 每一帧都会使用相同叠字位置。文字过多可能在微信小尺寸展示中不清晰，并可能增加 GIF 体积。
          </p>
        </el-form-item>
    </el-form>
  </div>
</template>

<style scoped>
.editor-tip {
  margin-bottom: 12px;
}
.help-text {
  width: 100%;
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
</style>
