// 风格预设：一键给提示词追加风格修饰词。

export type StylePreset = {
  id: string;
  label: string;
  emoji: string;
  modifiers: string; // 追加到提示词末尾的风格修饰（英文，模型友好）
};

export const STYLE_PRESETS: StylePreset[] = [
  { id: "photoreal", label: "写实摄影", emoji: "📷", modifiers: "写实摄影风格，超高细节，8K 高清，自然光线，锐利对焦，景深效果" },
  { id: "anime", label: "动漫二次元", emoji: "🎌", modifiers: "动漫风格，赛璐璐上色，鲜艳色彩，干净线稿，日系动画质感" },
  { id: "watercolor", label: "水彩", emoji: "🎨", modifiers: "水彩画风格，柔和边缘，颜料晕染，纸张质感，细腻通透" },
  { id: "cyberpunk", label: "赛博朋克", emoji: "🌃", modifiers: "赛博朋克风格，霓虹灯光，未来都市，雨夜街道，电影感，银翼杀手美学" },
  { id: "flat", label: "极简扁平", emoji: "⬜", modifiers: "极简扁平设计，简洁形状，矢量风格，干净背景，现代感" },
  { id: "oil", label: "油画", emoji: "🖼️", modifiers: "油画风格，可见笔触，丰富肌理，古典光影，画布质感" },
  { id: "3d", label: "3D 渲染", emoji: "🧊", modifiers: "3D 渲染，辛烷渲染，电影级光照，体积光，超高细节，次表面散射" },
  { id: "ink", label: "国风水墨", emoji: "🖌️", modifiers: "中国水墨画，传统国画，写意笔法，宣纸质感，留白意境，典雅" },
];

export function findStylePreset(id: string): StylePreset | undefined {
  return STYLE_PRESETS.find((p) => p.id === id);
}

// 把激活的风格 id 列表解析成修饰词数组。
export function resolveStyleModifiers(activeIds: string[]): string[] {
  return activeIds
    .map((id) => findStylePreset(id)?.modifiers)
    .filter((m): m is string => Boolean(m));
}

// 把提示词与风格修饰拼成最终发送给模型的提示词。
export function composePrompt(prompt: string, activeIds: string[]): string {
  const modifiers = resolveStyleModifiers(activeIds);
  return [prompt.trim(), ...modifiers].filter(Boolean).join("，");
}
