/** `srcSet` for a /marketing image that has resized `-<width>.webp` siblings next to the full-size file. */
export function marketingSrcSet(src: string, widths: number[], fullWidth: number): string | undefined {
  if (widths.length === 0) return undefined;
  const base = src.replace(/\.webp$/, "");
  return [...widths.map((w) => `${base}-${w}.webp ${w}w`), `${src} ${fullWidth}w`].join(", ");
}

