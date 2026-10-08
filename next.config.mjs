/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Loaded with Node's require at runtime instead of being bundled: transformers.js
    // ships a native ONNX runtime, and unpdf a large PDF.js build.
    serverComponentsExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "unpdf"],
  },
};

export default nextConfig;
