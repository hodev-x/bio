export interface CfRequest {
  uri: string;
  method?: string;
  querystring?: Record<string, { value: string }>;
}
export interface CfResponse {
  statusCode: number;
  statusDescription?: string;
  headers: Record<string, { value: string }>;
}

/** Evaluates CloudFront Function source and returns its `handler`. */
export function loadHandler(code: string): (event: { request: CfRequest }) => CfRequest | CfResponse {
  return new Function(`${code}\nreturn handler;`)() as (event: { request: CfRequest }) => CfRequest | CfResponse;
}
