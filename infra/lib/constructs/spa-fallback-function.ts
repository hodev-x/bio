/**
 * Viewer-request function for the DEFAULT behavior only: a URI whose last
 * segment has no extension is a client-side route, so serve the SPA shell.
 * Attaching this per behavior (instead of distribution-wide error responses)
 * keeps /api/* 404s as real 404s — the public post page relies on that.
 *
 * "/apps/<name>" (no trailing slash) matches no app behavior, so it lands
 * here and is redirected to "/apps/<name>/".
 */
export function spaFallbackCode(): string {
  return `function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (/^\\/apps\\/[a-z][a-z0-9-]*$/.test(uri)) {
    return { statusCode: 301, statusDescription: "Moved Permanently", headers: { location: { value: uri + "/" } } };
  }
  if (uri !== "/" && uri.split("/").pop().indexOf(".") === -1) {
    request.uri = "/index.html";
  }
  return request;
}`;
}
