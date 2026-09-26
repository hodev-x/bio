// React 19 hoists <title>/<meta> rendered anywhere into <head>, replacing
// same-key tags — no helmet library needed.
export function Meta({ title, description }: { title: string; description?: string }) {
  return (
    <>
      <title>{title}</title>
      <meta property="og:title" content={title} />
      {description && <meta name="description" content={description} />}
      {description && <meta property="og:description" content={description} />}
    </>
  );
}
