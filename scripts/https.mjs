// `node scripts/https.mjs [--port 3389] [--to 3000] [--host 34.131.209.81]`: serves the app over HTTPS on
// the VM, so a browser reaching it by address may use the microphone and camera (they need a secure
// page). Every request and websocket is passed to the app on localhost unchanged. The certificate is
// self-signed for the address and kept in work/.tls/ (gitignored), made with openssl on first start;
// the browser asks once to trust it. A certificate from a public authority needs a domain name.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '3389' },
    to: { type: 'string', default: '3000' },
    host: { type: 'string', default: '34.131.209.81' },
  },
});
const port = Number(values.port);
const to = Number(values.to);

const dir = path.join(ROOT, 'work', '.tls');
const key = path.join(dir, `${values.host}.key`);
const cert = path.join(dir, `${values.host}.crt`);
if (!existsSync(key) || !existsSync(cert)) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const san = net.isIP(values.host) ? `IP:${values.host}` : `DNS:${values.host}`;
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-sha256',
      '-days',
      '365',
      '-keyout',
      key,
      '-out',
      cert,
      '-subj',
      `/CN=${values.host}`,
      '-addext',
      `subjectAltName=${san},DNS:localhost`,
    ],
    { stdio: 'ignore' },
  );
}

const forwarded = (req) => ({
  ...req.headers,
  'x-forwarded-proto': 'https',
  'x-forwarded-host': req.headers.host ?? '',
  'x-forwarded-for': req.socket.remoteAddress ?? '',
});

const server = https.createServer(
  { key: readFileSync(key), cert: readFileSync(cert) },
  (req, res) => {
    const up = http.request(
      { host: '127.0.0.1', port: to, method: req.method, path: req.url, headers: forwarded(req) },
      (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      },
    );
    up.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('House of Rama is not running on this machine just now.');
    });
    req.pipe(up);
  },
);

// Websockets (the dev server's live reload, the trainer console's updates): the upgrade is passed on raw.
server.on('upgrade', (req, socket, head) => {
  const up = net.connect(to, '127.0.0.1', () => {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (const [k, v] of Object.entries(forwarded(req)))
      for (const one of Array.isArray(v) ? v : [v]) lines.push(`${k}: ${one}`);
    up.write(lines.join('\r\n') + '\r\n\r\n');
    if (head?.length) up.write(head);
    up.pipe(socket).pipe(up);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
});

server.listen(port, () =>
  console.log(`[https] https://${values.host}:${port} → http://127.0.0.1:${to}`),
);
