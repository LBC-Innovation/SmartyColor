import type { ColoringAI } from "@/lib/ai/types";
import { parsePhotoDataUrl } from "@/lib/ai/photoDataUrl";
import type {
  PhotoColoringCorrectRequest,
  PhotoColoringGenerateRequest,
} from "@/lib/session/photoTypes";
import type { FeedbackTurn, GeneratedSheet } from "@/lib/session/types";

function newId() {
  return crypto.randomUUID();
}

function svgDataUrl(title: string, lines: string[], landscape: boolean) {
  const width = landscape ? 1100 : 850;
  const height = landscape ? 850 : 1100;
  const body = lines
    .map(
      (line, index) =>
        `<text x="50%" y="${220 + index * 48}" text-anchor="middle" font-size="28" fill="none" stroke="#111" stroke-width="2">${escapeXml(line)}</text>`,
    )
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="white"/>
    <rect x="36" y="36" width="${width - 72}" height="${height - 72}" fill="none" stroke="#111" stroke-width="6" rx="18"/>
    <text x="50%" y="120" text-anchor="middle" font-size="40" fill="none" stroke="#111" stroke-width="2">${escapeXml(title)}</text>
    <circle cx="${width / 2}" cy="${height / 2 + 40}" r="140" fill="none" stroke="#111" stroke-width="6"/>
    <circle cx="${width / 2 - 50}" cy="${height / 2}" r="18" fill="none" stroke="#111" stroke-width="4"/>
    <circle cx="${width / 2 + 50}" cy="${height / 2}" r="18" fill="none" stroke="#111" stroke-width="4"/>
    <path d="M ${width / 2 - 60} ${height / 2 + 70} Q ${width / 2} ${height / 2 + 110} ${width / 2 + 60} ${height / 2 + 70}" fill="none" stroke="#111" stroke-width="5"/>
    ${body}
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stubPhotoSheet(
  label: string,
  landscape: boolean,
  extraLine?: string,
): GeneratedSheet {
  return {
    title: "Photo coloring sheet (sample)",
    mimeType: "image/svg+xml",
    imageDataUrl: svgDataUrl(
      "From your photo",
      [label, extraLine ?? "Add a Gemini key for real photo tracing"].filter(
        Boolean,
      ) as string[],
      landscape,
    ),
  };
}

export function createStubProvider(): ColoringAI {
  return {
    async photoToColoring(input: PhotoColoringGenerateRequest) {
      parsePhotoDataUrl(input.photoDataUrl);
      return stubPhotoSheet(
        "Sample outline from your upload",
        input.printPrefs.orientation === "landscape",
      );
    },

    async correctPhotoColoring(input: PhotoColoringCorrectRequest) {
      parsePhotoDataUrl(input.photoDataUrl);
      parsePhotoDataUrl(input.sheetDataUrl);
      const note =
        input.corrections[0]?.slice(0, 60) ?? "Thanks for the notes";
      return stubPhotoSheet(
        "Sample fixed outline",
        input.printPrefs.orientation === "landscape",
        `Fix note: ${note}`,
      );
    },

    async refine(input) {
      const owned = /spider-?man|batman|disney|pokemon|mario|elsa|frozen|star wars|minecraft|skibidi/i.test(
        input.idea,
      );
      const blocked = /kill|blood|gun|murder|nude|sex|porn|gore/i.test(input.idea);

      if (blocked) {
        const turn: FeedbackTurn = {
          kind: "blocked",
          kidMessage:
            "That idea feels a little too scary or grown-up. Want a brave helper animal on a kind adventure instead?",
          saferIdea: "A brave puppy firefighter saving a kitten from a tree",
          points: [
            {
              id: newId(),
              text: "A brave puppy in a firefighter hat",
            },
            {
              id: newId(),
              text: "Gently helping a kitten down from a tree",
            },
          ],
        };
        return turn;
      }

      if (owned) {
        return {
          kind: "workaround",
          kidMessage:
            "Got it — we'll draw that look super close, just in our own printable way!",
          workaround: {
            originalIntent: input.idea,
            suggestion:
              "Same character vibe, costume shapes, pose, and scene — only skip logos and brand marks",
          },
          points: [
            {
              id: newId(),
              text: "The same hero look from your idea (costume shapes and gear)",
            },
            { id: newId(), text: "The same action and setting you asked for" },
            {
              id: newId(),
              text: `Keep the page ${input.printPrefs.detail} — not too crowded`,
            },
          ],
        };
      }

      return {
        kind: "ok",
        kidMessage: "Here's what I heard. Tap Yay if you like it!",
        points: [
          { id: newId(), text: input.idea },
          {
            id: newId(),
            text: `Drawn with ${input.printPrefs.detail} details`,
          },
        ],
      };
    },

    async generate(input) {
      const title = input.session.idea.slice(0, 42) || "My coloring sheet";
      const sheet: GeneratedSheet = {
        title,
        mimeType: "image/svg+xml",
        imageDataUrl: svgDataUrl(
          title,
          [
            "Sample page for local testing",
            "Add a Gemini key to draw for real",
          ],
          input.session.printPrefs.orientation === "landscape",
        ),
      };
      return sheet;
    },
  };
}
