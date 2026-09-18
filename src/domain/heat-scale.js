// One definition of the heat scale. The per-jar word, the filter button and
// the legend all read from this, so they cannot drift apart.
// prettier-ignore
export const BANDS = [
  { key: "all",    range: [0, 9], label: "Everything" },
  { key: "mild",   range: [1, 1], label: "Harmless" },
  { key: "medium", range: [2, 3], label: "Uneasy" },
  { key: "hot",    range: [4, 5], label: "Regrettable" },
  { key: "beyond", range: [6, 6], label: "No survivors" },
];

/**
 * @param {string} key
 * @returns {typeof BANDS[number]} the matching band, or the catch-all one.
 */
export function bandByKey(key) {
  for (let i = 0; i < BANDS.length; i++)
    if (BANDS[i].key === key) return BANDS[i];
  return BANDS[0];
}

/**
 * The word printed under a jar's flames.
 * @param {number} n
 * @returns {string} empty when the rating is outside the scale.
 */
export function heatWord(n) {
  for (let i = 1; i < BANDS.length; i++) {
    if (n >= BANDS[i].range[0] && n <= BANDS[i].range[1]) return BANDS[i].label;
  }
  return "";
}
