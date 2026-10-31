/** One line, at most `max` characters: what a progress line may hold. */
export function oneLine(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** The last non-empty line of a CLI's stderr, for a failure reason. */
export function lastLine(text: string): string {
  return text.split('\n').map(line => line.trim()).filter(Boolean).at(-1) ?? ''
}
