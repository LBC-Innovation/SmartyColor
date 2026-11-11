import { SIGN_IN, SIGN_UP } from "@/content/marketing";

/**
 * Turns the auth server's messages into plain words. Matching on text is a stopgap: the sign-in
 * and sign-up calls only hand the component a message string, not an error code.
 */

function offline(message: string): boolean {
  return /network error|failed to fetch/i.test(message);
}

function rateLimited(message: string): boolean {
  return /rate limit|too many|only request this after|security purposes/i.test(message);
}

export function friendlySignInError(message: string): string {
  if (/invalid login credentials|invalid credentials/i.test(message)) return SIGN_IN.wrongPassword;
  if (/not confirmed|confirm your email|no session returned/i.test(message)) return SIGN_IN.notConfirmed;
  if (rateLimited(message)) return SIGN_IN.tooManyTries;
  if (offline(message)) return "We couldn't reach the server. Check your connection and try again.";
  return SIGN_IN.fallbackError;
}

export type FriendlySignUpError = { text: string; accountExists: boolean; field: "email" | "password" | null };

export function friendlySignUpError(message: string): FriendlySignUpError {
  if (/already registered|already been registered|already exists/i.test(message)) {
    return { text: SIGN_UP.alreadyExists, accountExists: true, field: "email" };
  }
  if (/password/i.test(message) && /(least|short|weak|characters)/i.test(message)) {
    return { text: SIGN_UP.weakPassword, accountExists: false, field: "password" };
  }
  if (/valid email|invalid format|email address.*invalid/i.test(message)) {
    return { text: "That email address doesn't look right. Check it and try again.", accountExists: false, field: "email" };
  }
  if (rateLimited(message)) return { text: SIGN_UP.tooManyTries, accountExists: false, field: null };
  if (offline(message)) {
    return { text: "We couldn't reach the server. Check your connection and try again.", accountExists: false, field: null };
  }
  return { text: SIGN_UP.fallbackError, accountExists: false, field: null };
}
