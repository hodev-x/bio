/**
 * Viewer-request function for the DEFAULT behavior only: a URI whose last
 * segment has no extension is a client-side route, so serve the SPA shell.
 * Attaching this per behavior (instead of distribution-wide error responses)
 * keeps /api/* 404s as real 404s — the public post page relies on that.
 */
export function spaFallbackCode(): string {
  return `function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri !== "/" && uri.split("/").pop().indexOf(".") === -1) {
    request.uri = "/index.html";
  }
  return request;
}`;
}
