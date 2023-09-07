import fetch , { Response, RequestInit } from 'node-fetch';
import HttpsProxyAgent from 'https-proxy-agent';

interface doFetchProps {
  url: string;
  config: FetchOptions;
}

interface FetchOptions extends Omit<RequestInit, "signal"> {
    proxy?: string;
    headers?: Record<string, string>;
    signal?: AbortSignal;
}

export function doFetch({ url, config }: doFetchProps): Promise<Response> {
  const instanceOptions: RequestInit = config || {};
  const proxy = config.proxy || process.env.http_proxy;
  if (!config.agent && proxy) {
    // @ts-ignore
    instanceOptions.agent = new HttpsProxyAgent(proxy);
  }
  return fetch(url, instanceOptions);
}
