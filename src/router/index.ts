import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/single" },
  {
    path: "/single",
    name: "single",
    component: () => import("@/views/SingleView.vue"),
    meta: { title: "单图" },
  },
  {
    path: "/batch",
    name: "batch",
    component: () => import("@/views/BatchView.vue"),
    meta: { title: "批量" },
  },
  {
    path: "/history",
    name: "history",
    component: () => import("@/views/HistoryView.vue"),
    meta: { title: "历史" },
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("@/views/SettingsView.vue"),
    meta: { title: "设置" },
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
