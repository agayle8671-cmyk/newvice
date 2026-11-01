// URL safety helpers — used anywhere a URL from the database / user input is
// rendered into an <a href> or fetched server-side.

/** Returns the URL string only if it is a plain http(s) URL; otherwise null (blocks javascript:, data:, etc.). */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
