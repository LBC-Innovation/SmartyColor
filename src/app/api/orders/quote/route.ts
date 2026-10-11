import { jsonError, jsonResult } from "@/lib/api/respond";
import { getBookBinding, type BookBindingId } from "@/lib/print/bookBindings";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { luluConfigured } from "@/server/lulu/config";
import { fetchLuluPrintJobCost } from "@/server/lulu/costCalculation";
import { lookupUsPostcode, normalizeUsPostcode } from "@/server/shipping/usPostcodeLookup";

export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;

  const body = (await request.json()) as {
    bindingId?: BookBindingId;
    pageCount?: number;
    shippingPostcode?: string;
    shippingLevel?: string;
    shippingAddress?: { city?: string; state_code?: string; postcode?: string; country_code?: string };
  };

  if (body.bindingId !== "perfect_bound" && body.bindingId !== "saddle_stitch") {
    return jsonError("bindingId must be perfect_bound or saddle_stitch", 400);
  }
  if (typeof body.pageCount !== "number" || !Number.isInteger(body.pageCount) || body.pageCount < 1) {
    return jsonError("pageCount must be a positive integer", 400);
  }

  const binding = getBookBinding(body.bindingId);
  if (body.pageCount > binding.maxPages) {
    return jsonError(`pageCount exceeds maximum of ${binding.maxPages} for this binding`, 400);
  }

  if (!luluConfigured()) {
    return jsonResult({
      data: {
        estimatedTotalCents: null,
        printCents: null,
        shippingCents: null,
        currency: "USD",
        source: "unconfigured",
        shippingPostcode: null,
        shippingLevel: body.shippingLevel ?? "MAIL",
      },
      error: null,
    });
  }

  let shippingAddressOverride: {
    city: string;
    state_code: string;
    postcode: string;
    country_code: string;
  } | undefined;
  let resolvedPostcode: string | null = null;

  const addr = body.shippingAddress;
  if (addr && addr.city?.trim() && addr.postcode?.trim() && (addr.country_code ?? "US") === "US" && addr.state_code?.trim()) {
    const usPostcode = normalizeUsPostcode(addr.postcode) ?? addr.postcode.trim();
    resolvedPostcode = usPostcode;
    shippingAddressOverride = {
      city: addr.city.trim(),
      state_code: addr.state_code.trim().toUpperCase(),
      postcode: usPostcode,
      country_code: "US",
    };
  } else if (addr && addr.city?.trim() && addr.postcode?.trim() && addr.country_code && addr.country_code !== "US") {
    resolvedPostcode = addr.postcode.trim();
    shippingAddressOverride = {
      city: addr.city.trim(),
      state_code: addr.state_code?.trim().toUpperCase() ?? "",
      postcode: resolvedPostcode,
      country_code: addr.country_code.trim().toUpperCase(),
    };
  } else if (typeof body.shippingPostcode === "string" && body.shippingPostcode.trim()) {
    try {
      const location = await lookupUsPostcode(body.shippingPostcode);
      resolvedPostcode = location.postcode;
      shippingAddressOverride = {
        city: location.city,
        state_code: location.stateCode,
        postcode: location.postcode,
        country_code: "US",
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Invalid ZIP code";
      return jsonResult({
        data: {
          estimatedTotalCents: null,
          printCents: null,
          shippingCents: null,
          currency: "USD",
          source: "zip_error",
          bindingId: binding.id,
          pageCount: body.pageCount,
          shippingPostcode: normalizeUsPostcode(body.shippingPostcode),
          shippingLevel: body.shippingLevel ?? "MAIL",
          quoteError: message,
        },
        error: null,
      });
    }
  }

  try {
    const breakdown = await fetchLuluPrintJobCost({
      podPackageId: binding.podPackageId,
      pageCount: body.pageCount,
      shippingLevel: body.shippingLevel,
      shippingAddress: shippingAddressOverride,
    });
    return jsonResult({
      data: {
        estimatedTotalCents: breakdown.totalCents,
        printCents: breakdown.printCents,
        shippingCents: breakdown.shippingCents,
        currency: breakdown.currency,
        source: "lulu",
        bindingId: binding.id,
        pageCount: body.pageCount,
        shippingPostcode: resolvedPostcode,
        shippingLevel: breakdown.shippingLevel,
        quoteError: null,
      },
      error: null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not fetch print estimate";
    console.error(
      JSON.stringify({
        level: "error",
        message: "Order quote failed",
        luluStatus: e && typeof e === "object" && "status" in e ? (e as { status: number }).status : undefined,
        error: message,
      }),
    );
    return jsonResult({
      data: {
        estimatedTotalCents: null,
        printCents: null,
        shippingCents: null,
        currency: "USD",
        source: "lulu_error",
        bindingId: binding.id,
        pageCount: body.pageCount,
        shippingPostcode: resolvedPostcode,
        shippingLevel: body.shippingLevel ?? "MAIL",
        quoteError: message,
      },
      error: null,
    });
  }
}
