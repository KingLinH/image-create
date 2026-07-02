import { ref } from "vue";

// 跨视图传递「复用提示词」的简易单例：历史页设置 → 单图页挂载时消费。
export const pendingPrompt = ref("");

export function setPendingPrompt(prompt: string): void {
  pendingPrompt.value = prompt;
}

export function consumePendingPrompt(): string {
  const value = pendingPrompt.value;
  pendingPrompt.value = "";
  return value;
}
