function normalizeConstraintTarget(target: string): string[] {
  const quotedIdentifiers = [...target.matchAll(/"((?:""|[^"])*)"/g)].map(
    (match) => match[1].replaceAll('""', '"').toLowerCase()
  )

  if (quotedIdentifiers.length > 0) return quotedIdentifiers

  return (target.match(/[A-Za-z_][A-Za-z0-9_$]*/g) ?? []).map((identifier) =>
    identifier.toLowerCase()
  )
}

export function normalizeUniqueConstraintTargets(target: unknown): string[] {
  const targets = Array.isArray(target)
    ? target.filter((entry): entry is string => typeof entry === "string")
    : typeof target === "string"
      ? [target]
      : []

  return [...new Set(targets.flatMap(normalizeConstraintTarget))]
}
