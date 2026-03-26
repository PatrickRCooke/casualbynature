const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  const token = event.queryStringParameters?.token;

  if (!token) {
    return { statusCode: 400, body: 'Missing token' };
  }

  try {
    const secret = process.env.DOWNLOAD_SECRET || 'fallback-secret-change-me';

    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split('|');

    if (parts.length !== 3) {
      return { statusCode: 400, body: 'Invalid token format' };
    }

    const [file, expiryStr, hmac] = parts;
    const expiry = parseInt(expiryStr, 10);

    if (Date.now() > expiry) {
      return {
        statusCode: 410,
        headers: { 'Content-Type': 'text/html' },
        body: '<h2 style="font-family:sans-serif;padding:40px">This download link has expired. Please contact support at hello@gilbertcooke.com</h2>',
      };
    }

    const payload = `${file}|${expiryStr}`;
    const expectedHmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (hmac !== expectedHmac) {
      return { statusCode: 403, body: 'Invalid token signature' };
    }

    const safeFile = path.basename(file);
    const filePath = path.resolve('/var/task/downloads', safeFile);

    if (!fs.existsSync(filePath)) {
      console.error('File not found at:', filePath);
      return { statusCode: 404, body: 'File not found. Please contact support at hello@gilbertcooke.com' };
    }

    const fileBuffer = fs.readFileSync(filePath);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${safeFile}"`,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'no-store',
      },
      body: fileBuffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('serve-file error:', err);
    return { statusCode: 500, body: `Server error: ${err.message}` };
  }
};
