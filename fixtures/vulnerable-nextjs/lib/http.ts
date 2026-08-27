import https from 'node:https';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export const agent = new https.Agent({ rejectUnauthorized: false });

const ANALYTICS_ENDPOINT = 'http://localhost:4000/collect';

export function track(event: string) {
  fetch(ANALYTICS_ENDPOINT, { method: 'POST', body: event }).then((response) => response.status);
}
