import type {
  FeedbackTurn,
  GenerateRequest,
  RefineRequest,
} from "@/lib/session/types";
import type { GeneratedSheet } from "@/lib/session/types";

export type GenerateProgress = {
  stage:
    | "drawing"
    | "filtered"
    | "rewriting"
    | "retrying"
    | "finishing";
  title: string;
  detail: string;
};

export type GenerateOptions = {
  onProgress?: (progress: GenerateProgress) => void;
};

export interface ColoringAI {
  refine(input: RefineRequest): Promise<FeedbackTurn>;
  generate(
    input: GenerateRequest,
    options?: GenerateOptions,
  ): Promise<GeneratedSheet>;
}
