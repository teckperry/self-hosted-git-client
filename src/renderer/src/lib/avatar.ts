/**
 * Derive an author's avatar URL from their commit email — no API calls, no
 * authentication, no third-party services. GitHub's default (noreply) commit
 * emails encode the account:
 *
 *   "12345+name@users.noreply.github.com"  → user id 12345
 *   "name@users.noreply.github.com"        → username (legacy format)
 *
 * Both resolve straight against GitHub's public avatar CDN. Any other email
 * returns null and the UI keeps the initials badge.
 */
export function avatarUrl(email: string, size = 64): string | null {
  const m = email
    .trim()
    .toLowerCase()
    .match(/^(?:(\d+)\+)?([^@+]+)@users\.noreply\.github\.com$/)
  if (!m) return null
  return m[1]
    ? `https://avatars.githubusercontent.com/u/${m[1]}?s=${size}&v=4`
    : `https://github.com/${encodeURIComponent(m[2])}.png?size=${size}`
}
