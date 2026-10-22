'use strict';

const http = require('node:http');
const os = require('node:os');

function createServer(options = {}) {
  const serviceName = options.serviceName || process.env.SERVICE_NAME || 'cs454-midterm';
  const message = options.message || process.env.MESSAGE || 'Hello this is the cs454 midterm!';
  let requestCount = 0;

  return http.createServer((req, res) => {
    const path = req.url.split('?')[0];
    let status = 200;
    let body;

    if (req.method === 'GET' && path === '/') {
      requestCount += 1;
      body = {
        service: serviceName,
        message: message,
        hostname: os.hostname(),
        requestCount: requestCount
      };
    } else if (req.method === 'GET' && path === '/health') {
      body = { status: 'ok' };
    } else {
      status = 404;
      body = { error: 'Not Found' };
    }

    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
    console.log(req.method + ' ' + path + ' ' + status);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  const server = createServer();

  server.listen(port, '0.0.0.0', () => {
    console.log('Service listening on port ' + port);
  });
}

module.exports = { createServer };
