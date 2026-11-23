/**
 * June & Non — The Wedding : ตัวรับข้อมูลตอบรับ + คำอวยพร (Google Apps Script)
 *
 * วิธีติดตั้ง (ทำครั้งเดียว)
 * 1. สร้าง Google Sheet ใหม่ → เมนู Extensions → Apps Script
 * 2. ลบโค้ดเดิม แล้ววางไฟล์นี้ทั้งหมดลงไป กด Save
 * 3. แถบซ้าย Services (+) → เพิ่ม "Drive API" (ใช้สำหรับอัปโหลดวิดีโอ)
 * 4. เลือกฟังก์ชัน setup แล้วกด Run หนึ่งครั้ง → กดอนุญาตสิทธิ์ (Sheet + Drive)
 * 5. Deploy → New deployment → Type: Web app
 *      Execute as: Me      Who has access: Anyone
 *    กด Deploy แล้วคัดลอก Web app URL (ลงท้ายด้วย /exec)
 * 6. นำ URL ไปใส่ที่ CONFIG.apiUrl ใน index.html
 *
 * ผลลัพธ์
 *  - แผ่นงาน "RSVP"   : เวลา, ชื่อ, จำนวนคน
 *  - แผ่นงาน "Wishes" : เวลา, ชื่อ, คำอวยพร, ลิงก์รูป, ลิงก์วิดีโอ
 *  - รูป/วิดีโอ เก็บในโฟลเดอร์ Drive ชื่อ "June & Non Wedding — Wishes"
 *
 * หมายเหตุ: ถ้าแก้โค้ดภายหลัง ต้อง Deploy → Manage deployments → แก้เป็น New version
 */

const FOLDER_NAME = 'June & Non Wedding — Wishes';
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_PHOTO_B64 = 12 * 1024 * 1024;

function setup() {
  sheet_('RSVP', ['เวลา', 'ชื่อผู้ร่วมงาน & ผู้ติดตาม', 'จำนวนคน']);
  sheet_('Wishes', ['เวลา', 'ชื่อ', 'คำอวยพร', 'รูป', 'วิดีโอ']);
  folder_();
}

function doGet() {
  return json_({ ok: true, service: 'june-non-wedding' });
}

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    switch (p.action) {
      case 'rsvp': return json_(rsvp_(p));
      case 'wish': return json_(wish_(p));
      case 'videoStart': return json_(videoStart_(p));
      case 'videoChunk': return json_(videoChunk_(p));
    }
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/* ---------- ตอบรับ ---------- */
function rsvp_(p) {
  const name = text_(p.name, 120);
  const count = Math.floor(Number(p.count));
  if (!name) throw new Error('กรุณากรอกชื่อ');
  if (!(count >= 1 && count <= 20)) throw new Error('จำนวนคนไม่ถูกต้อง');
  append_('RSVP', [new Date(), name, count]);
  return { ok: true };
}

/* ---------- คำอวยพร ---------- */
function wish_(p) {
  const name = text_(p.name, 120);
  const message = text_(p.message, 2000);
  if (!name) throw new Error('กรุณากรอกชื่อ');

  let photoUrl = '';
  if (p.photo && p.photo.data) {
    if (String(p.photo.type).indexOf('image/') !== 0) throw new Error('ไฟล์รูปไม่ถูกต้อง');
    if (p.photo.data.length > MAX_PHOTO_B64) throw new Error('รูปใหญ่เกินไป');
    const blob = Utilities.newBlob(Utilities.base64Decode(p.photo.data), p.photo.type, fileName_(name, p.photo.ext || 'jpg'));
    photoUrl = folder_().createFile(blob).getUrl();
  }

  let videoUrl = '';
  if (p.videoId) {
    const id = String(p.videoId);
    if (!/^[\w-]{10,}$/.test(id)) throw new Error('วิดีโอไม่ถูกต้อง');
    videoUrl = 'https://drive.google.com/file/d/' + id + '/view';
  }

  if (!message && !photoUrl && !videoUrl) throw new Error('ไม่มีคำอวยพร');
  append_('Wishes', [new Date(), name, message, photoUrl, videoUrl]);
  return { ok: true };
}

/* ---------- วิดีโอ: อัปโหลดเป็นชิ้นผ่าน Drive resumable upload ---------- */
function videoStart_(p) {
  const type = String(p.type || '');
  const size = Number(p.size);
  if (type.indexOf('video/') !== 0) throw new Error('ไฟล์วิดีโอไม่ถูกต้อง');
  if (!(size > 0 && size <= MAX_VIDEO_BYTES)) throw new Error('วิดีโอใหญ่เกินไป');

  const res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'X-Upload-Content-Type': type,
      'X-Upload-Content-Length': String(size),
    },
    payload: JSON.stringify({ name: fileName_(text_(p.who, 60), p.ext || 'mp4'), parents: [folder_().getId()] }),
    muteHttpExceptions: true,
  });
  const headers = res.getHeaders();
  const uploadUrl = headers.Location || headers.location;
  if (res.getResponseCode() !== 200 || !uploadUrl) throw new Error('เริ่มอัปโหลดไม่ได้: ' + res.getContentText().slice(0, 200));
  return { ok: true, uploadUrl: uploadUrl };
}

function videoChunk_(p) {
  const url = String(p.uploadUrl || '');
  if (url.indexOf('https://www.googleapis.com/upload/drive/v3/files') !== 0) throw new Error('uploadUrl ไม่ถูกต้อง');
  const bytes = Utilities.base64Decode(p.data);
  const offset = Number(p.offset), total = Number(p.total);
  if (!(offset >= 0) || !(total > 0 && total <= MAX_VIDEO_BYTES) || offset + bytes.length > total) throw new Error('ข้อมูลชิ้นวิดีโอไม่ถูกต้อง');

  const res = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: String(p.type || 'video/mp4'),
    headers: { 'Content-Range': 'bytes ' + offset + '-' + (offset + bytes.length - 1) + '/' + total },
    payload: bytes,
    followRedirects: false,
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code === 308) return { ok: true };                                   // ยังไม่ครบ ส่งชิ้นต่อไป
  if (code === 200 || code === 201) return { ok: true, fileId: JSON.parse(res.getContentText()).id };
  throw new Error('อัปโหลดวิดีโอไม่สำเร็จ (' + code + ')');
}

/* ---------- ตัวช่วย ---------- */
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function text_(v, max) {
  let s = String(v == null ? '' : v).trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;       // กันสูตรใน Sheet
  return s;
}
function fileName_(who, ext) {
  const stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd-HHmmss');
  const safeWho = String(who || 'guest').replace(/[^\w฀-๿ ]+/g, '').slice(0, 40) || 'guest';
  const safeExt = String(ext).replace(/[^a-zA-Z0-9]/g, '').slice(0, 5) || 'bin';
  return stamp + ' ' + safeWho + '.' + safeExt;
}
function sheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(header); sh.setFrozenRows(1); }
  return sh;
}
function append_(name, row) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name).appendRow(row); }
  finally { lock.releaseLock(); }
}
function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* ถูกลบ → สร้างใหม่ */ } }
  const folder = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}
