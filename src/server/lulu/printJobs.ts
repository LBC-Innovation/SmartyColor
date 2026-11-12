import { luluFetch } from "@/server/lulu/client";
import type { LuluPrintJobPayload } from "@/lib/print/luluPayload";

export type LuluPrintJobStatus = {
  name?: string;
  message?: string;
  changed?: string;
  line_item_statuses?: Array<{
    name?: string;
    messages?: {
      tracking_id?: string;
      tracking_urls?: string[];
      carrier_name?: string;
    };
  }>;
};

export type LuluPrintJob = {
  id?: number;
  external_id?: string;
  status?: LuluPrintJobStatus;
  line_items?: Array<{
    status?: LuluPrintJobStatus;
    tracking_id?: string;
    tracking_urls?: string[];
  }>;
};

export async function fetchLuluPrintJob(printJobId: number): Promise<LuluPrintJob> {
  return luluFetch<LuluPrintJob>(`/print-jobs/${printJobId}/`);
}

/**
 * Creates the print job (POST /print-jobs/). Lulu downloads the interior and cover from the
 * source URLs asynchronously, so those must stay valid for days (see PRINT_FILE_URL_TTL_SECONDS).
 */
export async function createLuluPrintJob(payload: LuluPrintJobPayload): Promise<LuluPrintJob> {
  return luluFetch<LuluPrintJob>("/print-jobs/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Cancel an unpaid (or cancel-eligible) Lulu print job. */
export async function cancelLuluPrintJob(printJobId: number): Promise<void> {
  await luluFetch(`/print-jobs/${printJobId}/status/`, {
    method: "PUT",
    body: JSON.stringify({ name: "CANCELED" }),
  });
}

export function extractTrackingFromPrintJob(job: LuluPrintJob): {
  trackingNumber: string | null;
  trackingUrls: string[];
  carrier: string | null;
} {
  const urls: string[] = [];
  let trackingNumber: string | null = null;
  let carrier: string | null = null;

  const lineStatuses = job.status?.line_item_statuses ?? [];
  for (const item of lineStatuses) {
    const messages = item.messages;
    if (messages?.tracking_id && !trackingNumber) {
      trackingNumber = messages.tracking_id;
    }
    if (messages?.tracking_urls?.length) {
      urls.push(...messages.tracking_urls);
    }
    if (messages?.carrier_name && !carrier) {
      carrier = messages.carrier_name;
    }
  }

  for (const line of job.line_items ?? []) {
    if (line.tracking_id && !trackingNumber) trackingNumber = line.tracking_id;
    if (line.tracking_urls?.length) urls.push(...line.tracking_urls);
  }

  return {
    trackingNumber,
    trackingUrls: [...new Set(urls)],
    carrier,
  };
}
