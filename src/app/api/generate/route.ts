import { createColoringAI } from "@/lib/ai/createProvider";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GenerateRequest } from "@/lib/session/types";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateRequest;
    if (!body.session?.idea) {
      return Response.json({ error: "Missing idea." }, { status: 400 });
    }

    const ai = createColoringAI();
    const sheet = await ai.generate(body);

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

    return Response.json({ sheet });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The crayons jammed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
