// MiniLM only reads the first ~256 tokens of each input, so long text is split
// into ~700-character pieces, each prefixed with a header that says what it
// belongs to. That way every chunk is still meaningful on its own.
const MAX_CHARS = 700;

export function chunkText(header: string, body: string): string[] {
  const text = body.replace(/\r\n/g, "\n").trim();
  if (!text) return [header];

  const budget = Math.max(200, MAX_CHARS - header.length);
  const pieces: string[] = [];
  let current = "";

  for (const para of text.split(/\n{2,}/)) {
    for (const part of splitLong(para.trim(), budget)) {
      if (!part) continue;
      if (current && current.length + part.length + 2 > budget) {
        pieces.push(current);
        current = part;
      } else {
        current = current ? `${current}\n\n${part}` : part;
      }
    }
  }
  if (current) pieces.push(current);

  return pieces.map((p) => `${header}\n${p}`);
}

function splitLong(text: string, budget: number): string[] {
  if (text.length <= budget) return [text];
  const out: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let cur = "";
  for (const s of sentences) {
    if (s.length > budget) {
      if (cur) out.push(cur), (cur = "");
      for (let i = 0; i < s.length; i += budget) out.push(s.slice(i, i + budget));
    } else if (cur.length + s.length + 1 > budget) {
      out.push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur) out.push(cur);
  return out;
}
