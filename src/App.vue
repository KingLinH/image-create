<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useConfigStore } from "@/stores/config";

const route = useRoute();
const router = useRouter();
const configStore = useConfigStore();

const activeMenu = computed(() => (route.name as string) ?? "single");
const showConfigBanner = computed(
  () => !configStore.isConfigured && route.name !== "settings",
);

function goSettings() {
  router.push({ name: "settings" });
}
</script>

<template>
  <el-container class="app-root">
    <el-header class="app-header">
      <div class="brand">
        <img src="/favicon.svg" alt="logo" class="brand-logo" />
        <span class="brand-title">GPT-Image-2 生图工作台</span>
      </div>
      <el-menu :default-active="activeMenu" mode="horizontal" :ellipsis="false" router>
        <el-menu-item index="single">单图</el-menu-item>
        <el-menu-item index="batch">批量</el-menu-item>
        <el-menu-item index="history">历史</el-menu-item>
        <el-menu-item index="settings">设置</el-menu-item>
      </el-menu>
    </el-header>

    <el-main class="app-main">
      <el-alert
        v-if="showConfigBanner"
        title="尚未配置 API"
        type="warning"
        :closable="false"
        show-icon
        class="config-banner"
      >
        <template #default>
          请先到「设置」填写 Base URL 与 API Key，再开始生图。
          <el-link type="primary" :underline="false" @click="goSettings">去设置</el-link>
        </template>
      </el-alert>

      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </el-main>

    <el-footer class="app-footer">
      <span>纯浏览器调用，请求直发你配置的模型服务；Key 与历史仅保存在本地浏览器。</span>
    </el-footer>
  </el-container>
</template>

<style scoped>
.app-root {
  min-height: 100vh;
}
.app-header {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 24px;
  border-bottom: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.brand-logo {
  width: 28px;
  height: 28px;
}
.brand-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}
.app-header :deep(.el-menu) {
  border-bottom: none;
  flex: 1;
}
.app-main {
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  padding: 24px;
  box-sizing: border-box;
}
.config-banner {
  margin-bottom: 16px;
}
.app-footer {
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  border-top: 1px solid var(--el-border-color-lighter);
  height: 48px;
  line-height: 48px;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
