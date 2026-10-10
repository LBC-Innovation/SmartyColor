import Stripe from "stripe";
import { stripeSecretKey } from "@/server/stripe/config";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  const key = stripeSecretKey();
  if (!key) {
    throw new Error("Stripe is not configured");
  }
  if (!client) {
    client = new Stripe(key);
  }
  return client;
}
