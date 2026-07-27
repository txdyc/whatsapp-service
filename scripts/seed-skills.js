// Seed a starter set of customer-service technique docs via the admin API.
// Requires the backend running. Skills need no embedding key.
// Usage: node scripts/seed-skills.js
//   Env overrides: PORT (default 3100), ADMIN_EMAIL, ADMIN_PASSWORD

const http = require('http');

const PORT = process.env.PORT || 3100;
const EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const skills = [
  {
    title: 'Empathy and acknowledgment',
    content: 'Before offering a solution, briefly acknowledge the customer feeling or situation (e.g. "I understand how frustrating that is"). This builds trust and de-escalates tension.',
    category: 'skill',
  },
  {
    title: 'Handling price objections',
    content: 'When a customer hesitates on price, do not discount immediately. First reaffirm the value or benefit relevant to their need, then mention any legitimate promotion or the free-shipping threshold, and ask a question to keep the conversation open.',
    category: 'skill',
  },
  {
    title: 'De-escalating frustrated customers',
    content: 'Stay calm and validating. Apologize for the inconvenience without over-promising, restate the problem so they feel heard, then give a clear next step. Avoid defensive language.',
    category: 'skill',
  },
  {
    title: 'Tasteful upsell and cross-sell',
    content: 'Only suggest complementary products when genuinely relevant to what the customer asked about. Frame it as a helpful tip, not a hard sell, and never push if they show disinterest.',
    category: 'skill',
  },
];

function request(path, method, body, token) {
  return new Promise((resolve, reject) => {
    const raw = body ? JSON.stringify(body) : '';
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request({ host: 'localhost', port: PORT, path, method, headers }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d ? JSON.parse(d) : {} }));
    });
    req.on('error', reject);
    if (raw) req.write(raw);
    req.end();
  });
}

(async () => {
  const login = await request('/admin/login', 'POST', { email: EMAIL, password: PASSWORD });
  if (login.status !== 200) throw new Error(`Login failed (${login.status}). Is the backend running on ${PORT}?`);
  const token = login.body.token;

  for (const s of skills) {
    const res = await request('/admin/knowledge', 'POST', s, token);
    console.log(`${res.status === 200 ? 'OK  ' : 'FAIL'} ${s.title}`);
  }
  console.log(`Seeded ${skills.length} skill docs. Open the Knowledge Base -> Skill tab.`);
})().catch((e) => {
  console.error('Seed failed:', e.message);
  process.exit(1);
});
