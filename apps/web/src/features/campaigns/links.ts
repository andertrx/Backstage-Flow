/** Mantém só o período (periodo/de/ate) ao navegar entre campanha, conjunto e anúncio. */
export function periodQueryString(params: URLSearchParams): string {
  const keep = new URLSearchParams();
  for (const k of ["periodo", "de", "ate"]) {
    const v = params.get(k);
    if (v) keep.set(k, v);
  }
  const q = keep.toString();
  return q ? `?${q}` : "";
}
