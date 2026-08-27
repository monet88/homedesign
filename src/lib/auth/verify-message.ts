/** Client copy for unverified users attempting billable actions (ADR 0001 / US9). */

export const EMAIL_VERIFY_MESSAGE =
  "Verify your email before generating. Check your inbox for a verification link, or sign in again to request a new one.";

export function isEmailNotVerifiedError(status: number, error?: string): boolean {
  return status === 403 && error === "EMAIL_NOT_VERIFIED";
}

export function isInsufficientCreditsError(status: number, error?: string): boolean {
  return status === 402 && error === "INSUFFICIENT_CREDITS";
}
