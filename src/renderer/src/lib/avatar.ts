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
 *
 * One canonical size is requested regardless of where the avatar is rendered:
 * a single URL per author means the browser downloads the image once and every
 * usage (graph rows, detail panel) hits the same cache entry. 128px covers the
 * largest rendered size (28px) on 2x/3x displays.
 */
const CANONICAL_SIZE = 128

export function avatarUrl(email: string): string | null {
  const m = email
    .trim()
    .toLowerCase()
    .match(/^(?:(\d+)\+)?([^@+]+)@users\.noreply\.github\.com$/)
  if (!m) return null
  return m[1]
    ? `https://avatars.githubusercontent.com/u/${m[1]}?s=${CANONICAL_SIZE}&v=4`
    : `https://github.com/${encodeURIComponent(m[2])}.png?size=${CANONICAL_SIZE}`
}
