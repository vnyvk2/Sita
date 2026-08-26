// Minimal CDP evaluator: connects to an Electron renderer via
// --remote-debugging-port, evaluates a JS expression, prints JSON result.
// Usage: node scripts/cdp-eval.mjs "<expression>" [port]
import http from 'node:http';
import WebSocket from 'ws';

const expression = process.argv[2];
const port = process.argv[3] ?? '9222';
if (!expression) {
  console.error('usage: node scripts/cdp-eval.mjs "<js>" [port]');
  process.exit(1);
}

const listTargets = () =>
  new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}/json/list`, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve(JSON.parse(body)));
      })
      .on('error', reject);
  });

const targets = await listTargets();
const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
if (!page) {
  console.error(JSON.stringify({ ok: false, error: 'no page target', targets: targets.map((t) => t.type) }));
  process.exit(2);
}

const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
const send = (id, method, params) =>
  ws.send(JSON.stringify({ id, method, params }));

const result = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('CDP timeout after 30s')), 30000);
  ws.on('open', () => send(1, 'Runtime.enable', {}));
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id === 2) {
      clearTimeout(timer);
      if (process.env.CDP_DEBUG) console.error('RAW:', raw.toString().slice(0, 500));
      if (msg.result?.exceptionDetails) {
        resolve({ ok: false, error: msg.result.exceptionDetails.exception?.description ?? msg.result.exceptionDetails.text });
      } else {
        resolve({ ok: true, value: msg.result?.result?.value });
      }
      ws.close();
    }
  });
  ws.on('open', () => {
    const body = expression.includes('return ')
      ? expression
      : `return (${expression});`;
    send(2, 'Runtime.evaluate', {
      expression: `(async () => {\n${body}\n})()`,
      awaitPromise: true,
      returnByValue: true,
      replMode: false
    });
  });
  ws.on('error', (e) => {
    clearTimeout(timer);
    reject(e);
  });
});

console.log(JSON.stringify(result));
process.exit(result.ok ? 0 : 3);
