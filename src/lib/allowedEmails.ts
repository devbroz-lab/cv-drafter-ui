/** Must match backend allowlist (api/services/email_allowlist.py). */

export const ALLOWED_EMAILS = new Set(
  [
    "b.hamid0210@gmail.com",
    "alias.wardakmd@gmail.com",
    "daksh.suryavanshi2003@gmail.com",
    "qamarali9584@gmail.com",
    "yashs9131@gmail.com",
    "mohdazam0453@gmail.com",
  ].map((e) => e.toLowerCase()),
);

export const ALLOWLIST_DENIED_MESSAGE =
  "Access is restricted. This email is not authorized to use Tailor-it.";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmailAllowed(email: string): boolean {
  return ALLOWED_EMAILS.has(normalizeEmail(email));
}
