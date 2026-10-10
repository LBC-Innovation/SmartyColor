import path from "node:path";

export const VISION_COST_LOG_DIR = path.join(process.cwd(), ".local");
export const VISION_COST_LOG_FILE = path.join(
  VISION_COST_LOG_DIR,
  "vision-api-costs.log",
);
