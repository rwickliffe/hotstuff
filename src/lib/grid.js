/**
 * @template {{ [key: string]: unknown }} T
 * @param {T[]} items
 * @param {string} field
 * @param {unknown} value
 * @returns {T[]}
 */
export function byField(items, field, value) {
  const want = String(value ?? "")
    .trim()
    .toLowerCase();
  return items.filter(function (item) {
    return (
      String(item[field] ?? "")
        .trim()
        .toLowerCase() === want
    );
  });
}

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T) => boolean} predicate
 * @param {number} max
 * @returns {T[]}
 */
export function selectOrFallback(items, predicate, max) {
  const picked = items.filter(predicate);
  return (picked.length ? picked : items).slice(0, max);
}
