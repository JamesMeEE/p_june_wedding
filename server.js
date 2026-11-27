/**
 * June & Non — The Wedding : เซิร์ฟเวอร์เว็บ + รับข้อมูลตอบรับ / คำอวยพร / รูป / วิดีโอ
 *
 * ตัวแปรที่ต้องตั้งบน Railway
 *   ADMIN_PASSWORD  รหัสผ่านเข้าหน้า /admin (ไม่ตั้ง = ปิดหน้าแอดมิน)
 *   DATA_DIR        โฟลเดอร์เก็บข้อมูล (Dockerfile ตั้งเป็น /data → ต้อง mount Volume ที่ /data)
 *   MAX_TOTAL_GB    เพดานพื้นที่ไฟล์รวม (ค่าเริ่มต้น 30)
 *   EDIT_PASSWORD   รหัสเข้าหน้า /edit แก้ตำแหน่งชิ้นงาน (ค่าเริ่มต้น 1150)
 */
const express = require('express');
const compression = require('compression');
const archiver = require('archiver');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const UP = path.join(DATA, 'uploads');
const TMP = path.join(DATA, 'tmp');
const RSVP_FILE = path.join(DATA, 'rsvp.jsonl');
const WISH_FILE = path.join(DATA, 'wishes.jsonl');
const LAYOUT_FILE = path.join(DATA, 'layout.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const EDIT_PASSWORD = process.env.EDIT_PASSWORD || '1150';
const MAX_TOTAL = (Number(process.env.MAX_TOTAL_GB) || 30) * 1024 ** 3;

const CHUNK = 4 * 1024 * 1024;                       // ขนาดชิ้นที่ให้เบราว์เซอร์ส่ง
const KINDS = {
  photo: { max: 25 * 1024 ** 2, ext: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] },
  video: { max: 250 * 1024 ** 2, ext: ['mp4', 'webm', 'mov', 'm4v', '3gp'] },
};

for (const d of [DATA, UP, TMP]) fs.mkdirSync(d, { recursive: true });
for (const f of fs.readdirSync(TMP)) fs.rmSync(path.join(TMP, f), { force: true });   // ชิ้นค้างจากรอบก่อน
let totalBytes = fs.readdirSync(UP).reduce((n, f) => n + fs.statSync(path.join(UP, f)).size, 0);

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Permissions-Policy', 'camera=(self), microphone=(self)');
  next();
});
app.use(compression());

/* ---------- ตัวช่วย ---------- */
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B-\u001F]/g, '').trim().slice(0, max);
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);   // Express 4 ไม่จับ error ของ async เอง
const fail = (res, code, error) => res.status(code).json({ ok: false, error });
const appendLine = (file, obj) => fsp.appendFile(file, JSON.stringify(obj) + '\n');
async function readLines(file) {
  try { return (await fsp.readFile(file, 'utf8')).split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }
  catch { return []; }
}
const bkk = t => new Date(t).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });
function stamp() {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    .formatToParts(new Date()).reduce((o, x) => (o[x.type] = x.value, o), {});
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}`;
}
const safeName = s => String(s).replace(/[^\p{L}\p{M}\p{N} _-]+/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'guest';

// จำกัดจำนวนคำขอต่อ IP กันสแปม
const hits = new Map();
function limit(max, windowMs) {
  return (req, res, next) => {
    const key = req.ip + '|' + req.route.path, now = Date.now();
    const h = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (h.length >= max) return fail(res, 429, 'ส่งถี่เกินไป กรุณารอสักครู่แล้วลองใหม่');
    h.push(now); hits.set(key, h); next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (!h.some(t => now - t < 3600e3)) hits.delete(k); }, 600e3).unref();

/* ---------- ตำแหน่งชิ้นงานที่แก้จากหน้า /edit ---------- */
let layout = {};
try { layout = JSON.parse(fs.readFileSync(LAYOUT_FILE, 'utf8')) || {}; } catch { layout = {}; }
const sameSecret = (given, real) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(given || '')).digest(), crypto.createHash('sha256').update(real).digest());
function cleanLayout(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const ents = Object.entries(v); if (ents.length > 400) return null;
  const out = Object.create(null);
  for (const [k, r] of ents) {
    if (!/^[\w-]{1,40}\/[\w.-]{1,80}(#\d{1,3})?$/.test(k) || !r || typeof r !== 'object') return null;
    const o = {};
    for (const f of ['x', 'y', 'w', 'h', 'r']) {
      if (r[f] == null) continue;
      const n = Number(r[f]); if (!Number.isFinite(n) || Math.abs(n) > 20000) return null;
      o[f] = Math.round(n * 100) / 100;
    }
    if (!('x' in o && 'y' in o && 'w' in o) || o.w <= 0) return null;
    out[k] = o;
  }
  return out;
}

/* ---------- หน้าเว็บ ---------- */
const staticOpts = { maxAge: '7d', index: false, dotfiles: 'deny' };
// ใส่ตำแหน่งที่บันทึกไว้ลงในหน้าเลย แขกจะไม่เห็นตำแหน่งเดิมแวบขึ้นมาก่อน
async function sendPage(res, cache) {
  const data = JSON.stringify(layout).replace(/</g, '\\u003c');
  const html = (await fsp.readFile(path.join(ROOT, 'index.html'), 'utf8')).replace('/*LAYOUT*/{}', () => data);
  res.set('Cache-Control', cache).type('html').send(html);
}
app.get(['/', '/index.html'], wrap((req, res) => sendPage(res, 'no-cache')));
// ลิงก์แยก: เปิดมาแล้วเริ่มที่หน้าเขียนคำอวยพรเลย (หน้าเว็บเดียวกัน index.html เลื่อนลงไปเอง)
app.get('/wishes', wrap((req, res) => {
  if (req.path !== '/wishes') return res.redirect('/wishes');      // ตัด / ท้ายลิงก์ ไม่งั้นหารูปไม่เจอ
  return sendPage(res, 'no-cache');
}));
// หน้าแก้ตำแหน่ง: หน้าเว็บเดียวกัน + โหลด edit.js (ต้องใส่รหัสก่อนถึงจะแก้/บันทึกได้)
app.get('/edit', wrap((req, res) => {
  if (req.path !== '/edit') return res.redirect('/edit');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  return sendPage(res, 'no-store');
}));
app.get('/edit.js', (req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(ROOT, 'edit.js')); });
app.use('/assets', express.static(path.join(ROOT, 'assets'), staticOpts));
app.use('/music', express.static(path.join(ROOT, 'music'), staticOpts));
app.get('/healthz', (req, res) => res.json({ ok: true }));

/* ---------- API ---------- */
const json = express.json({ limit: '64kb' });

app.post('/api/edit/login', json, limit(10, 600e3), (req, res) => {
  if (!sameSecret(req.body.pin, EDIT_PASSWORD)) return fail(res, 401, 'รหัสไม่ถูกต้อง');
  res.json({ ok: true });
});
app.put('/api/layout', express.json({ limit: '256kb' }), limit(120, 600e3), wrap(async (req, res) => {
  if (!sameSecret(req.get('x-edit-key'), EDIT_PASSWORD)) return fail(res, 401, 'รหัสไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่');
  const next = cleanLayout(req.body.layout);
  if (!next) return fail(res, 400, 'ข้อมูลตำแหน่งไม่ถูกต้อง');
  const tmp = LAYOUT_FILE + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(next));
  await fsp.rename(tmp, LAYOUT_FILE);
  layout = next;
  res.json({ ok: true });
}));

app.post('/api/rsvp', json, limit(20, 600e3), wrap(async (req, res) => {
  const name = clean(req.body.name, 120), count = Math.floor(Number(req.body.count));
  if (!name) return fail(res, 400, 'กรุณากรอกชื่อผู้ร่วมงาน');
  if (!(count >= 1 && count <= 20)) return fail(res, 400, 'จำนวนคนไม่ถูกต้อง');
  await appendLine(RSVP_FILE, { t: Date.now(), name, count });
  res.json({ ok: true });
}));

// อัปโหลดเป็นชิ้น: start → PUT ทีละชิ้น (ส่งขนานกันได้) → อ้าง id ตอนส่งคำอวยพร
const uploads = new Map();   // id → { kind, ext, size, file, chunks: Map(offset → bytes), t }

app.post('/api/upload/start', json, limit(40, 600e3), wrap(async (req, res) => {
  const kind = KINDS[req.body.kind] ? req.body.kind : null;
  const ext = clean(req.body.ext, 8).toLowerCase(), size = Number(req.body.size);
  if (!kind || !KINDS[kind].ext.includes(ext)) return fail(res, 400, 'ชนิดไฟล์ไม่รองรับ');
  if (!(Number.isInteger(size) && size > 0)) return fail(res, 400, 'ไฟล์ไม่ถูกต้อง');
  if (size > KINDS[kind].max) return fail(res, 413, kind === 'video' ? 'วิดีโอใหญ่เกินไป กรุณาอัดให้สั้นลง' : 'รูปใหญ่เกินไป');
  const pending = [...uploads.values()].reduce((n, u) => n + u.size, 0);
  if (totalBytes + pending + size > MAX_TOTAL) return fail(res, 507, 'พื้นที่เก็บไฟล์เต็ม กรุณาแจ้งเจ้าของงาน');
  const id = crypto.randomBytes(16).toString('hex'), file = path.join(TMP, id);
  await fsp.writeFile(file, '');
  uploads.set(id, { kind, ext, size, file, chunks: new Map(), t: Date.now() });
  res.json({ ok: true, id, chunk: CHUNK });
}));

app.put('/api/upload/:id', (req, res) => {
  const u = uploads.get(req.params.id), offset = Number(req.query.offset);
  if (!u) return fail(res, 404, 'ไม่พบรายการอัปโหลด กรุณาแนบไฟล์ใหม่');
  if (!(Number.isInteger(offset) && offset >= 0 && offset < u.size && offset % CHUNK === 0)) return fail(res, 400, 'ตำแหน่งชิ้นไฟล์ไม่ถูกต้อง');
  const want = Math.min(CHUNK, u.size - offset);
  let got = 0, done = false;
  const out = fs.createWriteStream(u.file, { flags: 'r+', start: offset });
  const end = (code, msg) => { if (done) return; done = true; req.unpipe(out); out.destroy(); req.resume(); fail(res, code, msg); };
  req.on('data', c => { got += c.length; if (got > want) end(413, 'ชิ้นไฟล์ใหญ่เกิน'); });
  req.on('aborted', () => { done = true; out.destroy(); });
  out.on('error', () => end(500, 'บันทึกไฟล์ไม่สำเร็จ'));
  out.on('finish', () => {
    if (done) return; done = true;
    if (got !== want) return fail(res, 400, 'ชิ้นไฟล์ไม่ครบ');
    u.chunks.set(offset, got); u.t = Date.now();
    res.json({ ok: true });
  });
  req.pipe(out);
});

function takeUpload(id, kind) {
  if (!id) return null;
  const u = uploads.get(String(id));
  if (!u || u.kind !== kind) throw new Error('ไม่พบไฟล์ที่แนบ กรุณาแนบใหม่');
  let sum = 0; for (const n of u.chunks.values()) sum += n;
  if (sum !== u.size) throw new Error('ไฟล์ยังอัปโหลดไม่ครบ กรุณาลองใหม่');
  return u;
}

app.post('/api/wish', json, limit(20, 600e3), wrap(async (req, res) => {
  const name = clean(req.body.name, 120), message = clean(req.body.message, 2000);
  if (!name) return fail(res, 400, 'กรุณาระบุชื่อเจ้าของคำอวยพร');
  let photo, video;
  try { photo = takeUpload(req.body.photoId, 'photo'); video = takeUpload(req.body.videoId, 'video'); }
  catch (e) { return fail(res, 400, e.message); }
  if (!message && !photo && !video) return fail(res, 400, 'ยังไม่มีคำอวยพร');

  const base = `${stamp()}_${safeName(name)}_${crypto.randomBytes(2).toString('hex')}`;
  const rec = { t: Date.now(), name, message, photo: '', video: '' };
  for (const [key, u, id] of [['photo', photo, req.body.photoId], ['video', video, req.body.videoId]]) {
    if (!u) continue;
    const fname = `${base}_${key}.${u.ext}`;
    await fsp.rename(u.file, path.join(UP, fname));
    uploads.delete(String(id)); totalBytes += u.size; rec[key] = fname;
  }
  await appendLine(WISH_FILE, rec);
  res.json({ ok: true });
}));

// ล้างไฟล์ที่อัปโหลดค้างไว้เกิน 3 ชั่วโมงแต่ไม่ได้กดส่ง
setInterval(() => {
  for (const [id, u] of uploads) if (Date.now() - u.t > 3 * 3600e3) { uploads.delete(id); fs.rm(u.file, { force: true }, () => {}); }
}, 900e3).unref();

/* ---------- แอดมิน ---------- */
function admin(req, res, next) {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  if (!ADMIN_PASSWORD) return res.status(503).type('text').send('ยังไม่ได้ตั้งค่า ADMIN_PASSWORD บนเซิร์ฟเวอร์');
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
  const pass = m ? Buffer.from(m[1], 'base64').toString().split(':').slice(1).join(':') : '';
  const a = crypto.createHash('sha256').update(pass).digest(), b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  if (m && crypto.timingSafeEqual(a, b)) return next();
  res.set('WWW-Authenticate', 'Basic realm="June & Non Admin", charset="UTF-8"').status(401).type('text').send('กรุณาใส่รหัสผ่าน');
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const csvCell = v => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
const csv = rows => '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
const rsvpCsv = async () => csv([['เวลา', 'ชื่อผู้ร่วมงาน & ผู้ติดตาม', 'จำนวนคน'], ...(await readLines(RSVP_FILE)).map(r => [bkk(r.t), r.name, r.count])]);
const wishCsv = async () => csv([['เวลา', 'ชื่อ', 'คำอวยพร', 'ไฟล์รูป', 'ไฟล์วิดีโอ'], ...(await readLines(WISH_FILE)).map(w => [bkk(w.t), w.name, w.message, w.photo, w.video])]);
const today = () => stamp().slice(0, 8);

app.get('/admin', admin, wrap(async (req, res) => {
  const rsvp = await readLines(RSVP_FILE), wishes = await readLines(WISH_FILE);
  const guests = rsvp.reduce((n, r) => n + (Number(r.count) || 0), 0);
  const gb = (totalBytes / 1024 ** 3).toFixed(2);
  const f = n => '/admin/file/' + encodeURIComponent(n);
  res.type('html').send(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>June & Non — Admin</title><style>
:root{--ink:#2a2420;--wine:#5a0d0d;--brown:#604330;--line:#e2dccf}
*{box-sizing:border-box}body{margin:0;background:#f5f3e9;color:var(--ink);font:15px/1.6 system-ui,-apple-system,'Segoe UI','Noto Sans Thai',sans-serif}
main{max-width:1000px;margin:0 auto;padding:24px 16px 80px}h1{font:400 30px Georgia,serif;margin:0 0 4px}h2{font:400 22px Georgia,serif;color:var(--wine);margin:36px 0 10px}
.sub{color:#7a6f63;margin:0 0 20px}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.stat{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px}.stat b{display:block;font:400 30px Georgia,serif;color:var(--wine)}
.btns{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}.btn{display:inline-block;padding:10px 18px;border-radius:999px;background:var(--brown);color:#fff;text-decoration:none}
.btn.ghost{background:transparent;color:var(--brown);border:1px solid var(--brown)}
.wrap{overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:12px}table{border-collapse:collapse;width:100%}
th,td{padding:10px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}th{font-weight:600;white-space:nowrap;background:#faf8f1}tr:last-child td{border-bottom:0}
td.t{white-space:nowrap;color:#7a6f63}td.n{text-align:right}td.msg{white-space:pre-wrap;min-width:220px}
.thumb{width:88px;height:88px;object-fit:cover;border-radius:8px;display:block}.empty{padding:20px;color:#7a6f63}
</style></head><body><main>
<h1>June &amp; Non — The Wedding</h1><p class="sub">ข้อมูลตอบรับและคำอวยพร</p>
<div class="stats"><div class="stat"><b>${rsvp.length}</b>รายการตอบรับ</div><div class="stat"><b>${guests}</b>จำนวนแขกรวม</div><div class="stat"><b>${wishes.length}</b>คำอวยพร</div><div class="stat"><b>${gb} GB</b>พื้นที่ไฟล์ที่ใช้</div></div>
<div class="btns"><a class="btn" href="/admin/all.zip">ดาวน์โหลดทั้งหมด (.zip)</a><a class="btn ghost" href="/admin/rsvp.csv">รายชื่อตอบรับ (.csv)</a><a class="btn ghost" href="/admin/wishes.csv">คำอวยพร (.csv)</a></div>
<h2>รายชื่อตอบรับ</h2><div class="wrap">${rsvp.length ? `<table><tr><th>เวลา</th><th>ชื่อผู้ร่วมงาน &amp; ผู้ติดตาม</th><th>จำนวนคน</th></tr>${
  rsvp.slice().reverse().map(r => `<tr><td class="t">${esc(bkk(r.t))}</td><td>${esc(r.name)}</td><td class="n">${esc(r.count)}</td></tr>`).join('')}</table>` : '<div class="empty">ยังไม่มีข้อมูล</div>'}</div>
<h2>คำอวยพร</h2><div class="wrap">${wishes.length ? `<table><tr><th>เวลา</th><th>ชื่อ</th><th>คำอวยพร</th><th>รูป</th><th>วิดีโอ</th></tr>${
  wishes.slice().reverse().map(w => `<tr><td class="t">${esc(bkk(w.t))}</td><td>${esc(w.name)}</td><td class="msg">${esc(w.message)}</td><td>${
    w.photo ? `<a href="${f(w.photo)}" target="_blank"><img class="thumb" loading="lazy" src="${f(w.photo)}" alt=""></a>` : ''}</td><td>${
    w.video ? `<a href="${f(w.video)}" target="_blank">เปิดวิดีโอ</a><br><a href="${f(w.video)}?dl=1">ดาวน์โหลด</a>` : ''}</td></tr>`).join('')}</table>` : '<div class="empty">ยังไม่มีข้อมูล</div>'}</div>
</main></body></html>`);
}));

app.get('/admin/file/:name', admin, (req, res) => {
  const name = path.basename(req.params.name);
  const opts = { root: UP, dotfiles: 'deny' };
  if (req.query.dl) return res.download(path.join(UP, name), name, err => { if (err && !res.headersSent) res.status(404).end(); });
  res.sendFile(name, opts, err => { if (err && !res.headersSent) res.status(404).end(); });
});
app.get('/admin/rsvp.csv', admin, wrap(async (req, res) => res.attachment(`rsvp-${today()}.csv`).type('text/csv; charset=utf-8').send(await rsvpCsv())));
app.get('/admin/wishes.csv', admin, wrap(async (req, res) => res.attachment(`wishes-${today()}.csv`).type('text/csv; charset=utf-8').send(await wishCsv())));
app.get('/admin/all.zip', admin, wrap(async (req, res) => {
  res.attachment(`june-non-wedding-${today()}.zip`);
  const zip = archiver('zip', { store: true });          // รูป/วิดีโอบีบอัดมาแล้ว ไม่ต้องบีบซ้ำ
  zip.on('error', () => res.destroy());
  zip.pipe(res);
  zip.append(await rsvpCsv(), { name: 'rsvp.csv' });
  zip.append(await wishCsv(), { name: 'wishes.csv' });
  zip.directory(UP, 'files');
  zip.finalize();
}));

app.use((req, res) => {
  // บันทึกไว้ดูใน log ของ Railway: ช่วยหาสาเหตุเวลาเบราว์เซอร์ในแอป (เช่น LINE) ส่งไม่ถึง
  if (req.path.startsWith('/api/')) {
    console.warn('404', req.method, req.get('host'), req.originalUrl, '|', (req.get('user-agent') || '').slice(0, 160));
    return fail(res, 404, `ส่งไม่สำเร็จ (ไม่พบ ${req.method} ${req.path})`);
  }
  res.status(404).type('text').send('Not found');
});
app.use((err, req, res, next) => { console.error(err); if (!res.headersSent) fail(res, err.status || 500, 'เกิดข้อผิดพลาด กรุณาลองใหม่'); });

process.on('unhandledRejection', err => console.error('unhandledRejection', err));
app.listen(PORT, () => console.log(`listening on :${PORT}  data=${DATA}  admin=${ADMIN_PASSWORD ? 'on' : 'OFF (set ADMIN_PASSWORD)'}`));
