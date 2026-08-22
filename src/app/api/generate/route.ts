import { createColoringAI } from "@/lib/ai/createProvider";
import type { GenerateProgress } from "@/lib/ai/types";
import { toPublicErrorMessage } from "@/lib/security/publicError";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GenerateRequest, GeneratedSheet } from "@/lib/session/types";

export const maxDuration = 120;

type StreamEvent =
  | ({ type: "status" } & GenerateProgress)
  | { type: "sheet"; sheet: GeneratedSheet }
  | { type: "error"; error: string };

export async function POST(request: Request) {
  const body = (await request.json()) as GenerateRequest;
  if (!body.session?.idea) {
    return Response.json({ error: "Missing idea." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const ai = createColoringAI();
        const sheet = await ai.generate(body, {
          onProgress: (progress) => {
            send({ type: "status", ...progress });
          },
        });

        const supabase = await createSupabaseServerClient();
        if (supabase) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            const path = `${user.id}/${body.session.id}.png`;
            const match = sheet.imageDataUrl.match(/^data:(.+);base64,(.+)$/);
            if (match && match[1].includes("png")) {
              const bytes = Buffer.from(match[2], "base64");
              await supabase.storage.from("sheets").upload(path, bytes, {
                contentType: "image/png",
                upsert: true,
              });
              await supabase.from("coloring_sessions").upsert({
                id: body.session.id,
                user_id: user.id,
                idea: body.session.idea,
                print_prefs: body.session.printPrefs,
                likes: body.session.likes,
                last_feedback: body.session.lastFeedback,
                status: "done",
                updated_at: new Date().toISOString(),
              });
              await supabase.from("generated_sheets").insert({
                session_id: body.session.id,
                user_id: user.id,
                title: sheet.title,
                image_path: path,
              });
            }
          }
        }

        send({ type: "sheet", sheet });
      } catch (error) {
        send({
          type: "error",
          error: toPublicErrorMessage(error, "The crayons jammed."),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
