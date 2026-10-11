import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as library from "@/server/libraryService";

export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const result = await library.listProjects(auth.user.id);
  return jsonResult(result, result.error ? 500 : 200);
}

export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  if (body.name != null && typeof body.name !== "string") return jsonError("name must be a string", 400);
  const result = await library.createProject(auth.user.id, body.name ?? "");
  return jsonResult(result, result.error ? 500 : 201);
}
