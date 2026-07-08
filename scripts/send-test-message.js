// Local test helper: send a signed fake WhatsApp webhook to the running backend.
// Usage:  node scripts/send-test-message.js "<phone>" "<name>" "<message text>"
// Example: node scripts/send-test-message.js "447700900999" "New Customer" "What is your delivery time?"
//
// Requires the backend running with LOCAL_TEST_MODE=true. The APP_SECRET/PORT below
// must match your .env (defaults: dummy_app_secret / 3100).

const crypto = require('crypto');
const http = require('http');

const APP_SECRET = process.env.WHATSAPP_APP_SECRET || 'dummy_app_secret';
const PORT = process.env.PORT || 3100;

const from = process.argv[2] || '447700900999';
const name = process.argv[3] || 'Test Customer';
const text = process.argv[4] || 'Hello!';

const payload = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'WABA_ID',
    changes: [{
      value: {
        messaging_product: 'whatsapp',
        contacts: [{ wa_id: from, profile: { name } }],
        messages: [{
          id: 'wamid.' + Date.now(),
          from,
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: 'text',
          text: { body: text },
        }],
      },
      field: 'messages',
    }],
  }],
};

const raw = JSON.stringify(payload);
const sig = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(raw).digest('hex');

const req = http.request(
  {
    host: 'localhost',
    port: PORT,
    path: '/webhook',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(raw),
      'x-hub-signature-256': sig,
    },
  },
  (res) => {
    let d = '';
    res.on('data', (c) => (d += c));
    res.on('end', () => {
      console.log(`webhook HTTP ${res.statusCode} -> ${d}`);
      console.log(`Sent "${text}" from ${name} (${from}).`);
      console.log('Open http://localhost:5173 -> Conversations to see the AI reply.');
    });
  }
);
req.on('error', (e) => console.error('Request failed:', e.message, '\nIs the backend running on port ' + PORT + '?'));
req.write(raw);
req.end();
