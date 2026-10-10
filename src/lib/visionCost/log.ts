import fs from "node:fs/promises";
import { VISION_COST_LOG_DIR, VISION_COST_LOG_FILE } from "@/lib/visionCost/paths";

export async function ensureLogDir() {
  await fs.mkdir(VISION_COST_LOG_DIR, { recursive: true });
}

export async function appendVisionCostLogLine(line: string) {
  try {
    await ensureLogDir();
    await fs.appendFile(VISION_COST_LOG_FILE, `${line}\n`, "utf8");
  } catch {
    /* read-only or ephemeral filesystem (e.g. Vercel) — skip file log */
  }
}

export async function readVisionCostLogTail(maxBytes = 120_000): Promise<string> {
  try {
    const handle = await fs.open(VISION_COST_LOG_FILE, "r");
    try {
      const stat = await handle.stat();
      const readStart = Math.max(0, stat.size - maxBytes);
      const length = stat.size - readStart;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, readStart);
      const text = buffer.toString("utf8");
      return readStart > 0 ? `…(truncated)\n${text}` : text;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return "";
    }
    throw error;
  }
}
