/** Apps may use external scripts, assets and APIs. Account cookies stay outside previews. */
export const PROJECT_CONTENT_POLICY =
  "default-src 'self' https: http: data: blob:; script-src 'self' https: http: 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' https: http: 'unsafe-inline'; img-src 'self' https: http: data: blob:; font-src 'self' https: http: data:; connect-src 'self' https: http: wss: ws:; media-src 'self' https: http: data: blob:; object-src 'none'; form-action https: http:; frame-src https: http:; worker-src blob:";
