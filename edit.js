/* ============================================================
   หน้า /edit : แก้ตำแหน่งชิ้นงานบนการ์ด
   แตะชิ้นงานเพื่อเลือก (แตะซ้ำที่เดิม = เลือกชิ้นที่ซ้อนอยู่ข้างใต้)
   แล้วกดปุ่ม เลื่อน / หมุน / ขยาย-ย่อ · กด "บันทึก" แล้วแขกทุกคนเห็นตำแหน่งใหม่
   คีย์บอร์ด: ลูกศร = เลื่อน · Q/E = หมุน · + / - = ขนาด · Ctrl+Z = ย้อน · Ctrl+S = บันทึก · Esc = เลิกเลือก
   ============================================================ */
(function () {
'use strict';
const L = window.JNLayout;
if (!L || !L.items.length) return;
const $ = (s, r) => (r || document).querySelector(s);
const STORE = 'jn-edit-key';
let key = '';
try { key = sessionStorage.getItem(STORE) || ''; } catch (e) { /* โหมดส่วนตัว */ }

const css = `
.ed-login{position:fixed;inset:0;z-index:300;background:#f1ece2;display:grid;place-items:center;padding:24px;font-family:var(--thai)}
.ed-login form{width:min(100%,320px);text-align:center}
.ed-login h2{font:400 34px 'Cronde',Georgia,serif;color:var(--wine);margin-bottom:6px}
.ed-login p{color:#7a6f63;margin-bottom:18px}
.ed-login input{width:100%;font-size:24px;letter-spacing:.4em;text-align:center;padding:12px;border:1px solid #cbbfae;border-radius:12px;background:#fff;outline:0}
.ed-login input:focus{border-color:#604330;box-shadow:0 0 0 3px rgba(96,67,48,.18)}
.ed-login button{margin-top:12px;width:100%;padding:13px;border-radius:999px;background:#604330;color:#fff;font-size:16px}
.ed-login .ed-err{min-height:1.6em;margin-top:10px;color:#a3271f;font-size:14px}

body.editing{padding-bottom:250px}
body.editing .a{pointer-events:auto !important;cursor:pointer}
body.editing .reveal{opacity:1 !important;translate:none !important}
body.editing .heart{translate:none !important}
body.editing *{animation:none !important}
body.editing .tap:active{scale:none}

.ed-box{position:absolute;z-index:150;pointer-events:none;outline:2px dashed #ff2d6f;outline-offset:1px;background:rgba(255,45,111,.08);display:none}
.ed-box.peek{outline:3px solid #2d8cff;background:rgba(45,140,255,.14)}
.ed-box.peek::after{background:#2d8cff}
.ed-pick{position:fixed;z-index:220;width:min(92vw,320px);max-height:min(60vh,420px);display:none;flex-direction:column;background:#fff;color:#2a2420;
  border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.35);overflow:hidden}
.ed-pick.on{display:flex}
.ed-pick-h{padding:10px 14px;font-size:12px;color:#7a6f63;background:#f5f1e8;border-bottom:1px solid #e6dfd2}
.ed-pick-l{overflow-y:auto;-webkit-overflow-scrolling:touch}
.ed-pick-i{display:flex;align-items:center;gap:10px;width:100%;padding:8px 12px;text-align:left;border-bottom:1px solid #f0ebe2}
.ed-pick-i:last-child{border-bottom:0}
.ed-pick-i:hover,.ed-pick-i:active{background:#eaf3ff}
.ed-pick-i.cur{background:#fff0f5}
.ed-th{flex:none;width:44px;height:44px;border-radius:8px;background:#efe9de;display:grid;place-items:center;overflow:hidden;font-size:18px;color:#8d8276}
.ed-th img{width:100%;height:100%;object-fit:contain}
.ed-pt{min-width:0;display:flex;flex-direction:column}
.ed-pt b{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ed-pt small{font-size:11px;color:#8d8276;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ed-box::after{content:"";position:absolute;left:50%;top:50%;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:#ff2d6f}

.ed-ui{font-family:var(--thai);-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.ed-ui button{touch-action:manipulation}
.ed-bar{position:fixed;left:50%;bottom:0;translate:-50% 0;width:min(100vw,480px);z-index:200;background:rgba(30,25,20,.95);color:#fff;
  padding:10px 12px calc(10px + env(safe-area-inset-bottom));border-radius:16px 16px 0 0;font-size:13px;line-height:1.4;box-shadow:0 -6px 24px rgba(0,0,0,.25)}
.ed-head{display:flex;align-items:center;gap:8px}
.ed-info{flex:1;min-width:0}
.ed-name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ed-val{color:#c9bfb2;font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ed-sm{padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.35);font-size:12px;color:#fff;white-space:nowrap}
.ed-ctl{display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:8px}
.ed-pad{display:grid;grid-template-columns:repeat(3,46px);grid-template-rows:repeat(3,40px);gap:4px}
.ed-pad [data-act="up"]{grid-area:1/2}.ed-pad [data-act="left"]{grid-area:2/1}.ed-pad [data-act="right"]{grid-area:2/3}.ed-pad [data-act="down"]{grid-area:3/2}
.ed-pad .ed-mid{grid-area:2/2;display:grid;place-items:center;color:#8d8276;font-size:11px}
.ed-grp{display:flex;flex-direction:column;align-items:center;gap:4px}
.ed-grp span{color:#c9bfb2;font-size:11px}
.ed-grp div{display:flex;gap:4px}
.ed-k{width:46px;height:40px;border-radius:10px;background:#5d4a3b;color:#fff;font-size:20px;line-height:1;display:grid;place-items:center}
.ed-k:active{background:#8a6c55}
.ed-row{display:flex;gap:6px;margin-top:10px;align-items:center}
.ed-seg{display:flex;border:1px solid rgba(255,255,255,.3);border-radius:999px;overflow:hidden}
.ed-seg button{padding:6px 9px;font-size:12px;color:#d8cfc4}
.ed-seg button.on{background:#f5f0e4;color:#3a2a1e;font-weight:600}
.ed-save{margin-left:auto;padding:8px 16px;border-radius:999px;background:#f5f0e4;color:#3a2a1e;font-weight:600;font-size:14px}
.ed-save.dirty{background:#ff2d6f;color:#fff}
.ed-save:disabled{opacity:.6}
.ed-bar.min .ed-ctl,.ed-bar.min .ed-row{display:none}
.ed-bar.nosel .ed-ctl{opacity:.35}
.ed-toast{position:fixed;left:50%;bottom:270px;translate:-50% 10px;z-index:210;background:rgba(30,25,20,.95);color:#fff;padding:9px 16px;border-radius:999px;font-size:14px;
  opacity:0;transition:opacity .25s,translate .25s;pointer-events:none;max-width:90vw;text-align:center;font-family:var(--thai)}
.ed-toast.on{opacity:1;translate:-50% 0}
`;
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }));
const el = html => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; };

/* ---------- toast ---------- */
const tst = el('<div class="ed-toast ed-ui" role="status"></div>'); document.body.appendChild(tst);
let tt;
function toast(m, ms) { tst.textContent = m; tst.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => tst.classList.remove('on'), ms || 2200); }

/* ---------- ส่งข้อมูล ---------- */
function req(method, url, body) {
  return fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-Edit-Key': key }, body: JSON.stringify(body), cache: 'no-store' })
    .then(r => r.json().catch(() => ({})).then(j => {
      if (r.ok && j.ok) return j;
      const e = new Error(j.error || 'HTTP ' + r.status); e.status = r.status; throw e;
    }));
}

/* ---------- ใส่รหัส ---------- */
const login = el(`<div class="ed-login ed-ui"><form>
  <h2>Edit mode</h2><p>ใส่รหัสเพื่อเข้าแก้ไขหน้าเว็บ</p>
  <input type="password" inputmode="numeric" autocomplete="off" maxlength="20" aria-label="รหัส">
  <button type="submit">เข้าสู่ระบบ</button><div class="ed-err" role="alert"></div></form></div>`);
document.body.appendChild(login); document.body.classList.add('locked');
const pinIn = $('input', login), pinErr = $('.ed-err', login);
function askPin(msg) { login.style.display = ''; document.body.classList.add('locked'); pinErr.textContent = msg || ''; pinIn.value = ''; setTimeout(() => pinIn.focus(), 50); }
let started = false;
function enter() {
  login.style.display = 'none'; document.body.classList.remove('locked');
  if (!started) { started = true; start(); }
}
$('form', login).addEventListener('submit', e => {
  e.preventDefault();
  const pin = pinIn.value.trim(); if (!pin) return;
  pinErr.textContent = 'กำลังตรวจสอบ…';
  key = pin;
  req('POST', '/api/edit/login', { pin }).then(() => { try { sessionStorage.setItem(STORE, pin); } catch (er) { /* ไม่เป็นไร */ } enter(); },
    err => { key = ''; askPin(err.status === 401 || err.status === 429 ? err.message : 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง'); });
});
if (key) req('POST', '/api/edit/login', { pin: key }).then(enter, () => { key = ''; askPin(); });
else askPin();

/* ---------- เครื่องมือแก้ไข ---------- */
function start() {
  document.body.classList.add('editing');
  document.querySelectorAll('.reveal').forEach(n => n.classList.add('in'));
  document.querySelectorAll('.app input, .app textarea').forEach(n => { n.readOnly = true; n.tabIndex = -1; });   // ไม่ให้คีย์บอร์ดเด้งตอนแตะเลือก
  document.querySelectorAll('.app .a[disabled]').forEach(n => { n.disabled = false; });                       // ปุ่มที่ปิดอยู่ (เช่น −) ต้องแตะเลือกได้
  try { const m = document.getElementById('music'); if (m) m.pause(); } catch (e) { /* ไม่มีเพลง */ }

  // ชื่อภาษาไทยสำหรับชิ้นที่ไม่มีคำอธิบายในรูป
  const LABELS = {
    'env-front': 'ซองจดหมาย (ฝาหน้า)', 'env-back': 'ซองจดหมาย (ด้านหลัง)', 'heart-clip': 'กรอบที่หัวใจโผล่ขึ้นมา',
    click: 'ป้าย Click', click2: 'ป้าย Click', swan: 'หงส์', flowers: 'ช่อดอกไม้', strip: 'แถบรูป 4 ช่อง', vinyl: 'แผ่นเสียง',
    'swan-blue-june': 'หงส์ฟ้า (June)', 'swan-blue-non': 'หงส์ฟ้า (Non)', 'rsvp-box': 'กล่องฟอร์มตอบรับ',
    'r-name': 'ช่องกรอกชื่อ (ตอบรับ)', 'r-count': 'ช่องจำนวนคน', cMinus: 'ปุ่ม −', cPlus: 'ปุ่ม +', 'btn-submit': 'ปุ่มส่งข้อมูล',
    rsvpDone: 'ข้อความ "ได้รับข้อมูลแล้ว"', mapBtn: 'ปุ่ม Google Maps', lineBtn: 'ปุ่ม LINE',
    name: 'ช่องกรอกชื่อ (คำอวยพร)', message: 'ช่องเขียนคำอวยพร', 'ic-photo': 'ไอคอนรูป', 'ic-video': 'ไอคอนวิดีโอ',
    'btn-send': 'ภาพปุ่มส่งคำอวยพร', pickPhoto: 'พื้นที่กดแนบรูป', pickVideo: 'พื้นที่กดอัดวิดีโอ', hot: 'พื้นที่กดส่งคำอวยพร',
  };
  L.items.forEach(it => { const b = it.key.split('/')[1].replace(/#\d+$/, ''); if (LABELS[b]) it.name = LABELS[b]; });

  const recs = JSON.parse(JSON.stringify(window.JN_LAYOUT || {}));
  const byEl = new Map(L.items.map(it => [it.el, it]));
  const undo = [];
  const STEPS = [
    { label: 'ละเอียด', m: 1, r: .5, s: .005 },
    { label: 'ปกติ', m: 5, r: 2, s: .02 },
    { label: 'เร็ว', m: 20, r: 10, s: .08 },
  ];
  let sel = null, peek = null, step = 1, dirty = false, saving = false;

  const box = el('<div class="ed-box ed-ui"></div>'); document.body.appendChild(box);
  const bar = el(`<div class="ed-bar ed-ui nosel" role="toolbar" aria-label="เครื่องมือแก้ตำแหน่ง">
    <div class="ed-head">
      <div class="ed-info"><div class="ed-name"></div><div class="ed-val"></div></div>
      <button type="button" class="ed-sm" data-btn="none">เลิกเลือก</button>
      <button type="button" class="ed-sm" data-btn="min">ย่อ</button>
    </div>
    <div class="ed-ctl">
      <div class="ed-pad">
        <button type="button" class="ed-k" data-act="up" aria-label="ขึ้น">↑</button>
        <button type="button" class="ed-k" data-act="left" aria-label="ซ้าย">←</button>
        <span class="ed-mid">เลื่อน</span>
        <button type="button" class="ed-k" data-act="right" aria-label="ขวา">→</button>
        <button type="button" class="ed-k" data-act="down" aria-label="ลง">↓</button>
      </div>
      <div class="ed-grp"><span>หมุน</span><div>
        <button type="button" class="ed-k" data-act="rl" aria-label="หมุนทวนเข็ม">⟲</button>
        <button type="button" class="ed-k" data-act="rr" aria-label="หมุนตามเข็ม">⟳</button></div></div>
      <div class="ed-grp"><span>ขนาด</span><div>
        <button type="button" class="ed-k" data-act="out" aria-label="ย่อ">−</button>
        <button type="button" class="ed-k" data-act="in" aria-label="ขยาย">+</button></div></div>
    </div>
    <div class="ed-row">
      <div class="ed-seg">${STEPS.map((s, i) => `<button type="button" data-step="${i}">${s.label}</button>`).join('')}</div>
      <button type="button" class="ed-sm" data-btn="undo">↶ ย้อน</button>
      <button type="button" class="ed-sm" data-btn="reset">คืนค่าเดิม</button>
      <button type="button" class="ed-save" data-btn="save">บันทึกแล้ว</button>
    </div>
  </div>`);
  document.body.appendChild(bar);
  const saveBtn = $('[data-btn="save"]', bar);

  const cur = it => Object.assign({}, it.base, recs[it.key] || {});
  const r2 = n => Math.round(n * 100) / 100;
  const same = (a, b) => Object.keys(b).every(k => Math.abs((a[k] || 0) - b[k]) < .005);

  function paintSave() {
    saveBtn.classList.toggle('dirty', dirty);
    saveBtn.textContent = saving ? 'กำลังบันทึก…' : dirty ? 'บันทึก' : 'บันทึกแล้ว ✓';
    saveBtn.disabled = saving;
  }
  function paintInfo() {
    bar.classList.toggle('nosel', !sel);
    if (!sel) {
      $('.ed-name', bar).textContent = 'แตะชิ้นงานเพื่อเลือก';
      $('.ed-val', bar).textContent = 'ถ้ามีหลายชิ้นซ้อนกัน จะมีรายการให้เลือก';
      return;
    }
    const v = cur(sel);
    $('.ed-name', bar).textContent = (recs[sel.key] ? '● ' : '') + sel.name;
    $('.ed-val', bar).textContent = `x ${r2(v.x)} · y ${r2(v.y)} · กว้าง ${r2(v.w)} · หมุน ${r2(v.r)}°`;
  }
  function place() {
    const it = peek || sel;      // ระหว่างเลือกจากรายการ: กรอบชี้ชิ้นที่นิ้ว/เมาส์อยู่
    box.classList.toggle('peek', !!peek);
    if (!it || !it.el.offsetWidth) { box.style.display = 'none'; return; }
    const n = it.el, rc = n.getBoundingClientRect(), w = n.offsetWidth, h = n.offsetHeight;
    box.style.display = 'block';
    box.style.width = w + 'px'; box.style.height = h + 'px';
    box.style.left = (rc.left + rc.width / 2 + window.pageXOffset - w / 2) + 'px';
    box.style.top = (rc.top + rc.height / 2 + window.pageYOffset - h / 2) + 'px';
    box.style.rotate = cur(it).r + 'deg';
  }
  (function loop() { place(); requestAnimationFrame(loop); })();      // ตามกรอบไว้ตลอด (รูปโหลดเสร็จ ขนาดหน้าเปลี่ยน ฯลฯ)

  function select(it) { sel = it || null; paintInfo(); }
  function set(it, v) {
    const out = {};
    Object.keys(it.base).forEach(k => { out[k] = r2(v[k]); });
    if (same(out, it.base)) delete recs[it.key]; else recs[it.key] = out;
    L.apply(it, recs[it.key]);
    dirty = true; paintSave(); paintInfo();
  }

  function act(a, first) {
    if (!sel) { if (first) toast('แตะเลือกชิ้นงานก่อน'); return; }
    const v = cur(sel), S = STEPS[step];
    if (first) undo.push([sel.key, recs[sel.key] ? Object.assign({}, recs[sel.key]) : null]);
    if (a === 'up') v.y -= S.m; else if (a === 'down') v.y += S.m;
    else if (a === 'left') v.x -= S.m; else if (a === 'right') v.x += S.m;
    else if (a === 'rl') v.r -= S.r; else if (a === 'rr') v.r += S.r;
    else if (a === 'in' || a === 'out') {
      const f = a === 'in' ? 1 + S.s : 1 / (1 + S.s);
      const u = sel.el.offsetWidth / v.w, H = u > 0 ? sel.el.offsetHeight / u : 0;      // ขยายจากตรงกลาง ไม่ใช่จากมุมบนซ้าย
      v.x -= v.w * (f - 1) / 2; v.y -= H * (f - 1) / 2;
      v.w *= f; if ('h' in v) v.h *= f;
    }
    set(sel, v);
  }

  /* แตะเลือกชิ้นงาน: ปิดการทำงานปกติของปุ่ม/ลิงก์/ฟอร์มทั้งหมดในโหมดนี้ */
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('.ed-ui')) return;
    e.preventDefault(); e.stopPropagation();
    const hits = [];
    document.elementsFromPoint(e.clientX, e.clientY).forEach(n => {
      const a = n.closest && n.closest('[data-ek]'); if (a && byEl.has(a) && hits.indexOf(a) < 0) hits.push(a);
    });
    if (picker.classList.contains('on')) { closePick(); return; }      // แตะนอกรายการ = ปิดรายการ
    if (!hits.length) { select(null); return; }
    if (hits.length === 1) { select(byEl.get(hits[0])); return; }
    openPick(hits.map(h => byEl.get(h)), e.clientX, e.clientY);
  }, true);

  /* ---------- รายการให้เลือก เมื่อแตะโดนหลายชิ้นซ้อนกัน (เรียงจากชิ้นบนสุดลงไป) ---------- */
  const picker = el(`<div class="ed-pick ed-ui" role="menu" aria-label="เลือกชิ้นงาน">
    <div class="ed-pick-h">ตรงนี้มีหลายชิ้นซ้อนกัน เลือกชิ้นที่จะแก้</div><div class="ed-pick-l"></div></div>`);
  document.body.appendChild(picker);
  const pickList = $('.ed-pick-l', picker);
  let pickItems = [];
  const thumbOf = it => it.el.tagName === 'IMG' ? it.el : it.el.querySelector('img');
  function openPick(list, cx, cy) {
    pickItems = list;
    pickList.innerHTML = '';
    list.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ed-pick-i' + (it === sel ? ' cur' : ''); b.dataset.i = i; b.setAttribute('role', 'menuitem');
      const im = thumbOf(it), th = document.createElement('span'); th.className = 'ed-th';
      if (im && im.getAttribute('src')) { const t = new Image(); t.src = im.currentSrc || im.src; t.alt = ''; th.appendChild(t); }
      else th.textContent = it.el.tagName === 'INPUT' || it.el.tagName === 'TEXTAREA' ? '✎' : '◻';
      const tx = document.createElement('span'); tx.className = 'ed-pt';
      const nm = document.createElement('b'); nm.textContent = it.name;
      const sub = document.createElement('small'); sub.textContent = (i === 0 ? 'บนสุด · ' : 'ชั้นที่ ' + (i + 1) + ' · ') + it.key.split('/')[1];
      tx.append(nm, sub); b.append(th, tx); pickList.appendChild(b);
    });
    picker.classList.add('on');
    const pw = picker.offsetWidth, ph = picker.offsetHeight, vw = innerWidth, vh = innerHeight;
    picker.style.left = Math.max(8, Math.min(vw - pw - 8, cx - pw / 2)) + 'px';
    picker.style.top = Math.max(8, Math.min(vh - ph - 8, cy + 14 + ph > vh - 8 ? cy - ph - 14 : cy + 14)) + 'px';
    peek = list[0];
  }
  function closePick() { picker.classList.remove('on'); pickItems = []; peek = null; }
  const pickAt = e => { const b = e.target.closest('.ed-pick-i'); return b ? pickItems[+b.dataset.i] : null; };
  picker.addEventListener('pointerover', e => { const it = pickAt(e); if (it) peek = it; });      // ชี้/แตะค้าง = ไฮไลต์ชิ้นนั้นบนหน้า
  picker.addEventListener('pointerdown', e => { const it = pickAt(e); if (it) peek = it; });
  picker.addEventListener('click', e => { const it = pickAt(e); if (it) { closePick(); select(it); } });
  window.addEventListener('scroll', () => { if (picker.classList.contains('on')) closePick(); }, { passive: true });
  document.addEventListener('submit', e => { if (!e.target.closest('.ed-ui')) { e.preventDefault(); e.stopPropagation(); } }, true);

  /* ปุ่มเลื่อน/หมุน/ขนาด: กดค้างได้ */
  let holdT = null, holdI = null;
  const stopHold = () => { clearTimeout(holdT); clearInterval(holdI); holdT = holdI = null; };
  bar.addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    e.preventDefault(); stopHold();
    act(b.dataset.act, true);
    holdT = setTimeout(() => { holdI = setInterval(() => act(b.dataset.act, false), 70); }, 380);
  });
  ['pointerup', 'pointercancel', 'blur'].forEach(ev => window.addEventListener(ev, stopHold));
  bar.addEventListener('pointerleave', stopHold);
  bar.addEventListener('contextmenu', e => e.preventDefault());

  function doUndo() {
    const u = undo.pop(); if (!u) { toast('ไม่มีอะไรให้ย้อนแล้ว'); return; }
    const it = L.byKey[u[0]]; if (!it) return;
    if (u[1]) recs[it.key] = u[1]; else delete recs[it.key];
    L.apply(it, recs[it.key]); dirty = true; paintSave(); select(it);
  }
  function save() {
    if (saving) return;
    saving = true; paintSave();
    req('PUT', '/api/layout', { layout: recs }).then(() => {
      saving = false; dirty = false; paintSave(); toast('บันทึกแล้ว แขกจะเห็นตำแหน่งใหม่');
    }, err => {
      saving = false; paintSave();
      if (err.status === 401) { try { sessionStorage.removeItem(STORE); } catch (e) { /* - */ } askPin(err.message); }
      else toast('บันทึกไม่สำเร็จ: ' + err.message, 4000);
    });
  }
  bar.addEventListener('click', e => {
    const s = e.target.closest('[data-step]');
    if (s) { step = +s.dataset.step; paintStep(); return; }
    const b = e.target.closest('[data-btn]'); if (!b) return;
    const k = b.dataset.btn;
    if (k === 'none') select(null);
    else if (k === 'min') { bar.classList.toggle('min'); b.textContent = bar.classList.contains('min') ? 'ขยาย' : 'ย่อ'; }
    else if (k === 'undo') doUndo();
    else if (k === 'reset') {
      if (!sel) { toast('แตะเลือกชิ้นงานก่อน'); return; }
      undo.push([sel.key, recs[sel.key] ? Object.assign({}, recs[sel.key]) : null]);
      set(sel, Object.assign({}, sel.base)); toast('คืนค่าเดิมแล้ว (ยังต้องกดบันทึก)');
    }
    else if (k === 'save') save();
  });
  function paintStep() { bar.querySelectorAll('[data-step]').forEach(b => b.classList.toggle('on', +b.dataset.step === step)); }

  document.addEventListener('keydown', e => {
    if (login.style.display !== 'none') return;
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); doUndo(); return; }
    if (mod && k.toLowerCase() === 's') { e.preventDefault(); save(); return; }
    if (k === 'Escape') { if (picker.classList.contains('on')) closePick(); else select(null); return; }
    const a = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', q: 'rl', Q: 'rl', e: 'rr', E: 'rr', '+': 'in', '=': 'in', '-': 'out', _: 'out' }[k];
    if (a) { e.preventDefault(); act(a, !e.repeat); }
  });
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  paintStep(); paintSave(); paintInfo();
}
})();
