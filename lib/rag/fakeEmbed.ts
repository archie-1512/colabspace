// Test-only stand-in for the real model (enabled with RAG_FAKE_EMBEDDINGS=1).
// Hashes words into 384 buckets, so texts sharing words land close together.
// Good enough to exercise indexing, permissions, and retrieval end to end
// without downloading anything. Never used unless that env var is set.
export function fakeEmbed(text: string): number[] {
  const v = new Array(384).fill(0);
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const w of words) {
    if (w.length < 3) continue;
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w.charCodeAt(i), 16777619);
    v[Math.abs(h) % 384] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}
