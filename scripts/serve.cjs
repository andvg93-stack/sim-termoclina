const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json' };
function createServer() {
  return http.createServer((req,res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname); }
    catch { res.writeHead(400); res.end(); return; }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.relative(root,file);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(part=>part.startsWith('.'))) { res.writeHead(403); res.end(); return; }
    fs.readFile(file,(error,data) => {
      if (error) { res.writeHead(404); res.end('Not found'); return; }
      res.setHeader('Content-Type',types[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control','no-cache'); res.end(data);
    });
  });
}
module.exports = { createServer };
if (require.main === module) {
  const port = Number(process.env.PORT || 8765);
  createServer().listen(port,'127.0.0.1',()=>console.log(`Laboratorio: http://127.0.0.1:${port}`));
}
