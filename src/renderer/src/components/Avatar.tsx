import React, { useReducer } from 'react'
import { avatarUrl } from '../lib/avatar'
import { initials, colorFromString } from '../lib/format'

/** URLs that already failed to load — shared so 50 rows of the same author
 *  don't retry a dead image, and the fallback shows without flicker. */
const failedUrls = new Set<string>()

/**
 * Author avatar: GitHub's picture when it can be derived from the commit email
 * (noreply addresses), otherwise — or when the image fails to load (offline,
 * deleted account…) — the usual initials badge. `size` is the box in px; the
 * image is requested at 2x for retina screens.
 */
export function Avatar({
  name,
  email,
  size,
  fontSize,
  className = '',
  title
}: {
  name: string
  email: string
  size: number
  fontSize: number
  className?: string
  title?: string
}): React.JSX.Element {
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const url = avatarUrl(email)

  if (url && !failedUrls.has(url)) {
    return (
      <img
        src={url}
        alt=""
        title={title}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => {
          failedUrls.add(url)
          bump()
        }}
        className={`rounded-full shrink-0 bg-app-panel-2 ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      title={title}
      className={`rounded-full flex items-center justify-center font-semibold text-white shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize, background: colorFromString(email) }}
    >
      {initials(name)}
    </span>
  )
}
