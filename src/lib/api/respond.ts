import { NextResponse } from "next/server";
import type { ApiResult } from "@/lib/api/types";

export function jsonResult<T>(result: ApiResult<T>, status = 200) {
  if (result.error) {
    const code = result.error.code;
    const httpStatus = code === "SUSPENDED" ? 403 : status >= 400 ? status : 400;
    return NextResponse.json(result, { status: httpStatus });
  }
  return NextResponse.json(result, { status });
}

export function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json(
    { data: null, error: { message, ...(code ? { code } : {}) } } satisfies ApiResult<never>,
    { status },
  );
}
