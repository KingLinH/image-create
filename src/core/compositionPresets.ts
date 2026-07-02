// 构图预设：一键追加构图/版式修饰，海报场景常用。

export type CompositionPreset = {
  id: string;
  label: string;
  modifiers: string; // 追加到提示词的构图修饰（中文）
};

export const COMPOSITION_PRESETS: CompositionPreset[] = [
  { id: "top-space", label: "顶部留白放标题", modifiers: "顶部留出大面积留白用于放置标题文字，主视觉集中在画面下方" },
  { id: "centered", label: "居中主体", modifiers: "居中构图，主体居中，背景干净简洁，突出主题" },
  { id: "rule-of-thirds", label: "三分法", modifiers: "三分法构图，主体位于三分之一交叉点，画面富有动感" },
  { id: "symmetry", label: "对称构图", modifiers: "对称构图，庄重平衡，正式感强" },
  { id: "fullbleed", label: "满版冲击", modifiers: "满版构图，主体充满整个画面，强烈的视觉冲击力" },
];

export function findCompositionPreset(id: string): CompositionPreset | undefined {
  return COMPOSITION_PRESETS.find((p) => p.id === id);
}

export function resolveCompositionModifiers(activeIds: string[]): string[] {
  return activeIds
    .map((id) => findCompositionPreset(id)?.modifiers)
    .filter((m): m is string => Boolean(m));
}
