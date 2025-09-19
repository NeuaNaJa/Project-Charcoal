// Config
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwewrATuuhVTSCLH0ZJde64MndLnU873y-fvHKhTZ_Y-j4jWu7pJTb2T3TcpbwCI3VJDw/exec';

// Elements
const form = document.getElementById('workForm');
const profileFile = document.getElementById('profileFile');
const profilePreview = document.getElementById('profilePreview');
const previewContainer = document.getElementById('previewContainer');
const statusEl = document.getElementById('status');
const submitBtn = document.getElementById('submitBtn');
const clearBtn = document.getElementById('clearBtn');
const entriesEl = document.getElementById('entries');

// Local store key (so entries persist in browser)
const STORE_KEY = 'worklog_entries_v1';

// In-memory base64 buffer for file
let currentFileBase64 = null;
let currentFileName = null;
let currentFileMime = null;

// Helpers
function setStatus(text, waiting = false) {
  statusEl.textContent = `สถานะ: ${text}`;
  submitBtn.disabled = waiting;
  if (waiting) statusEl.style.opacity = '0.9';
  else statusEl.style.opacity = '1';
}

function readFileAsBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.onload = () => {
      // result is data:[<mediatype>][;base64],<data>
      const dataUrl = reader.result;
      const commaIndex = dataUrl.indexOf(',');
      const header = dataUrl.substring(0, commaIndex);
      const base64 = dataUrl.substring(commaIndex + 1);
      // e.g. "data:image/png;base64"
      const mimeMatch = header.match(/data:(.*);base64/);
      const mime = mimeMatch ? mimeMatch[1] : file.type || 'application/octet-stream';
      resolve({ base64, mime });
    };
    reader.readAsDataURL(file);
  });
}

function saveLocalEntry(entry){
  const list = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
  list.push(entry);
  localStorage.setItem(STORE_KEY, JSON.stringify(list));
}

function loadLocalEntries(){
  return JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
}

function renderEntries(){
  const list = loadLocalEntries();
  // sort by submitTimestamp DESC (ล่าสุดก่อน)
  list.sort((a,b) => b.submitTimestamp - a.submitTimestamp);
  entriesEl.innerHTML = '';
  if(list.length === 0){
    entriesEl.innerHTML = `<div style="color:var(--muted)">ยังไม่มีบันทึก</div>`;
    return;
  }
  list.forEach(e => {
    const div = document.createElement('div');
    div.className = 'entry';
    div.innerHTML = `
      <div class="thumb"><img src="${e.profileUrl || 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2264%22 height=%2264%22><rect width=%2264%22 height=%2264%22 fill=%22%23eef2ff%22/><text x=%222%22 y=%2240%22 font-size=%2212%22 fill=%22%236b7280%22>no image</text></svg>'}" alt="profile"></div>
      <div class="meta">
        <div class="row1">
          <div class="name">${escapeHtml(e.name || '')}</div>
          <div class="time">${new Date(e.submitTimestamp).toLocaleString()}</div>
        </div>
        <div class="details">วันที่: ${escapeHtml(e.date || '')} · ${escapeHtml(e.timeIn || '')} → ${escapeHtml(e.timeOut || '')}<br>${escapeHtml(e.details || '')}</div>
        <div class="location">${escapeHtml(e.location || '')}</div>
        ${e.fileUrl ? `<div style="margin-top:8px;font-size:13px;"><a href="${e.fileUrl}" target="_blank">ดูไฟล์โปรไฟล์</a></div>` : ''}
      </div>
    `;
    entriesEl.appendChild(div);
  });
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// File input -> preview & read base64
profileFile.addEventListener('change', async (ev) => {
  const f = ev.target.files && ev.target.files[0];
  if(!f){ currentFileBase64 = currentFileName = currentFileMime = null; profilePreview.src=''; return; }
  currentFileName = f.name;
  try{
    setStatus('อ่านไฟล์...', true);
    const { base64, mime } = await readFileAsBase64(f);
    currentFileBase64 = base64;
    currentFileMime = mime;
    // preview: use data URL
    profilePreview.src = `data:${mime};base64,${base64}`;
    setStatus('ไฟล์พร้อมส่ง', false);
  }catch(err){
    console.error(err);
    setStatus('อ่านไฟล์ล้มเหลว', false);
    alert('ไม่สามารถอ่านไฟล์ได้');
  }
});

// clear form
clearBtn.addEventListener('click', () => {
  form.reset();
  profilePreview.src = '';
  currentFileBase64 = null;
  currentFileName = null;
  currentFileMime = null;
  setStatus('พร้อมส่ง', false);
});

// submit form
form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const date = document.getElementById('date').value;
  const name = document.getElementById('name').value.trim();
  const timeIn = document.getElementById('timeIn').value;
  const timeOut = document.getElementById('timeOut').value;
  const details = document.getElementById('details').value.trim();
  const location = document.getElementById('location').value.trim();
  const submitTimestamp = Date.now();

  if(!date || !name || !timeIn || !timeOut){
    alert('กรุณากรอก วันที่ ชื่อ เวลาเข้างาน และ เวลาออกงาน');
    return;
  }

  setStatus('กำลังส่งข้อมูลไปยังเซิร์ฟเวอร์...', true);

  // build URLSearchParams
  const params = new URLSearchParams();
  params.append('date', date);
  params.append('name', name);
  params.append('timeIn', timeIn);
  params.append('timeOut', timeOut);
  params.append('details', details);
  params.append('location', location);
  params.append('submitTimestamp', String(submitTimestamp));

  if(currentFileBase64 && currentFileName && currentFileMime){
    params.append('fileBase64', currentFileBase64);
    params.append('fileName', currentFileName);
    params.append('fileMime', currentFileMime);
  } else {
    // send empty to indicate no file
    params.append('fileBase64', '');
    params.append('fileName', '');
    params.append('fileMime', '');
  }

  try{
    const resp = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: params.toString()
    });
    const data = await resp.json();

    if(!resp.ok || !data.success){
      console.error('Server returned error', data);
      setStatus('บันทึกไม่สำเร็จ', false);
      alert('บันทึกไม่สำเร็จ: ' + (data.message || resp.statusText));
      return;
    }

    // success: data.fileUrl may be provided
    const entry = {
      date, name, timeIn, timeOut, details, location,
      submitTimestamp,
      fileUrl: data.fileUrl || '',
      fileName: currentFileName || ''
    };
    // save locally and render
    saveLocalEntry(entry);
    renderEntries();
    setStatus('บันทึกสำเร็จ', false);
    form.reset();
    profilePreview.src = '';
    currentFileBase64 = currentFileName = currentFileMime = null;
  }catch(err){
    console.error(err);
    setStatus('เกิดข้อผิดพลาด', false);
    alert('เกิดข้อผิดพลาดในการส่งข้อมูล: ' + err.message);
  }
});

// initial render
renderEntries();
setStatus('พร้อมส่ง', false);
/**
 * Google Apps Script: รับ POST (application/x-www-form-urlencoded) ที่ส่งโดย URLSearchParams
 * ทำหน้าที่:
 *  - อ่านพารามิเตอร์จาก e.parameter
 *  - ถอดรหัส base64 เป็น blob และสร้างไฟล์ใน Drive (โฟลเดอร์ที่ระบุ)
 *  - ตั้งการแชร์ไฟล์เป็น anyoneWithLink (ถ้าต้องการ)
 *  - บันทึกแถวเข้า Google Sheets (ชีตที่ระบุ)
 *
 * **ตรวจสอบ**: โครงการ Apps Script นี้ต้อง deploy เป็น Web app ที่ "Anyone, even anonymous" (หรือผู้ใช้ที่เหมาะสม)
 * และสคริปต์ต้องมีสิทธิ์เข้าถึง Drive และ Spreadsheet
 */

// Config: ใช้ค่าตามที่ผู้ใช้ให้มา
const SHEET_ID = '193WboXwECG4d-ag48ivundOhbVx0YVfjOUDJtUW4X50'; // spreadsheet ID หรือสามารถใช้ full URL ใน SpreadsheetApp.openById
const FOLDER_ID = '19vAVFFWrmHS8OgfgQltwK1DeD0i6SNqe';

// main entry
function doPost(e) {
  try {
    // e.parameter มีค่าจาก URLSearchParams (content-type application/x-www-form-urlencoded)
    const params = e.parameter || {};
    const date = params.date || '';
    const name = params.name || '';
    const timeIn = params.timeIn || '';
    const timeOut = params.timeOut || '';
    const details = params.details || '';
    const location = params.location || '';
    const submitTimestamp = params.submitTimestamp || String(new Date().getTime());

    const fileBase64 = params.fileBase64 || '';
    const fileName = params.fileName || '';
    const fileMime = params.fileMime || '';

    let fileUrl = '';

    if (fileBase64 && fileName) {
      // decode base64
      const bytes = Utilities.base64Decode(fileBase64);
      const blob = Utilities.newBlob(bytes, fileMime || 'application/octet-stream', fileName);

      // create file in folder
      const folder = DriveApp.getFolderById(FOLDER_ID);
      const file = folder.createFile(blob);

      // set sharing if you want the file to be publicly accessible by link
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (shareErr) {
        // ignore if sharing fails due to permission scopes
        Logger.log('setSharing error: ' + shareErr);
      }

      fileUrl = file.getUrl();
    }

    // Append to sheet (first sheet)
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = ss.getSheets()[0];

    // You can adjust column order as needed. Here we append:
    // [timestamp, date, name, timeIn, timeOut, details, location, fileUrl, fileName, mime]
    const row = [
      new Date(Number(submitTimestamp)),
      date,
      name,
      timeIn,
      timeOut,
      details,
      location,
      fileUrl,
      fileName,
      fileMime
    ];
    sh.appendRow(row);

    // Return success JSON
    const out = { success: true, message: 'Saved', fileUrl: fileUrl };
    return ContentService
      .createTextOutput(JSON.stringify(out))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('Error in doPost: ' + err);
    const out = { success: false, message: err.message || String(err) };
    return ContentService
      .createTextOutput(JSON.stringify(out))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
