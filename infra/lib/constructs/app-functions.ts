/**
 * Viewer-request function for "/apps/<name>/api/*" behaviors: drops the
 * "/apps/<name>" prefix so the app's API keeps serving its own "/api/..."
 * routes. The query string is a separate field and passes through unchanged.
 */
export function appApiPrefixStripCode(): string {
  return `function handler(event) {
  var request = event.request;
  var match = request.uri.match(/^\\/apps\\/[a-z][a-z0-9-]*(\\/api\\/.*)$/);
  if (match) {
    request.uri = match[1];
  }
  return request;
}`;
}

/**
 * Viewer-request function for "/apps/<name>/*" behaviors: an extension-less
 * URI is a client-side route of that app, so serve its "index.html".
 */
export function appSpaFallbackCode(): string {
  return `function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var root = uri.match(/^\\/apps\\/[a-z][a-z0-9-]*\\//);
  if (root && uri.split("/").pop().indexOf(".") === -1) {
    request.uri = root[0] + "index.html";
  }
  return request;
}`;
}
