import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: resolve(projectRoot, ".env.local") });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Configure it in .env.local or the environment.");
  process.exit(1);
}

if (!process.env.DIRECT_URL) {
  const directUrl = new URL(process.env.DATABASE_URL);
  directUrl.hostname = directUrl.hostname.replace(/-pooler(?=\.)/i, "");
  process.env.DIRECT_URL = directUrl.toString();
}

const prismaCli = resolve(projectRoot, "node_modules/prisma/build/index.js");
const result = spawnSync(
  process.execPath,
  [prismaCli, "migrate", "dev", ...process.argv.slice(2)],
  { cwd: projectRoot, env: process.env, stdio: "inherit" },
);

process.exit(result.status ?? 1);
