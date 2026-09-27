// React 19 hoists <title>/<meta> rendered by components into <head>, but only
// dedupes against tags it rendered itself — it APPENDS after the static tags
// baked into index.html rather than replacing them. Non-JS scrapers still see
// the static index.html tags as a fallback; call this once, before mounting,
// so JS-capable crawlers and browsers see only the per-route tags instead of
// both.
export function stripStaticMeta(): void {
  document.head
    .querySelectorAll(
      'meta[name="description"], meta[property="og:title"], meta[property="og:description"], link[rel="canonical"], meta[property="og:url"]',
    )
    .forEach((n) => n.remove());
}
