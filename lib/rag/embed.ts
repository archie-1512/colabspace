// Local, free embeddings: all-MiniLM-L6-v2 running in-process via transformers.js.
// No API key, no rate limits. The model downloads once on first use and is
// cached on disk after that (baked into the image in Docker builds).
import { fakeEmbed } from "./fakeEmbed";

export const EMBEDDING_DIM = 384;
const MODEL = "Xenova/all-MiniLM-L6-v2";

type Extractor = (texts: string[], opts: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

const g = globalThis as unknown as { __ragExtractor?: Promise<Extractor> };

function getExtractor(): Promise<Extractor> {
  // Cached on globalThis so Next's dev hot-reload doesn't reload the model every edit.
  if (!g.__ragExtractor) {
    g.__ragExtractor = import("@huggingface/transformers").then(({ pipeline, env }) => {
      // In Docker the model is downloaded at build time into RAG_MODEL_CACHE,
      // so containers start without fetching anything.
      if (process.env.RAG_MODEL_CACHE) env.cacheDir = process.env.RAG_MODEL_CACHE;
      return pipeline("feature-extraction", MODEL) as unknown as Promise<Extractor>;
    });
    g.__ragExtractor.catch(() => (g.__ragExtractor = undefined)); // allow retry after a failed download
  }
  return g.__ragExtractor;
}

/** Embeds a batch of texts. Vectors are L2-normalized, so cosine distance works directly. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  // Offline/test mode: deterministic hashed bag-of-words vectors, no model download.
  if (process.env.RAG_FAKE_EMBEDDINGS === "1") return texts.map(fakeEmbed);

  const extractor = await getExtractor();
  const out = await extractor(texts, { pooling: "mean", normalize: true });
  return out.tolist();
}

/** pgvector's text format: "[0.1,0.2,...]" */
export function toVectorLiteral(v: number[]) {
  return `[${v.join(",")}]`;
}
