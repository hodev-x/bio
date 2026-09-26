// React 19 hoists <title>/<meta> rendered anywhere into <head>, replacing
// same-key tags — no helmet library needed.
export function Meta({ title, description }: { title: string; description?: string }) {
  const href = typeof window !== "undefined" ? window.location.origin + window.location.pathname : undefined;
  return (
    <>
      <title>{title}</title>
      <meta property="og:title" content={title} />
      {description && <meta name="description" content={description} />}
      {description && <meta property="og:description" content={description} />}
      {href && <link rel="canonical" href={href} />}
      {href && <meta property="og:url" content={href} />}
    </>
  );
}
