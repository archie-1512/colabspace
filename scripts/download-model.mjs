// Downloads the embedding model into RAG_MODEL_CACHE and runs it once.
// Used by the Dockerfile so the model ships inside the image: containers start
// without downloading anything, and a broken model fails the build, not prod.
import { pipeline, env } from "@huggingface/transformers";

env.cacheDir = process.env.RAG_MODEL_CACHE || "./models";
const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
const out = await extractor(["warm-up sentence"], { pooling: "mean", normalize: true });
console.log(`Embedding model ready in ${env.cacheDir} (output dims: ${out.dims.join("x")})`);
