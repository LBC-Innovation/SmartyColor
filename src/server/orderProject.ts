import "server-only";
import { projectAccess } from "@/server/libraryAccess";

/**
 * The album a book draft says it was made from, if the caller may use it: undefined when none
 * was sent (leave the order's album as it is), null when it isn't one of theirs.
 */
export async function orderProjectId(userId: string, raw: unknown): Promise<string | null | undefined> {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !/^[0-9a-f-]{36}$/i.test(raw)) return null;
  const access = await projectAccess(userId, raw);
  return access ? raw : null;
}
