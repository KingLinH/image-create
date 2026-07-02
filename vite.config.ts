import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

// GitHub Actions（CI=true）会把仓库发布到 https://<user>.github.io/<repo>/ 子路径，
// 用 GITHUB_REPOSITORY 自动推导 base，使静态资源加载路径正确。
// 本地开发时 base 为 "/"。
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const base = process.env.CI && repoName ? `/${repoName}/` : "/";

// https://vitejs.dev/config/
export default defineConfig({
  base,
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
