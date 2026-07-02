// 文件名 / 日期目录工具（移植自参考项目 fileNames.ts）

export function formatDateFolder(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatTimestamp(date: Date): string {
  const base = formatDateFolder(date);
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${base}_${h}${min}${s}`;
}

// 把提示词转成简短、文件名安全的 slug。
export function slugifyPrompt(prompt: string, maxLen = 24): string {
  const trimmed = prompt.trim().replace(/\s+/g, "-");
  if (!trimmed) return "image";
  // 保留中文/字母/数字/连字符，其余替换为 -
  const cleaned = trimmed
    .replace(/[^\p{L}\p{N}-]/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const result = cleaned || "image";
  return result.length > maxLen ? result.slice(0, maxLen) : result;
}

export function buildImageFileName(prompt: string, index: number, ext: string, date = new Date()): string {
  const ts = formatTimestamp(date);
  const slug = slugifyPrompt(prompt);
  const suffix = index > 0 ? `-${index + 1}` : "";
  return `${ts}_${slug}${suffix}.${ext}`;
}

// 用于历史记录的「输出路径」字段（仅作为展示/分组依据，不实际写盘）。
export function buildOutputPath(directory: string, prompt: string, ext: string, date = new Date()): string {
  const folder = formatDateFolder(date);
  const dir = directory.trim() || "outputs";
  const name = buildImageFileName(prompt, 0, ext, date);
  return `${dir}/${folder}/${name}`.replace(/\\/g, "/");
}
