// 海报类型：每类带推荐尺寸、默认构图、起始模板提示词骨架。

export type PosterType = {
  id: string;
  label: string;
  emoji: string;
  sizes: string[]; // 推荐尺寸（须为合法尺寸：16 的倍数、边长 ≤3840、长宽比 ≤3:1）
  defaultComposition: string; // 默认构图 preset id
  template: string; // 起始模板提示词骨架
};

export const POSTER_TYPES: PosterType[] = [
  {
    id: "product",
    label: "产品电商",
    emoji: "🛍️",
    sizes: ["1024x1024", "1024x1536", "864x1536"],
    defaultComposition: "centered",
    template:
      "一张【产品名】的电商主图海报，产品居中展示，背景干净高级，突出质感与卖点，专业商业摄影光感，主色调【主色】。",
  },
  {
    id: "promo",
    label: "活动营销",
    emoji: "📣",
    sizes: ["1024x1536", "864x1536", "1024x1024"],
    defaultComposition: "top-space",
    template:
      "一张【活动名】营销海报，主视觉冲击力强，顶部留白放标题「【标题】」，节日/促销氛围浓厚，主色调【主色】，高对比、信息层级清晰。",
  },
  {
    id: "social",
    label: "社交新媒体",
    emoji: "📱",
    sizes: ["1024x1024", "1024x1536", "1024x1820"],
    defaultComposition: "centered",
    template:
      "一张新媒体配图/小红书风海报，主题【主题】，清新时尚的社交调性，主色调【主色】，适合手机浏览，质感细腻。",
  },
  {
    id: "notice",
    label: "通知招聘",
    emoji: "📌",
    sizes: ["864x1536", "1024x1536"],
    defaultComposition: "top-space",
    template:
      "一张【讲座/招聘/通知】主题的海报，版式规整，顶部留白放标题「【标题】」，信息区清晰，主色调【主色】，专业可信的氛围。",
  },
  {
    id: "festival",
    label: "节日主题",
    emoji: "🎉",
    sizes: ["1024x1536", "864x1536", "1024x1024"],
    defaultComposition: "centered",
    template:
      "一张【节日名】主题海报，浓厚的节日氛围与装饰元素，主视觉居中，主色调【主色】，喜庆/温馨，画面精致。",
  },
];

export function findPosterType(id: string): PosterType | undefined {
  return POSTER_TYPES.find((t) => t.id === id);
}
