const http = require('http');
const { URL } = require('url');

function sanitizeRequestHeaders(headers, host) {
  const next = { ...headers, host };
  delete next['content-length'];
  delete next['accept-encoding'];
  delete next['connection'];
  return next;
}

function sanitizeResponseHeaders(headers) {
  const next = { ...headers };
  delete next['content-encoding'];
  delete next['content-length'];
  delete next['transfer-encoding'];
  delete next['connection'];
  return next;
}

function startProxy(port, targetOrigin) {
  const server = http.createServer(async (req, res) => {
    try {
      const target = new URL(req.url, targetOrigin);
      const headers = sanitizeRequestHeaders(req.headers, target.host);

      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;

      const upstream = await fetch(target, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method || '') ? undefined : body,
        redirect: 'manual',
      });

      const responseHeaders = sanitizeResponseHeaders(Object.fromEntries(upstream.headers.entries()));
      res.writeHead(upstream.status, responseHeaders);
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.end(buf);
    } catch (error) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: 'proxy failure', error: error.message }));
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`proxy:${port}->${targetOrigin}`);
  });
}

startProxy(4000, 'https://pregen.onrender.com');
startProxy(8000, 'https://pregen-xce4.onrender.com');
setInterval(() => {}, 1 << 30);