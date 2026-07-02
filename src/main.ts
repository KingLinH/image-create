import { createApp } from "vue";
import { createPinia } from "pinia";
import { ElMessage } from "element-plus";
// 按需引入下，message/message-box 这类「服务式」API 的样式不会自动注入，需手动引入
import "element-plus/es/components/message/style/css";
import "element-plus/es/components/message-box/style/css";
import "element-plus/theme-chalk/dark/css-vars.css";
// 仅注册实际用到的图标（避免打包全部 ~300 个图标）
import {
  Document,
  Download,
  Files,
  List,
  Loading,
  MagicStick,
  Picture,
  Plus,
  VideoPlay,
  WarningFilled,
} from "@element-plus/icons-vue";

import App from "./App.vue";
import { router } from "./router";
import { describeError } from "./composables/useImageGeneration";
import "./styles/main.css";

const app = createApp(App);

// 全局错误兜底：捕获未处理的渲染错误与 Promise 拒绝，避免静默丢失。
app.config.errorHandler = (err) => {
  console.error("[app error]", err);
  ElMessage.error(describeError(err));
};
window.addEventListener("unhandledrejection", (event) => {
  console.error("[unhandled rejection]", event.reason);
  ElMessage.error(describeError(event.reason));
});

const icons = {
  Document,
  Download,
  Files,
  List,
  Loading,
  MagicStick,
  Picture,
  Plus,
  VideoPlay,
  WarningFilled,
};
for (const [name, component] of Object.entries(icons)) {
  app.component(name, component);
}

app.use(createPinia());
app.use(router);

app.mount("#app");
