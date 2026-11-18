import shared from '../../../shared/permissions.json'

export const PERMISSION_KEYS: readonly string[] = shared.keys
export const isKnownPerm = (k: string): boolean => PERMISSION_KEYS.includes(k)

export function isSubset(items: Iterable<string>, of: ReadonlySet<string>): boolean {
  for (const i of items) if (!of.has(i)) return false
  return true
}

/** Izin yang berbeda antara dua himpunan (ditambah atau dicabut). */
export function changedPerms(before: Iterable<string>, after: Iterable<string>): string[] {
  const a = new Set(before)
  const b = new Set(after)
  return [...new Set([...a, ...b])].filter((k) => a.has(k) !== b.has(k))
}
