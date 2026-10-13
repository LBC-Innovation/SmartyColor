import type {
  GeneratedPhoto,
  PhotoColoringCorrectRequest,
  PhotoColoringGenerateRequest,
  PhotoPortraitRequest,
} from "@/lib/session/photoTypes";
import type { FeedbackTurn, GenerateRequest, RefineRequest } from "@/lib/session/types";
import type { GeneratedSheet } from "@/lib/session/types";

export interface ColoringAI {
  refine(input: RefineRequest): Promise<FeedbackTurn>;
  generate(input: GenerateRequest): Promise<GeneratedSheet>;
  photoToColoring(input: PhotoColoringGenerateRequest): Promise<GeneratedSheet>;
  correctPhotoColoring(input: PhotoColoringCorrectRequest): Promise<GeneratedSheet>;
  /** Recompose a landscape photo as a portrait one, keeping its people and content. */
  photoToPortrait(input: PhotoPortraitRequest): Promise<GeneratedPhoto>;
}
