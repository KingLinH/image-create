// 风格预设：一键给提示词追加风格修饰词。

export type StylePreset = {
  id: string;
  label: string;
  emoji: string;
  modifiers: string; // 追加到提示词末尾的风格修饰（英文，模型友好）
};

export const STYLE_PRESETS: StylePreset[] = [
  { id: "photoreal", label: "写实摄影", emoji: "📷", modifiers: "photorealistic, ultra detailed, 8k, natural lighting, sharp focus, depth of field" },
  { id: "anime", label: "动漫二次元", emoji: "🎌", modifiers: "anime style, cel shading, vibrant colors, clean line art, studio anime" },
  { id: "watercolor", label: "水彩", emoji: "🎨", modifiers: "watercolor painting, soft edges, flowing pigments, paper texture, delicate" },
  { id: "cyberpunk", label: "赛博朋克", emoji: "🌃", modifiers: "cyberpunk, neon lights, futuristic, rain-soaked streets, blade runner aesthetic, cinematic" },
  { id: "flat", label: "极简扁平", emoji: "⬜", modifiers: "flat design, minimal, clean shapes, vector style, simple background" },
  { id: "oil", label: "油画", emoji: "🖼️", modifiers: "oil painting, visible brushstrokes, rich texture, classical lighting, canvas" },
  { id: "3d", label: "3D 渲染", emoji: "🧊", modifiers: "3D render, octane render, cinematic lighting, volumetric, highly detailed, subsurface scattering" },
  { id: "ink", label: "国风水墨", emoji: "🖌️", modifiers: "chinese ink painting, traditional, sumi-e, minimalist brushwork, rice paper, elegant" },
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
