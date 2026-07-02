# GPT-Image-2 生图工作台（Vue 版）

参考 [KDB-Wind/gpt-image-2-studio](https://github.com/KDB-Wind/gpt-image-2-studio)，用 **Vue 3 + Vite + TypeScript + Element Plus** 重写的轻量 GPT-Image-2 生图工具。

> 纯浏览器、无后端。填入你自己的 `Base URL` 与 `API Key`，所有请求从浏览器直接发往你配置的 OpenAI 兼容模型服务。密钥与历史仅保存在当前浏览器本地。

**在线体验（GitHub Pages）**：<https://kinglinh.github.io/gpt-image-2-studio-vue/>

## 功能

### 单图
- 文生图，支持「用文字模型优化提示词」与结果预览/下载
- **风格预设快捷标签**：一键追加 写实摄影 / 动漫 / 水彩 / 赛博朋克 等风格修饰
- **提示词片段库**：保存常用提示词，搜索 + 一键插入（本地持久化）
- 图生图：上传参考图走 `/images/edits`（multipart）

### 批量生图
- 同一提示词生成多张（可加「风格锁定」）
- 自定义多条提示词（最多 20 条）
- **批量粘贴导入**：每行一条提示词，秒建任务列表
- **✨ AI 提示词拆分**：输入主提示词，调用文字模型自动拆成多条可编辑子任务（通用 / 风格统一 / 系列组图 三种模板，自带数量推荐）
- 并发队列、间隔控制、失败自动重试、auth/cost_risk 自动暂停、可取消

### 历史
- 按日期/批次分组，缩略图预览、复用提示词、下载 **原图**、删除
- 原图与缩略图存 IndexedDB，localStorage 仅留元数据（不爆 5MB 配额）

### 其它
- **暗色模式**：跟随系统 / 浅色 / 深色 一键切换
- 全局错误兜底（渲染错误与未处理 Promise 不再静默丢失）
- 设置：Base URL / API Key / 文字模型 / 图片模型 / 超时 / 尺寸 / 数量 / 质量 / 格式 / 压缩 / 批量默认值，支持「测试文字模型」「测试图片模型」连通性

## 快速开始

```bash
npm install
npm run dev      # 打开 http://localhost:5173
npm run build    # 产出 dist/
npm run preview  # 预览构建产物
```

首次使用：

1. 进入「设置」，填写 `Base URL`、`API Key`、文字模型名、图片模型名。
2. 把超时设到 ≥ 180 秒（生图常需 1~3 分钟）。
3. 点「测试文字模型」「测试图片模型」验证连通，再开始生成。

## 技术栈

- Vue 3（Composition API / `<script setup>`）
- Vite、TypeScript
- Element Plus（按需引入）、Vue Router（hash 模式）、Pinia（localStorage 持久化）
- IndexedDB（`idb-keyval` 存原图/缩略图）
- `unplugin-auto-import` / `unplugin-vue-components`（按需引入与打包瘦身）

## 目录结构

```
src/
├── core/        # 纯逻辑（无 Vue 依赖），移植自参考项目
│   ├── api.ts           # OpenAI 兼容请求（responses→chat/completions 回退、images/generations、images/edits）
│   ├── config.ts        # 配置类型/默认值/校验/normalizeBaseUrl
│   ├── imageOptions.ts  # 尺寸/质量/格式与尺寸校验
│   ├── batch.ts         # 并发队列/重试/暂停/取消
│   ├── history.ts       # 记录类型与分组
│   ├── fileNames.ts     # 文件名/日期目录
│   ├── providerErrors.ts# 错误分类（决定重试/暂停）
│   └── storage.ts       # localStorage、缩略图、下载、目录授权
├── stores/      # Pinia：config、history
├── composables/ # useImageGeneration、useBatch、promptTransfer
├── views/       # SingleView、BatchView、HistoryView、SettingsView
└── App.vue / main.ts / router/
```

## API 契约（OpenAI 兼容）

| 用途 | 方法 & 路径 | 说明 |
| --- | --- | --- |
| 文字模型 | `POST {baseUrl}/responses` | body `{ model, input: [{role, content}] }`；遇 404/405/501 等错误自动回退 `/chat/completions` |
| 文生图 | `POST {baseUrl}/images/generations` | JSON：`model/prompt/size/quality/n/output_format/output_compression?` |
| 图生图 | `POST {baseUrl}/images/edits` | FormData：同上字段 + `image[]`（每张参考图） |

所有请求带 `Authorization: Bearer {apiKey}`；`baseUrl` 自动补齐 `/v1`。图片响应解析 `data[].b64_json | base64 | image_base64`，缺则取 `url | image_url`。

## 注意事项

- 纯浏览器能否直连模型服务，取决于供应商是否允许 CORS。出现 CORS 错误时，请换支持浏览器访问的供应商或自建代理。
- 历史记录仅保存压缩缩略图以控制 `localStorage` 体积；原图请及时「下载」保存。
- 切勿把真实 `API Key` 提交到代码仓库、Issue 或截图。

## License

MIT
