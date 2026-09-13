// Shapes shared across the page's modules. Written here rather than as JSDoc
// @typedef blocks because this is TypeScript syntax and reads like it - the
// Sheet shape in particular. Nothing imports this at run time: site.js pulls
// the names in with a JSDoc @import, which is a comment, so the file the
// browser gets is unchanged.

/**
 * One row of either sheet. It came out of a spreadsheet, so every field is a
 * string and nothing is a number until something parses it. Structurally the
 * same as what csvToObjects returns, which is why lib/data.js needs no
 * knowledge of this file.
 */
export type Product = Record<string, string>;

/** What the ?debug panel prints about one data source. */
export interface Source {
  state: string;
  rows?: number | null;
  note?: string;
}

/** A tab of the spreadsheet, and everything needed to render it. */
export interface Sheet {
  label: string;
  url: string;
  seed: string;
  source: Source;
  /** products ignores isLive; events uses it to drop the "sample dates" badge. */
  render: (rows: Product[], isLive: boolean) => void;
  hint: string;
  fallback: string;
}

/** What postMail answers with. */
export interface MailResult {
  ok: boolean;
  reason?: string;
}
