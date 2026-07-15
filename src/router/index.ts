import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";
import PosterView from "@/views/PosterView.vue";
import SingleView from "@/views/SingleView.vue";
import BatchView from "@/views/BatchView.vue";
import StickerView from "@/views/StickerView.vue";
import HistoryView from "@/views/HistoryView.vue";
import SettingsView from "@/views/SettingsView.vue";

// 注意：用静态导入而非动态 import()。原因：部署后旧 chunk hash 会失效，
// 已打开的页面切换路由时会 "Failed to fetch dynamically imported module"。
// 视图体积很小，静态打进主包可彻底避免该问题。
const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/poster" },
  { path: "/poster", name: "poster", component: PosterView, meta: { title: "海报" } },
  { path: "/single", name: "single", component: SingleView, meta: { title: "单图" } },
  { path: "/batch", name: "batch", component: BatchView, meta: { title: "批量" } },
  { path: "/sticker", name: "sticker", component: StickerView, meta: { title: "表情" } },
  { path: "/history", name: "history", component: HistoryView, meta: { title: "历史" } },
  { path: "/settings", name: "settings", component: SettingsView, meta: { title: "设置" } },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
