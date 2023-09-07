import * as QueryString from 'querystring';
import { isStream } from 'is-stream';
import getStream from 'get-stream';
import FormData from 'form-data';
import { Agent } from 'http';
import { doFetch } from './fetch';
import { mergeData } from './data';
import { sign, signV3 } from './sign';
import { Credential } from './client';
import { Response } from 'node-fetch';

interface CgiRequestProps {
  endpoint: string;
  version: string;
  path: string;
  method: 'POST' | 'GET';
  url: string;
  action: string;
  data: Record<string, string>;
  credential: Credential;
  region: string;
  language: string;
  signMethod: 'HmacSHA1' | 'HmacSHA256';
  timeout: number;
  headers: Record<string, string>;
  agent: Agent;
  proxy: string;
}

interface CgiRequestWithSign3Props {
  method: 'POST' | 'GET';
  url: string;
  data: any;
  service: string;
  action: string;
  region: string;
  version: string;
  secretId: string;
  secretKey: string;
  multipart?: boolean;
  timeout?: number;
  token: string;
  language: string;
  headers?: Record<string, string>;
  agent?: Agent;
  proxy?: string;
}

export async function cgiRequest({
  endpoint,
  version,
  path,
  method,
  url,
  data,
  action,
  credential,
  region,
  language,
  signMethod,
  timeout,
  headers = {},
  agent,
  proxy,
}: CgiRequestProps): Promise<Response> {
  const config = {
    method,
    headers,
    body: null,
    timeout,
    agent,
    proxy,
  };

  const params = mergeData(data);
  params.Action = action;
  params.Nonce = Math.round(Math.random() * 65535);
  params.Timestamp = Math.round(Date.now() / 1000);
  params.Version = version;
  
  if (credential.secretId) params.SecretId = credential.secretId;
  if (region) params.Region = region;
  if (credential.token) params.Token = credential.token;
  if (language) params.Language = language;
  if (signMethod) params.SignatureMethod = signMethod;

  const signStr = formatSignString(params, method, endpoint, path);
  params.Signature = sign(credential.secretKey, signStr, signMethod);

  if (method === 'GET') {
    url += `?${QueryString.stringify(params)}`;
  }
  if (method === 'POST') {
    config.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    config.body = QueryString.stringify(params);
  }
  return await doFetch({ url, config });
}

function formatSignString(params = {}, method: 'POST' | 'GET', endpoint: string, path: string): string {
  let strParam = '';
  const keys = Object.keys(params);
  keys.sort();

  for (const key in keys) {
    if (!keys?.[key]) {
      continue;
    }
    strParam += `&${keys[key]}=${params[keys[key]]}`;
  }
  const strSign = `${method + endpoint + path}?${strParam.slice(1)}`;
  return strSign;
}

export async function cgiRequestWithSign3({
  method,
  url,
  data,
  service,
  action,
  region,
  version,
  secretId,
  secretKey,
  multipart = false,
  timeout = 60000,
  token,
  language,
  headers = {},
  agent,
  proxy,
}: CgiRequestWithSign3Props): Promise<Response> {
  await convertReadStreamToBuffer(data);
  data = deepRemoveNull(data);
  const timestamp = parseInt(String(new Date().getTime() / 1000), 10);

  const config = {
    method,
    body: null,
    timeout,
    headers: Object.assign({}, headers, {
      Host: new URL(url).host,
      'X-TC-Action': action,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version': version,
    }),
    agent,
    proxy,
  };
  
  if (token) config.headers['X-TC-Token'] = token;
  if (region) config.headers['X-TC-Region'] = region;
  if (language) config.headers['X-TC-Language'] = language;

  let form = null;
  let payload = null;

  if (method === 'GET') {
    data = mergeData(data);
    url += `?${QueryString.stringify(data)}`;
    config.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  if (method === 'POST') {
    payload = data;
    if (multipart) {
      form = new FormData();
      for (const key in data) {
        form.append(key, data[key]);
      }
      config.body = form;
      config.headers = Object.assign({}, config.headers, form.getHeaders());
    } else {
      config.body = JSON.stringify(data);
      config.headers['Content-Type'] = 'application/json';
    }
  }

  const signature = signV3({
    method,
    url,
    payload,
    timestamp,
    service,
    secretId,
    secretKey,
    multipart,
    boundary: form ? form.getBoundary() : undefined,
  });
  config.headers['Authorization'] = signature;
  return await doFetch({ url, config });
}

async function convertReadStreamToBuffer(data: any) {
  for (const key in data) {
    if (isStream(data[key])) {
      data[key] = await getStream.buffer(data[key]);
    }
  }
}

function deepRemoveNull(obj: any) {
  if (isArray(obj)) {
    return obj.map(deepRemoveNull);
  }
  if (isObject(obj)) {
    const result = {};
    for (const key in obj) {
      const value = obj[key];
      if (!isNull(value)) {
        result[key] = deepRemoveNull(value);
      }
    }
    return result;
  }
  return obj;
}

function isBuffer(x: any) {
  return Buffer.isBuffer(x);
}

function isArray(x: any) {
  return Array.isArray(x);
}

function isNull(x: any) {
  return x === null;
}

function isObject(x: any) {
  return typeof x === 'object' && !isArray(x) && !isStream(x) && !isBuffer(x) && !isNull(x);
}
