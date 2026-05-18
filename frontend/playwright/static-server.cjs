const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.resolve(__dirname, "..", "build");
const port = Number(process.env.PORT || 4173);

const types = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

http
  .createServer((req, res) => {
    const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const candidate = path.resolve(root, requestPath.replace(/^\/+/, ""));

    if (!candidate.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const filePath =
      requestPath === "/"
        ? path.join(root, "index.html")
        : fs.existsSync(candidate) && fs.statSync(candidate).isFile()
          ? candidate
          : path.join(root, "index.html");

    sendFile(res, filePath);
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`Serving ${root} at http://127.0.0.1:${port}`);
  });
