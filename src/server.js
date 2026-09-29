import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export async function startServer(port = 0) {
  const routes = {
    '/': ['web/index.html', 'text/html'],
    '/app.js': ['web/app.js', 'text/javascript'],
    '/style.css': ['web/style.css', 'text/css'],
    '/products.json': ['data/products.json', 'application/json'],
  };
  const server = http.createServer(async (req, res) => {
    const route = routes[new URL(req.url, 'http://localhost').pathname];
    if (!route || req.method !== 'GET') { res.writeHead(404); res.end('Not found'); return; }
    try {
      const body = await readFile(path.join(ROOT, route[0]));
      res.writeHead(200, { 'Content-Type': `${route[1]}; charset=utf-8`, 'Cache-Control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(500); res.end('Unable to load environment'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await startServer(Number(process.env.PORT || 3000));
  console.log(`Shopping environment: ${url}`);
}
