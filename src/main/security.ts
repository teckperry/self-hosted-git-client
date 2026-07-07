// Security helpers for the main process. Centralises the allow-lists for the
// few places where a string coming from the renderer or from repository data
// reaches a powerful sink: the OS URL handler (shell.openExternal), git
// transports (clone / remote URLs), git argument parsing, and update downloads.

/** Protocols we are willing to hand to the OS default handler. */
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/**
 * True if `url` is safe to pass to `shell.openExternal`. Only web and mail URLs
 * are allowed; `file:`, `smb:`, custom application protocols, etc. are rejected
 * so a crafted link can't launch an arbitrary OS handler.
 */
export function isSafeExternalUrl(url: string): boolean {
  try {
    return EXTERNAL_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

// git's remote-helper syntax is `<transport>::<address>` (e.g. `ext::`, `fd::`).
// The `ext::` helper runs an arbitrary command, so `git clone 'ext::sh -c "…"'`
// is remote code execution. A leading dash makes git read the URL as an option.
const REMOTE_HELPER = /^[A-Za-z][A-Za-z0-9+.-]*::/

/**
 * True if `url` is a git URL we are willing to clone from / add as a remote.
 * Rejects the `ext::`/`fd::` remote-helper forms (command execution) and any
 * value git would parse as an option. Ordinary transports — https, http, ssh,
 * git, scp-like `user@host:path`, and local paths — pass through.
 */
export function isSafeGitUrl(url: string): boolean {
  const u = url.trim()
  if (!u) return false
  if (u.startsWith('-')) return false // option injection
  if (REMOTE_HELPER.test(u)) return false // ext::/fd:: remote helpers → RCE
  return true
}

export function assertSafeGitUrl(url: string): void {
  if (!isSafeGitUrl(url)) {
    throw new Error('Refusing an unsafe or unsupported Git URL. Use an https, ssh or git URL.')
  }
}

/** Whitespace or a control character — neither may appear in a valid refname. */
function hasWhitespaceOrControl(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code <= 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * True if `value` is safe to pass to git as a positional argument (a ref, tag
 * or branch name, a commit hash, a remote name). Rejects a leading dash — which
 * git reads as an option, so `createTag('-d', …)` could delete instead of
 * create — and any whitespace / control character, which would let a crafted
 * value inject an extra line into an interactive-rebase todo. git's own refname
 * rules forbid both, so this rejects nothing legitimate.
 */
export function isSafeGitArg(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0) return false
  if (value.startsWith('-')) return false
  return !hasWhitespaceOrControl(value)
}

export function assertSafeGitArg(value: string, what = 'name'): void {
  if (!isSafeGitArg(value)) {
    throw new Error(`Invalid ${what}: must not be empty, start with "-", or contain whitespace.`)
  }
}

/**
 * True if `name` is a plain SSH key filename with no path component. Key names
 * are joined onto `~/.ssh`, so a value containing a separator or `..` would let
 * `generateKey`/`deleteKey` write or delete files outside that directory.
 */
export function isSafeSshKeyName(name: string): boolean {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name !== '.' &&
    name !== '..' &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.includes('\0')
  )
}

export function assertSafeSshKeyName(name: string): void {
  if (!isSafeSshKeyName(name)) {
    throw new Error('Invalid SSH key name: it must not contain a path separator or "..".')
  }
}

// Hosts GitHub serves release assets from. Update downloads are pinned to these
// so a compromised or spoofed renderer can't turn the updater into a
// download-anything primitive.
const UPDATE_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com'
])

/** True if `url` is an https GitHub release-asset URL we can download. */
export function isSafeUpdateUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && UPDATE_HOSTS.has(u.hostname)
  } catch {
    return false
  }
}
