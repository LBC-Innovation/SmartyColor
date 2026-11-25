import { jsonError, jsonResult } from "@/lib/api/respond";
import { getBookBinding, isPrintBindingId } from "@/lib/print/bookBindings";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { luluConfigured } from "@/server/lulu/config";
import { defaultQuoteShippingAddress } from "@/server/lulu/costCalculation";
import { luluShippingChoices } from "@/server/lulu/shippingOptions";
import { DEFAULT_SHIPPING_LEVEL, isShippingLevel } from "@/lib/orders/shippingLevels";
import { pricePrintOrder } from "@/server/pricingService";
import { purchaseCodeBookCoverage } from "@/server/purchaseCodesService";
import { orderProjectId } from "@/server/orderProject";
import { lookupUsPostcode, normalizeUsPostcode } from "@/server/shipping/usPostcodeLookup";

export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;

  const body = (await request.json()) as {
    bindingId?: string;
    pageCount?: number;
    shippingPostcode?: string;
    shippingLevel?: string;
    /** The main quote asks for shipping speeds and delivery dates; per-format price checks don't. */
    withShipping?: boolean;
    /** The album the book is made from: its purchase code's share is quoted too. */
    projectId?: string;
    shippingAddress?: {
      street1?: string;
      street2?: string;
      city?: string;
      state_code?: string;
      postcode?: string;
      country_code?: string;
    };
  };

  if (!isPrintBindingId(body.bindingId)) {
    return jsonError("bindingId must be a print binding", 400);
  }
  if (typeof body.pageCount !== "number" || !Number.isInteger(body.pageCount) || body.pageCount < 1) {
    return jsonError("pageCount must be a positive integer", 400);
  }

  if (body.shippingLevel !== undefined && !isShippingLevel(body.shippingLevel)) {
    return jsonError("shippingLevel is not one we offer", 400);
  }
  const shippingLevel = body.shippingLevel ?? DEFAULT_SHIPPING_LEVEL;

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
        taxCents: null,
        currency: "USD",
        source: "unconfigured",
        shippingPostcode: null,
        shippingLevel: body.shippingLevel ?? "MAIL",
      },
      error: null,
    });
  }

  let shippingAddressOverride: {
    street1?: string;
    street2?: string;
    city: string;
    state_code: string;
    postcode: string;
    country_code: string;
  } | undefined;
  let resolvedPostcode: string | null = null;

  const addr = body.shippingAddress;
  // The street goes to Lulu only so it can suggest a corrected address; quotes don't depend on it.
  const street1 = typeof addr?.street1 === "string" ? addr.street1.trim() : "";
  const street2 = typeof addr?.street2 === "string" ? addr.street2.trim() : "";
  const streetFields = street1 ? { street1, ...(street2 ? { street2 } : {}) } : {};
  if (addr && addr.city?.trim() && addr.postcode?.trim() && (addr.country_code ?? "US") === "US" && addr.state_code?.trim()) {
    const usPostcode = normalizeUsPostcode(addr.postcode) ?? addr.postcode.trim();
    resolvedPostcode = usPostcode;
    shippingAddressOverride = {
      ...streetFields,
      city: addr.city.trim(),
      state_code: addr.state_code.trim().toUpperCase(),
      postcode: usPostcode,
      country_code: "US",
    };
  } else if (addr && addr.city?.trim() && addr.postcode?.trim() && addr.country_code && addr.country_code !== "US") {
    resolvedPostcode = addr.postcode.trim();
    shippingAddressOverride = {
      ...streetFields,
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
        taxCents: null,
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
    // The customer's price: Lulu's cost with our markup on the book, from the price catalog.
    // The printer's delivery dates come from a separate Lulu call; ask at the same time.
    const projectId = body.withShipping ? await orderProjectId(auth.user.id, body.projectId) : null;
    const [priced, choices, coverage] = await Promise.all([
      pricePrintOrder({
        bindingId: body.bindingId,
        pageCount: body.pageCount,
        shippingLevel,
        shippingAddress: shippingAddressOverride,
      }),
      body.withShipping
        ? luluShippingChoices({
            podPackageId: binding.podPackageId,
            pageCount: body.pageCount,
            address: shippingAddressOverride ?? defaultQuoteShippingAddress(),
          })
        : Promise.resolve(null),
      projectId
        ? purchaseCodeBookCoverage({
            userId: auth.user.id,
            projectId,
            pageCount: body.pageCount,
            bindingId: body.bindingId,
            shippingAddress: shippingAddressOverride ?? defaultQuoteShippingAddress(),
          })
        : Promise.resolve(null),
    ]);
    const delivery = choices?.find((c) => c.level === shippingLevel) ?? null;
    if (priced.error) throw new Error(priced.error.message);
    const { price } = priced.data;
    return jsonResult({
      data: {
        estimatedTotalCents: price.totalCents,
        // What the album's purchase code pays of the total (never more than it); null without one.
        coveredCents: coverage?.data ? Math.min(coverage.data.coveredCents, price.totalCents) : null,
        coverageError: coverage?.error ? "We couldn't price what your code covers right now." : null,
        printCents: price.printPriceCents,
        shippingCents: price.shippingCents,
        taxCents: price.taxCents,
        currency: "USD",
        source: "lulu",
        bindingId: binding.id,
        pageCount: body.pageCount,
        shippingPostcode: resolvedPostcode,
        shippingLevel: priced.data.shippingLevel,
        quoteError: null,
        addressSuggestion: priced.data.addressSuggestion,
        estimatedDeliveryMin: delivery?.deliveryMin ?? null,
        estimatedDeliveryMax: delivery?.deliveryMax ?? null,
        shippingChoices: choices ?? [],
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
        taxCents: null,
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
