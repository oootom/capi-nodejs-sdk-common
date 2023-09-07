import * as crypto from 'crypto';

interface SignV3Props {
  service: string;
  url: string;
  method: 'GET' | 'POST';
  payload: any;
  timestamp: number;
  secretId: string;
  secretKey: string;
  multipart: boolean;
  boundary: any;
};

const signMethodMap = {
  HmacSHA1: 'sha1',
  HmacSHA256: 'sha256',
};

export function sign(secretKey: string, signStr: string, signMethod: 'HmacSHA1' | 'HmacSHA256'): string | void {
  if (signMethodMap?.[signMethod]) {
    const hmac = crypto.createHmac(signMethodMap[signMethod], secretKey || '');
    return hmac.update(Buffer.from(signStr, 'utf8')).digest('base64');
  }
  throw new Error('signMethod error!')
}

export function signV3({
  method,
  url,
  payload,
  timestamp,
  service,
  secretId,
  secretKey,
  multipart,
  boundary,
}: SignV3Props) {
  const urlObj = new URL(url);

  let headers = '';
  let signedHeaders = '';

  if (method === 'GET') {
    signedHeaders = 'content-type';
    headers = 'content-type:application/x-www-form-urlencoded\n';
  }
  if (method === 'POST') {
    signedHeaders = 'content-type';
    if (multipart) {
      headers = `content-type:multipart/form-data; boundary=${boundary}\n`;
    } else {
      headers = 'content-type:application/json\n';
    }
  }

  headers += `host:${urlObj.hostname}\n`;
  signedHeaders += ';host';

  const path = urlObj.pathname;
  const queryString = urlObj.search.slice(1);

  let payloadHash = null;

  if (method === 'POST' && multipart) {
    const hash = crypto.createHash('sha256');
    hash.update(`--${boundary}`);
    for (const key in payload) {
      const content = payload[key];
      if (Buffer.isBuffer(content)) {
        hash.update(
          `\r\nContent-Disposition: form-data; name="${key}"\r\nContent-Type: application/octet-stream\r\n\r\n`
        );
        hash.update(content);
        hash.update('\r\n');
      } else if (typeof content === 'string') {
        hash.update(
          `\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n`
        );
        hash.update(`${content}\r\n`);
      }
      hash.update(`--${boundary}`);
    }
    hash.update('--\r\n');
    payloadHash = hash.digest('hex');
  } else {
    let payloadStr = payload ? JSON.stringify(payload) : '';
    payloadHash = getHashSHA256(payloadStr);
  }

  const date = getDate(timestamp);
  const formatString = [method, path, queryString, headers, signedHeaders, payloadHash].join('\n');
  const formatStringHash = getHashSHA256(formatString);

  const stringToSign = [
    'TC3-HMAC-SHA256',
    timestamp,
    `${date}/${service}/tc3_request`,
    formatStringHash,
  ].join('\n');

  const secretDate = getHmacSHA256(date, `TC3${secretKey}`);
  const secretService = getHmacSHA256(service, secretDate);
  const secretSigning = getHmacSHA256('tc3_request', secretService);
  const signature = getHmacSHA256(stringToSign, secretSigning, 'hex');

  return `TC3-HMAC-SHA256 Credential=${secretId}/${date}/${service}/tc3_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function getHmacSHA256(str: string, secretKey: string, encoding?: any) {
  const hmac = crypto.createHmac('sha256', secretKey);
  return hmac.update(str).digest(encoding);
}

function getHashSHA256(str: string, encoding?: any) {
  const hash = crypto.createHash('sha256');
  return hash.update(str).digest(encoding || 'hex');
}

function getDate(timestamp: number) {
  const date = new Date(timestamp * 1000);
  const year = date.getUTCFullYear();
  const month = ('0' + (date.getUTCMonth() + 1)).slice(-2);
  const day = ('0' + date.getUTCDate()).slice(-2);
  return `${year}-${month}-${day}`;
}
