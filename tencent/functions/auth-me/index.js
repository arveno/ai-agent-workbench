const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT = Number(process.env.PORT || 9000);
const HOST = '0.0.0.0';

function loadAuthHelper() {
  const bundledSharedPath = path.join(__dirname, '_shared', 'auth.js');
  const localSharedModule = fs.existsSync(bundledSharedPath) ? './_shared/auth' : '../_shared/auth';
  return require(localSharedModule);
}

const { authenticateRequest } = loadAuthHelper();

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function sendNoContent(res) {
  setCorsHeaders(res);
  res.writeHead(204);
  res.end();
}

function sendError(res, statusCode, errorCode, message) {
  sendJson(res, statusCode, {
    ok: false,
    errorCode,
    message,
  });
}

function toPublicError(error) {
  const statusCode = Number(error && error.statusCode);

  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600 && error.errorCode) {
    return {
      statusCode,
      errorCode: error.errorCode,
      message: error.publicMessage || error.message || '请求失败。',
    };
  }

  return {
    statusCode: 500,
    errorCode: 'auth_error',
    message: '读取当前用户失败。',
  };
}

function sanitizeLogMessage(value) {
  return String(value || '')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/(token|secret|password)=([^&\s]+)/gi, '$1=[redacted]');
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendNoContent(res);
    return;
  }

  if (req.method !== 'GET') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed');
    return;
  }

  try {
    const currentUser = await authenticateRequest(req);
    sendJson(res, 200, {
      ok: true,
      data: {
        currentUser,
      },
    });
  } catch (error) {
    const publicError = toPublicError(error);
    const logMessage = sanitizeLogMessage(error && error.message ? error.message : publicError.errorCode);
    console.error('[auth-me] request failed', publicError.errorCode, logMessage);
    sendError(res, publicError.statusCode, publicError.errorCode, publicError.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[auth-me] listening on ${HOST}:${PORT}`);
});
