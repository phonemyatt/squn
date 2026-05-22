import type { SqlFragment, TvpValue } from "./fragment.ts";
import { createFragment, isSqlFragment, isTvpValue } from "./fragment.ts";

const PLACEHOLDER_RE = /\$(\d+)/g;

/**
 * Renumbers $N placeholders in a fragment's text by adding an offset.
 * $1 with offset 2 becomes $3.
 */
function renumberPlaceholders(text: string, offset: number): string {
  if (offset === 0) return text;
  return text.replace(PLACEHOLDER_RE, (_, n: string) => `$${Number.parseInt(n, 10) + offset}`);
}

/**
 * Tagged template literal for SQL. Three interpolation paths:
 *
 * 1. Scalar → appended to params[], placeholder inserted in text
 * 2. Nested SqlFragment → text merged inline, params spliced in order, placeholders renumbered
 * 3. TvpValue → extracted to tvpValues[], __TVP_N__ sentinel in text
 * @public
 */
export function sql(strings: TemplateStringsArray, ...values: unknown[]): SqlFragment {
  const textParts: string[] = [];
  const params: unknown[] = [];
  const tvpValues: TvpValue[] = [];
  let paramIndex = 0;

  for (let i = 0; i < strings.length; i++) {
    textParts.push(strings[i] as string);

    if (i < values.length) {
      const value = values[i];

      if (isSqlFragment(value)) {
        // Path 2 — nested SqlFragment: merge text inline, splice params
        textParts.push(renumberPlaceholders(value.text, paramIndex));
        for (const p of value.params) {
          params.push(p);
          paramIndex++;
        }
        for (const tvp of value.tvpValues) {
          tvpValues.push(tvp);
        }
      } else if (isTvpValue(value)) {
        // Path 3 — TvpValue: sentinel in text, value to tvpValues
        const tvpIndex = tvpValues.length;
        tvpValues.push(value);
        textParts.push(`__TVP_${tvpIndex}__`);
      } else {
        // Path 1 — scalar: value to params, placeholder in text
        params.push(value);
        paramIndex++;
        textParts.push(`$${paramIndex}`);
      }
    }
  }

  return createFragment(textParts.join(""), params, tvpValues);
}
