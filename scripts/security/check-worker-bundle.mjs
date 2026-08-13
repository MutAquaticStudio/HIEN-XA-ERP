import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const candidateWorkerPaths = [
  resolve(process.cwd(), ".open-next", "worker.js"),
  resolve(process.cwd(), ".open-next", "cloudflare", "worker.js"),
  resolve(process.cwd(), ".open-next", "cloudflare", "init.js"),
  resolve(process.cwd(), ".open-next", "cloudflare", "skew-protection.js"),
  resolve(process.cwd(), ".open-next", "cloudflare", "images.js"),
  resolve(process.cwd(), ".open-next", "server-functions", "default", "worker.js"),
  resolve(process.cwd(), ".open-next", "server-functions", "default", "entry.js"),
  resolve(process.cwd(), ".open-next", ".build", "index.js"),
  resolve(process.cwd(), ".open-next", ".build", "worker.js"),
  resolve(process.cwd(), ".open-next", "server-functions", "default", ".next", "server", "next-server.js"),
];

const workerPath = candidateWorkerPaths.find((path) => existsSync(path));

if (!workerPath) {
  throw new Error(
    `Worker bundle không tìm thấy trong các vị trí quét: ${candidateWorkerPaths
      .map((item) => item.replace(process.cwd(), "."))
      .join(", ")}. Hãy chạy: npx.cmd opennextjs-cloudflare build`
  );
}

let source;
try {
  source = readFileSync(workerPath, "utf8");
} catch (error) {
  throw new Error(`Không đọc được worker bundle tại ${workerPath}: ${error instanceof Error ? error.message : String(error)}`);
}

const forbidden = [
  /node_modules[\\/]undici[\\/]/i,
  /node_modules[\\/]wrangler[\\/]/i,
  /node_modules[\\/]miniflare[\\/]/i,
  /node_modules[\\/]opennext(?:js)?[\\/]?/i,
  /(?:require|from|import)\s*\(?["'](?:undici|wrangler|miniflare|opennextjs\/cloudflare|@opennextjs\/cloudflare)(?:["'\/])/i,
  /"dependencies":\s*\{[^}]*\b(undici|wrangler|miniflare|opennextjs-cloudflare|@opennextjs\/cloudflare)\b/i
];

for (const pattern of forbidden) {
  if (pattern.test(source)) {
    throw new Error(`Worker bundle may expose forbidden runtime dependency pattern: ${pattern}`);
  }
}

console.log(`PASS: Worker bundle scan: ${workerPath} không chứa dependency chạy runtime cấm (Undici/Wrangler/Miniflare/OpenNext).`);
