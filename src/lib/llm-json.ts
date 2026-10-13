// src/lib/llm-json.ts
// LLM応答からJSON部分を取り出す（APIルート間で共有）

/**
 * コードフェンス内、または最初の { から最後の } までを取り出す
 */
export function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json|risk-heatmap|gsn-heatmap)?\s*\n([\s\S]*?)```/);
  if (fenced) return fenced[1];
  // 前後に文章が付いた場合に備え、最初の { から最後の } までを取り出す
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}
