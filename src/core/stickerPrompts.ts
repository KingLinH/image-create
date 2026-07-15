export const STICKER_ACTION_PRESETS = [
  "开心大笑",
  "委屈流泪",
  "震惊张嘴",
  "生气跺脚",
  "点头赞同",
  "摇头拒绝",
  "挥手打招呼",
  "比心感谢",
  "抱拳拜托",
  "躺平摆烂",
];

export function buildStickerPrompt(input: {
  character: string;
  action: string;
  text?: string;
  style?: string;
  transparent?: boolean;
}): string {
  const parts = [
    input.character.trim(),
    input.action.trim(),
    input.text?.trim() ? `画面中包含简短大字：${input.text.trim()}` : "不添加文字",
    input.style?.trim(),
    "微信表情包风格，主体居中，方形构图，边缘留白，表情夸张清晰，小尺寸下仍可辨认",
    input.transparent ? "透明背景或极简纯色背景" : "极简干净背景",
    "不要复杂场景，不要细碎装饰，不要水印，不要边框",
  ];
  return parts.filter(Boolean).join("，");
}

export function buildStickerFramePrompts(input: { character: string; action: string; frameCount: number; style?: string }): string[] {
  const count = Math.max(2, Math.min(24, Math.round(input.frameCount)));
  return Array.from({ length: count }, (_, index) => {
    const progress = count === 1 ? 1 : index / (count - 1);
    return buildStickerPrompt({
      character: input.character,
      action: `${input.action}，动画第 ${index + 1}/${count} 帧，动作进度 ${(progress * 100).toFixed(0)}%，同一角色同一镜头，仅动作逐帧变化`,
      style: input.style,
      transparent: true,
    });
  });
}
