import type { PhotoLayout } from "@/lib/photo/orientation";
import type { VisionCostOperation } from "@/lib/visionCost/types";

/** An input image the model works from, with a caption saying what it is for. */
export type ImageReference = {
  base64: string;
  mediaType: string;
  caption: string;
};

export type ImageRequest = {
  /** Which app operation this is, for cost and error logging. */
  operation: VisionCostOperation;
  /** The main instruction, sent after the references. */
  prompt: string;
  /** Input images, in order. Empty for text-to-image. */
  references: ImageReference[];
  /** Canvas to draw on: orientation and aspect ratio of the output. */
  layout: PhotoLayout;
  /**
   * What the image is for. Coloring sheets (lineArt) are resampled to 2048 px
   * by the line-art step, so they need fewer pixels than a photo that is
   * printed as-is. Vendors that support exact sizes use this to pick one.
   */
  purpose: ImagePurpose;
  /**
   * Extra instructions appended after the prompt, e.g. a correction when a
   * previous attempt came back the wrong way round.
   */
  followUps?: string[];
};

export type ImageResult = {
  base64: string;
  mediaType: string;
};

/**
 * Facade over the image model vendor. The rest of the app asks for an image
 * through this interface only, so switching vendors is a config change
 * (IMAGE_PROVIDER) rather than a code change.
 */
export interface ImageGenerator {
  readonly vendor: ImageVendor;
  readonly modelId: string;
  generate(request: ImageRequest): Promise<ImageResult>;
}

export type ImageVendor = "gemini" | "openai";

export type ImagePurpose = "lineArt" | "photo";
