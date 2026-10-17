import "server-only";
import { INSUFFICIENT_CREDITS_CODE } from "@/lib/credits/pricing";
import type { PriceSku } from "@/lib/pricing/types";
import { chargeWalletUsage, insufficientCreditsBody, quoteWalletUsage } from "@/server/sheetUsageService";

/** Checks the wallet can pay for `sku` before the model is called; null when it can. */
export async function walletCheck(userId: string, sku: PriceSku): Promise<Response | null> {
  const quote = await quoteWalletUsage(userId, sku);
  if (quote.error) return Response.json({ error: quote.error.message }, { status: 500 });
  if (!quote.data.affordable) {
    return Response.json(
      insufficientCreditsBody("other", quote.data.costCents, quote.data.creditsBalanceCents),
      { status: 402 },
    );
  }
  return null;
}

/** Charges for `sku` once there is a result to hand over; a Response when it couldn't. */
export async function walletCharge(userId: string, sku: PriceSku): Promise<Response | null> {
  const charge = await chargeWalletUsage(userId, sku);
  if (!charge.error) return null;
  if (charge.error.code === INSUFFICIENT_CREDITS_CODE) {
    const quote = await quoteWalletUsage(userId, sku);
    return Response.json(
      insufficientCreditsBody("other", quote.data?.costCents ?? 0, quote.data?.creditsBalanceCents ?? 0),
      { status: 402 },
    );
  }
  return Response.json({ error: charge.error.message }, { status: 500 });
}
