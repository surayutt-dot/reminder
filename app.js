/**
 * แอป "กันลืม" (Kan Luem - Post-it Reminder Web App)
 * Vanilla JavaScript + IndexedDB + SpeechRecognition + MediaRecorder + Canvas Image Compression
 */

// ==========================================
// 1. IndexedDB Wrapper
// ==========================================
class NoteDatabase {
  constructor() {
    this.dbName = 'KanLuemAppDB';
    this.dbVersion = 1;
    this.storeName = 'notes';
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('dueDate', 'dueDate', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('isDone', 'isDone', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async getAllNotes() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async saveNote(note) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.put(note);
      request.onsuccess = () => resolve(note);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteNote(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async bulkInsert(notes) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      notes.forEach((n) => store.put(n));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }
}

// ==========================================
// 2. Application State & Elements
// ==========================================
const db = new NoteDatabase();
let currentNotes = [];
let activeFilter = 'all';
let currentSort = 'dueAsc';
let currentSearchQuery = '';

// Current Note Form Media State
let currentAttachedPhoto = null; // Base64 data URL
let currentAttachedAudio = null; // Base64 data URL
let mediaRecorder = null;
let audioChunks = [];
let recordStartTime = null;
let recordTimerInterval = null;

// Speech Recognition instance
let speechRecognition = null;
let activeSpeechTarget = null; // 'noteTitle' or 'noteDetails'

// DOM Elements
const notesGrid = document.getElementById('notesGrid');
const emptyState = document.getElementById('emptyState');
const todayText = document.getElementById('todayText');
const addNoteFab = document.getElementById('addNoteFab');
const noteModal = document.getElementById('noteModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const noteForm = document.getElementById('noteForm');
const noteIdInput = document.getElementById('noteId');
const noteTitleInput = document.getElementById('noteTitle');
const noteDetailsInput = document.getElementById('noteDetails');
const noteDueDateInput = document.getElementById('noteDueDate');
const noteDueTimeInput = document.getElementById('noteDueTime');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const sortSelect = document.getElementById('sortSelect');
const toastEl = document.getElementById('toast');

// Alarm Elements & State
const noteAlarm10Min = document.getElementById('noteAlarm10Min');
const testAlarmSoundBtn = document.getElementById('testAlarmSoundBtn');
const alarmModal = document.getElementById('alarmModal');
const alarmTitleText = document.getElementById('alarmTitleText');
const alarmTimeText = document.getElementById('alarmTimeText');
const alarmDetailsText = document.getElementById('alarmDetailsText');
const dismissAlarmBtn = document.getElementById('dismissAlarmBtn');
let activeAlarmInterval = null;

// Media DOM
const cameraBtn = document.getElementById('cameraBtn');
const photoFileInput = document.getElementById('photoFileInput');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');
const imagePreview = document.getElementById('imagePreview');
const removePhotoBtn = document.getElementById('removePhotoBtn');

const recordAudioBtn = document.getElementById('recordAudioBtn');
const recordTimer = document.getElementById('recordTimer');
const audioPreviewContainer = document.getElementById('audioPreviewContainer');
const audioPreview = document.getElementById('audioPreview');
const removeAudioBtn = document.getElementById('removeAudioBtn');

const voiceTitleBtn = document.getElementById('voiceTitleBtn');
const voiceDetailsBtn = document.getElementById('voiceDetailsBtn');
const speechBanner = document.getElementById('speechBanner');
const speechStatusText = document.getElementById('speechStatusText');
const stopVoiceBtn = document.getElementById('stopVoiceBtn');

// Quick Date buttons
const setTodayBtn = document.getElementById('setTodayBtn');
const setTomorrowBtn = document.getElementById('setTomorrowBtn');
const setNextWeekBtn = document.getElementById('setNextWeekBtn');
const clearDateBtn = document.getElementById('clearDateBtn');

// Color swatches
const colorPalette = document.getElementById('colorPalette');
let selectedColor = 'yellow';

// Badges
const countAll = document.getElementById('countAll');
const countToday = document.getElementById('countToday');
const countUpcoming = document.getElementById('countUpcoming');
const countDone = document.getElementById('countDone');

// Backup & Image Viewer
const backupBtn = document.getElementById('backupBtn');
const backupModal = document.getElementById('backupModal');
const closeBackupModalBtn = document.getElementById('closeBackupModalBtn');
const exportDataBtn = document.getElementById('exportDataBtn');
const importDataBtn = document.getElementById('importDataBtn');
const importFileInput = document.getElementById('importFileInput');
const imageModal = document.getElementById('imageModal');
const fullImageViewer = document.getElementById('fullImageViewer');

// ==========================================
// 3. Thai Date Helpers
// ==========================================
const thaiMonthsShort = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

const thaiDaysFull = [
  'วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'
];

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatThaiFullToday() {
  const now = new Date();
  const dayName = thaiDaysFull[now.getDay()];
  const dateNum = now.getDate();
  const monthName = thaiMonthsShort[now.getMonth()];
  const yearBE = now.getFullYear() + 543;
  return `${dayName}ที่ ${dateNum} ${monthName} ${yearBE}`;
}

function formatThaiDateDisplay(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const targetDate = new Date(y, m - 1, d);
  const targetDateMidnight = new Date(y, m - 1, d).getTime();

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((targetDateMidnight - todayMidnight) / oneDayMs);

  const monthName = thaiMonthsShort[targetDate.getMonth()];
  const yearBE = (targetDate.getFullYear() + 543) % 100;
  let formattedText = `${targetDate.getDate()} ${monthName} '${yearBE}`;
  if (timeStr) {
    formattedText += ` เวลา ${timeStr} น.`;
  }

  let status = 'future';
  let badgeLabel = formattedText;

  if (diffDays < 0) {
    status = 'overdue';
    badgeLabel = `⚠️ เกิน ${Math.abs(diffDays)} วัน (${formattedText})`;
  } else if (diffDays === 0) {
    status = 'today';
    badgeLabel = `🔥 วันนี้! ${timeStr ? 'เวลา ' + timeStr + ' น.' : ''}`;
  } else if (diffDays === 1) {
    status = 'tomorrow';
    badgeLabel = `พรุ่งนี้ ${timeStr ? 'เวลา ' + timeStr + ' น.' : ''}`;
  } else if (diffDays <= 7) {
    status = 'future';
    badgeLabel = `อีก ${diffDays} วัน (${formattedText})`;
  }

  return { status, badgeLabel, diffDays };
}

// ==========================================
// 4. Initialization & Seed Data
// ==========================================
async function initApp() {
  todayText.textContent = formatThaiFullToday();

  try {
    await db.init();
    let notes = await db.getAllNotes();

    // If fresh install, create initial sample notes
    if (!notes || notes.length === 0) {
      const todayStr = getTodayString();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

      const sampleNotes = [
        {
          id: 'sample-1',
          title: 'ยินดีต้อนรับสู่แอป "กันลืม" 📌',
          details: 'กดปุ่ม + ด้านล่างเพื่อแปะโน้ตใหม่\n• แตะไมค์เพื่อพูดข้อความแทนการพิมพ์\n• ถ่ายรูปหรืออัดเสียงกันลืมได้เลย!',
          dueDate: todayStr,
          dueTime: '12:00',
          color: 'yellow',
          photoUrl: null,
          audioUrl: null,
          isDone: false,
          createdAt: Date.now() - 2000
        },
        {
          id: 'sample-2',
          title: 'ซื้อของเข้าบ้านและยาประจำตัว 💊',
          details: '1. ไข่ไก่ 1 แผง\n2. นมจืด\n3. รับยาความดันที่คลินิก',
          dueDate: tomorrowStr,
          dueTime: '10:00',
          color: 'green',
          photoUrl: null,
          audioUrl: null,
          isDone: false,
          createdAt: Date.now() - 1000
        }
      ];

      await db.bulkInsert(sampleNotes);
      notes = sampleNotes;
    }

    currentNotes = notes;
    renderNotes();
    setupSpeechRecognition();
    setupAlarmChecker();
  } catch (err) {
    console.error('Failed to init app:', err);
    showToast('เกิดข้อผิดพลาดในการโหลดฐานข้อมูล');
  }
}

// ==========================================
// 5. Render Notes & UI Updates
// ==========================================
function renderNotes() {
  const todayStr = getTodayString();

  // Update counts
  const totalCount = currentNotes.length;
  const todayCount = currentNotes.filter((n) => !n.isDone && n.dueDate === todayStr).length;
  const upcomingCount = currentNotes.filter((n) => {
    if (n.isDone || !n.dueDate) return false;
    return n.dueDate > todayStr;
  }).length;
  const doneCount = currentNotes.filter((n) => n.isDone).length;

  countAll.textContent = totalCount;
  countToday.textContent = todayCount;
  countUpcoming.textContent = upcomingCount;
  countDone.textContent = doneCount;

  // Filter notes
  let filtered = currentNotes.filter((note) => {
    // Search query
    if (currentSearchQuery) {
      const q = currentSearchQuery.toLowerCase();
      const matchTitle = (note.title || '').toLowerCase().includes(q);
      const matchDetails = (note.details || '').toLowerCase().includes(q);
      if (!matchTitle && !matchDetails) return false;
    }

    // Filter tab
    if (activeFilter === 'today') {
      return !note.isDone && note.dueDate === todayStr;
    } else if (activeFilter === 'upcoming') {
      return !note.isDone && note.dueDate && note.dueDate >= todayStr;
    } else if (activeFilter === 'done') {
      return note.isDone;
    }
    return true; // 'all'
  });

  // Sort notes
  filtered.sort((a, b) => {
    // Keep incomplete tasks above completed tasks by default
    if (a.isDone !== b.isDone) {
      return a.isDone ? 1 : -1;
    }

    if (currentSort === 'createdDesc') {
      return (b.createdAt || 0) - (a.createdAt || 0);
    }

    // Due Date Sorting
    const aDue = a.dueDate ? `${a.dueDate} ${a.dueTime || '00:00'}` : null;
    const bDue = b.dueDate ? `${b.dueDate} ${b.dueTime || '00:00'}` : null;

    if (!aDue && !bDue) return (b.createdAt || 0) - (a.createdAt || 0);
    if (!aDue) return 1; // Put notes without due date at the bottom
    if (!bDue) return -1;

    if (currentSort === 'dueAsc') {
      return aDue.localeCompare(bDue);
    } else if (currentSort === 'dueDesc') {
      return bDue.localeCompare(aDue);
    }
    return 0;
  });

  // Render HTML
  notesGrid.innerHTML = '';
  if (filtered.length === 0) {
    emptyState.style.display = 'block';
  } else {
    emptyState.style.display = 'none';

    filtered.forEach((note) => {
      const card = createNoteCardElement(note);
      notesGrid.appendChild(card);
    });
  }
}

function createNoteCardElement(note) {
  const card = document.createElement('div');
  card.className = `postit-card postit-${note.color || 'yellow'} ${note.isDone ? 'is-completed' : ''}`;
  card.id = `note-${note.id}`;

  // Calculate Due Info
  const dateInfo = formatThaiDateDisplay(note.dueDate, note.dueTime);
  let badgeHtml = '';
  const hasAlarm = note.dueDate && note.dueTime && note.alarm10Min !== false && !note.isDone;
  const alarmChip = hasAlarm ? `<span class="card-alarm-chip" title="ตั้งเตือนก่อนเวลา 10 นาที">🔔 เตือน 10 น.</span>` : '';

  if (dateInfo) {
    badgeHtml = `<div class="card-due-badge badge-${dateInfo.status}">📅 ${dateInfo.badgeLabel} ${alarmChip}</div>`;
  } else {
    badgeHtml = `<div class="card-due-badge badge-nodate">⏰ ไม่ระบุวัน</div>`;
  }

  // Photo HTML
  let photoHtml = '';
  if (note.photoUrl) {
    photoHtml = `
      <div class="card-photo-wrapper" onclick="openImageViewer('${note.photoUrl}')">
        <img src="${note.photoUrl}" alt="รูปภาพแนบ" loading="lazy">
      </div>
    `;
  }

  // Audio HTML
  let audioHtml = '';
  if (note.audioUrl) {
    audioHtml = `
      <div class="card-audio-wrapper">
        <audio controls src="${note.audioUrl}"></audio>
      </div>
    `;
  }

  // Details formatted
  const detailsHtml = note.details ? `<div class="card-details">${escapeHtml(note.details)}</div>` : '';

  card.innerHTML = `
    <div>
      <div class="card-header">
        <div class="card-title-wrap">
          <input type="checkbox" class="custom-checkbox" aria-label="ทำเครื่องหมายเสร็จสิ้น" ${note.isDone ? 'checked' : ''}>
          <h3 class="card-title">${escapeHtml(note.title)}</h3>
        </div>
      </div>

      ${badgeHtml}
      ${detailsHtml}
      ${photoHtml}
      ${audioHtml}
    </div>

    <div class="card-footer">
      <span>${note.isDone ? '✅ เสร็จเรียบร้อย' : '📌 ต้องทำ'}</span>
      <div class="card-footer-actions">
        <button class="btn-card-action btn-edit" title="แก้ไขโน้ต">✏️ แก้ไข</button>
        <button class="btn-card-action btn-card-delete btn-delete" title="ลบโน้ต">🗑️ ลบ</button>
      </div>
    </div>
  `;

  // Attach Event Listeners
  const checkbox = card.querySelector('.custom-checkbox');
  checkbox.addEventListener('change', () => toggleNoteDone(note.id, checkbox.checked));

  const editBtn = card.querySelector('.btn-edit');
  editBtn.addEventListener('click', () => openEditModal(note));

  const deleteBtn = card.querySelector('.btn-delete');
  deleteBtn.addEventListener('click', () => deleteNoteConfirm(note.id));

  return card;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==========================================
// 6. Note CRUD Actions
// ==========================================
async function toggleNoteDone(id, isDone) {
  const note = currentNotes.find((n) => n.id === id);
  if (!note) return;

  note.isDone = isDone;
  await db.saveNote(note);
  renderNotes();
  showToast(isDone ? '✅ ทำรายการสำเร็จแล้ว!' : '↩️ ยกเลิกสถานะเสร็จสิ้น');
}

async function deleteNoteConfirm(id) {
  if (confirm('คุณต้องการลบแผ่นโน้ตกันลืมนี้ใช่หรือไม่?')) {
    await db.deleteNote(id);
    currentNotes = currentNotes.filter((n) => n.id !== id);
    renderNotes();
    showToast('🗑️ ลบแผ่นโน้ตเรียบร้อย');
  }
}

function openCreateModal() {
  noteIdInput.value = '';
  noteTitleInput.value = '';
  noteDetailsInput.value = '';
  noteDueDateInput.value = '';
  noteDueTimeInput.value = '';
  noteAlarm10Min.checked = true;
  selectedColor = 'yellow';
  selectColorSwatch('yellow');

  currentAttachedPhoto = null;
  imagePreviewContainer.style.display = 'none';
  imagePreview.src = '';

  currentAttachedAudio = null;
  audioPreviewContainer.style.display = 'none';
  audioPreview.src = '';

  stopRecordingIfActive();
  stopSpeechRecognition();

  document.getElementById('modalTitle').textContent = '📝 แปะกระดาษโน้ตใหม่';
  noteModal.style.display = 'flex';
  setTimeout(() => noteTitleInput.focus(), 150);
}

function openEditModal(note) {
  noteIdInput.value = note.id;
  noteTitleInput.value = note.title || '';
  noteDetailsInput.value = note.details || '';
  noteDueDateInput.value = note.dueDate || '';
  noteDueTimeInput.value = note.dueTime || '';
  noteAlarm10Min.checked = (note.alarm10Min !== false);
  selectedColor = note.color || 'yellow';
  selectColorSwatch(selectedColor);

  currentAttachedPhoto = note.photoUrl || null;
  if (currentAttachedPhoto) {
    imagePreview.src = currentAttachedPhoto;
    imagePreviewContainer.style.display = 'flex';
  } else {
    imagePreviewContainer.style.display = 'none';
  }

  currentAttachedAudio = note.audioUrl || null;
  if (currentAttachedAudio) {
    audioPreview.src = currentAttachedAudio;
    audioPreviewContainer.style.display = 'flex';
  } else {
    audioPreviewContainer.style.display = 'none';
  }

  stopRecordingIfActive();
  stopSpeechRecognition();

  document.getElementById('modalTitle').textContent = '✏️ แก้ไขกระดาษโน้ต';
  noteModal.style.display = 'flex';
}

function closeModal() {
  stopRecordingIfActive();
  stopSpeechRecognition();
  noteModal.style.display = 'none';
}

async function handleSaveNote() {
  const title = noteTitleInput.value.trim();
  if (!title) {
    showToast('กรุณากรอกหัวข้อเรื่องที่ต้องทำ');
    noteTitleInput.focus();
    return;
  }

  const id = noteIdInput.value || `note-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  const existingNote = currentNotes.find((n) => n.id === id);

  // If time was changed or it's a new note, reset notification flag
  const timeChanged = !existingNote || existingNote.dueDate !== noteDueDateInput.value || existingNote.dueTime !== noteDueTimeInput.value;

  const noteData = {
    id: id,
    title: title,
    details: noteDetailsInput.value.trim(),
    dueDate: noteDueDateInput.value || null,
    dueTime: noteDueTimeInput.value || null,
    alarm10Min: noteAlarm10Min.checked,
    notified10Min: timeChanged ? false : (existingNote.notified10Min || false),
    color: selectedColor,
    photoUrl: currentAttachedPhoto,
    audioUrl: currentAttachedAudio,
    isDone: existingNote ? existingNote.isDone : false,
    createdAt: existingNote ? existingNote.createdAt : Date.now()
  };

  // Gracefully request notification permission if alarm is enabled
  if (noteAlarm10Min.checked && 'Notification' in window && Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch (e) {}
  }

  try {
    await db.saveNote(noteData);
    if (existingNote) {
      const idx = currentNotes.findIndex((n) => n.id === id);
      currentNotes[idx] = noteData;
      showToast('💾 อัปเดตข้อมูลโน้ตแล้ว');
    } else {
      currentNotes.push(noteData);
      showToast('📌 แปะกระดาษโน้ตสำเร็จ!');
    }

    closeModal();
    renderNotes();
  } catch (err) {
    console.error('Error saving note:', err);
    showToast('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
  }
}

// ==========================================
// 7. Color Swatch Selection
// ==========================================
colorPalette.addEventListener('click', (e) => {
  const swatch = e.target.closest('.color-swatch');
  if (!swatch) return;
  const color = swatch.getAttribute('data-color');
  selectColorSwatch(color);
});

function selectColorSwatch(color) {
  selectedColor = color;
  colorPalette.querySelectorAll('.color-swatch').forEach((s) => {
    s.classList.toggle('active', s.getAttribute('data-color') === color);
  });
}

// ==========================================
// 8. Quick Date Buttons
// ==========================================
setTodayBtn.addEventListener('click', () => {
  noteDueDateInput.value = getTodayString();
});

setTomorrowBtn.addEventListener('click', () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  noteDueDateInput.value = `${d.getFullYear()}-${m}-${day}`;
});

setNextWeekBtn.addEventListener('click', () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  noteDueDateInput.value = `${d.getFullYear()}-${m}-${day}`;
});

clearDateBtn.addEventListener('click', () => {
  noteDueDateInput.value = '';
  noteDueTimeInput.value = '';
});

// ==========================================
// 9. Speech-to-Text (แปลงเสียงเป็นข้อความไทย)
// ==========================================
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceTitleBtn.title = 'เบราว์เซอร์นี้ไม่รองรับการแปลงเสียงเป็นข้อความ';
    voiceDetailsBtn.title = 'เบราว์เซอร์นี้ไม่รองรับการแปลงเสียงเป็นข้อความ';
    return;
  }

  speechRecognition = new SpeechRecognition();
  speechRecognition.lang = 'th-TH'; // Thai language
  speechRecognition.continuous = false;
  speechRecognition.interimResults = true;

  speechRecognition.onstart = () => {
    speechBanner.style.display = 'flex';
    speechStatusText.textContent = 'กำลังฟังเสียงพูดของคุณ... กรุณาพูดได้เลย';
    if (activeSpeechTarget === 'noteTitle') {
      voiceTitleBtn.classList.add('recording');
    } else {
      voiceDetailsBtn.classList.add('recording');
    }
  };

  speechRecognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }

    if (activeSpeechTarget === 'noteTitle') {
      noteTitleInput.value = transcript;
    } else if (activeSpeechTarget === 'noteDetails') {
      const prev = noteDetailsInput.getAttribute('data-prev-text') || '';
      noteDetailsInput.value = (prev ? prev + ' ' : '') + transcript;
    }
  };

  speechRecognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    speechStatusText.textContent = `เกิดข้อผิดพลาดในการฟัง: ${event.error}`;
    setTimeout(stopSpeechRecognition, 1500);
  };

  speechRecognition.onend = () => {
    stopSpeechRecognition();
  };
}

function startSpeechRecognition(targetId) {
  if (!speechRecognition) {
    alert('อุปกรณ์หรือเบราว์เซอร์นี้ยังไม่รองรับระบบสั่งการด้วยเสียง\n(แนะนำให้ใช้ Google Chrome หรือ Safari บนมือถือครับ)');
    return;
  }

  // If already running, stop it
  if (activeSpeechTarget) {
    stopSpeechRecognition();
    return;
  }

  activeSpeechTarget = targetId;
  if (targetId === 'noteDetails') {
    noteDetailsInput.setAttribute('data-prev-text', noteDetailsInput.value);
  }

  try {
    speechRecognition.start();
  } catch (err) {
    console.error('Speech error:', err);
    stopSpeechRecognition();
  }
}

function stopSpeechRecognition() {
  if (speechRecognition && activeSpeechTarget) {
    try {
      speechRecognition.stop();
    } catch (e) {}
  }
  activeSpeechTarget = null;
  speechBanner.style.display = 'none';
  voiceTitleBtn.classList.remove('recording');
  voiceDetailsBtn.classList.remove('recording');
}

voiceTitleBtn.addEventListener('click', () => startSpeechRecognition('noteTitle'));
voiceDetailsBtn.addEventListener('click', () => startSpeechRecognition('noteDetails'));
stopVoiceBtn.addEventListener('click', stopSpeechRecognition);

// ==========================================
// 10. Photo Upload & Compression
// ==========================================
cameraBtn.addEventListener('click', () => {
  photoFileInput.click();
});

photoFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    showToast('กำลังประมวลผลรูปภาพ...');
    const compressedDataUrl = await compressImageFile(file, 1200, 0.82);
    currentAttachedPhoto = compressedDataUrl;
    imagePreview.src = compressedDataUrl;
    imagePreviewContainer.style.display = 'flex';
    showToast('📸 แนบรูปภาพสำเร็จ');
  } catch (err) {
    console.error('Photo compression error:', err);
    showToast('เกิดข้อผิดพลาดในการโหลดรูปภาพ');
  } finally {
    photoFileInput.value = '';
  }
});

removePhotoBtn.addEventListener('click', () => {
  currentAttachedPhoto = null;
  imagePreview.src = '';
  imagePreviewContainer.style.display = 'none';
});

function compressImageFile(file, maxDimension, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

function openImageViewer(photoUrl) {
  fullImageViewer.src = photoUrl;
  imageModal.style.display = 'flex';
}

// ==========================================
// 11. Voice Memo Recording (อัดคลิปเสียง)
// ==========================================
recordAudioBtn.addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    // Stop recording
    mediaRecorder.stop();
  } else {
    // Start recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstart = () => {
        recordStartTime = Date.now();
        recordAudioBtn.textContent = '⏹️ หยุดบันทึกเสียง';
        recordAudioBtn.classList.add('recording');
        recordTimer.style.display = 'inline';
        recordTimer.textContent = '00:00';

        recordTimerInterval = setInterval(() => {
          const elapsedSec = Math.floor((Date.now() - recordStartTime) / 1000);
          const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
          const secs = String(elapsedSec % 60).padStart(2, '0');
          recordTimer.textContent = `${mins}:${secs}`;
        }, 500);
      };

      mediaRecorder.onstop = async () => {
        clearInterval(recordTimerInterval);
        recordAudioBtn.textContent = '🔴 กดเพื่อเริ่มอัดเสียง';
        recordAudioBtn.classList.remove('recording');
        recordTimer.style.display = 'none';

        // Stop all audio tracks to release microphone
        stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          currentAttachedAudio = reader.result;
          audioPreview.src = currentAttachedAudio;
          audioPreviewContainer.style.display = 'flex';
          showToast('🎙️ บันทึกคลิปเสียงสำเร็จ');
        };
      };

      mediaRecorder.start();
    } catch (err) {
      console.error('Microphone error:', err);
      alert('ไม่สามารถเข้าถึงไมโครโฟนได้ กรุณาอนุญาตให้ใช้งานไมโครโฟนในเบราว์เซอร์ครับ');
    }
  }
});

function stopRecordingIfActive() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  clearInterval(recordTimerInterval);
  recordAudioBtn.textContent = '🔴 กดเพื่อเริ่มอัดเสียง';
  recordAudioBtn.classList.remove('recording');
  recordTimer.style.display = 'none';
}

removeAudioBtn.addEventListener('click', () => {
  currentAttachedAudio = null;
  audioPreview.src = '';
  audioPreviewContainer.style.display = 'none';
});

// ==========================================
// 12. Backup & Restore (Export / Import)
// ==========================================
backupBtn.addEventListener('click', () => {
  backupModal.style.display = 'flex';
});

closeBackupModalBtn.addEventListener('click', () => {
  backupModal.style.display = 'none';
});

exportDataBtn.addEventListener('click', () => {
  const dataStr = JSON.stringify(currentNotes, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kanluem-backup-${getTodayString()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 ดาวน์โหลดไฟล์สำรองข้อมูลเรียบร้อย');
});

importDataBtn.addEventListener('click', () => {
  importFileInput.click();
});

importFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const importedNotes = JSON.parse(event.target.result);
      if (Array.isArray(importedNotes)) {
        await db.bulkInsert(importedNotes);
        currentNotes = await db.getAllNotes();
        renderNotes();
        backupModal.style.display = 'none';
        showToast(`🎉 กู้คืนข้อมูลสำเร็จ ${importedNotes.length} รายการ`);
      } else {
        alert('รูปแบบไฟล์ไม่ถูกต้อง');
      }
    } catch (err) {
      console.error('Import error:', err);
      alert('ไม่สามารถอ่านไฟล์สำรองข้อมูลนี้ได้');
    }
  };
  reader.readAsText(file);
  importFileInput.value = '';
});

// ==========================================
// 13. Filter Tabs & Search & Sort
// ==========================================
document.querySelectorAll('.filter-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.getAttribute('data-filter');
    renderNotes();
  });
});

searchInput.addEventListener('input', (e) => {
  currentSearchQuery = e.target.value.trim();
  clearSearchBtn.style.display = currentSearchQuery ? 'block' : 'none';
  renderNotes();
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  currentSearchQuery = '';
  clearSearchBtn.style.display = 'none';
  renderNotes();
});

sortSelect.addEventListener('change', (e) => {
  currentSort = e.target.value;
  renderNotes();
});

// ==========================================
// 14. Dialog & FAB Listeners
// ==========================================
addNoteFab.addEventListener('click', openCreateModal);
closeModalBtn.addEventListener('click', closeModal);
cancelModalBtn.addEventListener('click', closeModal);
noteForm.addEventListener('submit', (e) => {
  e.preventDefault();
  handleSaveNote();
});

// Close modal on background click
noteModal.addEventListener('click', (e) => {
  if (e.target === noteModal) closeModal();
});
backupModal.addEventListener('click', (e) => {
  if (e.target === backupModal) backupModal.style.display = 'none';
});

// ==========================================
// 15. Toast Utility
// ==========================================
let toastTimeout = null;
function showToast(message) {
  clearTimeout(toastTimeout);
  toastEl.textContent = message;
  toastEl.style.display = 'block';
  toastTimeout = setTimeout(() => {
    toastEl.style.display = 'none';
  }, 2600);
}

// ==========================================
// 16. Alarm System (10-minute prior chime & alert)
// ==========================================
function playChimeSound() {
  try {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtxClass) return;
    const ctx = new AudioCtxClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const playTone = (freq, startTime, duration, type = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.4, startTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    // Pleasant 4-tone melodious chime (C5 -> E5 -> G5 -> C6)
    playTone(523.25, now + 0.00, 0.45, 'triangle');
    playTone(659.25, now + 0.20, 0.45, 'triangle');
    playTone(783.99, now + 0.40, 0.45, 'triangle');
    playTone(1046.50, now + 0.60, 0.90, 'sine');

    // Repeated chime after 1.2s for clarity
    playTone(523.25, now + 1.20, 0.45, 'triangle');
    playTone(659.25, now + 1.40, 0.45, 'triangle');
    playTone(783.99, now + 1.60, 0.45, 'triangle');
    playTone(1046.50, now + 1.80, 1.20, 'sine');
  } catch (e) {
    console.warn('Web Audio error:', e);
  }
}

function startAlarmRinging(note) {
  stopAlarmRinging();
  playChimeSound();

  // Mobile vibration
  if (navigator.vibrate) {
    try { navigator.vibrate([400, 200, 400, 200, 600]); } catch (e) {}
  }

  // Ring again every 5 seconds until dismissed
  activeAlarmInterval = setInterval(() => {
    playChimeSound();
    if (navigator.vibrate) {
      try { navigator.vibrate([400, 200, 400]); } catch (e) {}
    }
  }, 5000);

  // Auto stop ringing sound after 45 seconds
  setTimeout(stopAlarmRinging, 45000);
}

function stopAlarmRinging() {
  if (activeAlarmInterval) {
    clearInterval(activeAlarmInterval);
    activeAlarmInterval = null;
  }
}

function triggerAlarm(note) {
  alarmTitleText.textContent = note.title;
  alarmTimeText.textContent = `กำหนดเวลา: ${note.dueDate} ${note.dueTime ? 'เวลา ' + note.dueTime + ' น.' : ''}`;
  if (note.details) {
    alarmDetailsText.textContent = note.details;
    alarmDetailsText.style.display = 'block';
  } else {
    alarmDetailsText.style.display = 'none';
  }

  alarmModal.style.display = 'flex';
  startAlarmRinging(note);

  // System Push Notification
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('⏰ เตือนความจำ! อีก 10 นาที', {
        body: `${note.title}\nกำหนดเวลา: ${note.dueTime || ''} น.`,
        icon: 'icon.png'
      });
    } catch (e) {}
  }
}

dismissAlarmBtn.addEventListener('click', () => {
  stopAlarmRinging();
  alarmModal.style.display = 'none';
  showToast('👌 รับทราบการแจ้งเตือนแล้ว');
});

testAlarmSoundBtn.addEventListener('click', () => {
  if ('Notification' in window && Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch (e) {}
  }
  playChimeSound();
  if (navigator.vibrate) {
    try { navigator.vibrate([300, 150, 300]); } catch (e) {}
  }
  showToast('🔊 กำลังเล่นเสียงเตือนทดสอบ');
});

function setupAlarmChecker() {
  // Check every 10 seconds
  setInterval(checkUpcomingAlarms, 10000);
  // Also check immediately on load
  checkUpcomingAlarms();
}

function checkUpcomingAlarms() {
  if (!currentNotes || currentNotes.length === 0) return;
  const now = new Date();
  const nowMs = now.getTime();

  currentNotes.forEach(async (note) => {
    if (note.isDone) return;
    if (!note.dueDate || !note.dueTime) return;
    if (note.alarm10Min === false) return;
    if (note.notified10Min) return;

    // Parse target date and time
    const [year, month, day] = note.dueDate.split('-').map(Number);
    const [hours, minutes] = note.dueTime.split(':').map(Number);
    const targetDueTime = new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();

    // 10 minutes before
    const alertWindowStart = targetDueTime - (10 * 60 * 1000);

    // If current time is within 10 minutes before target due time
    if (nowMs >= alertWindowStart && nowMs < targetDueTime) {
      triggerAlarm(note);
      note.notified10Min = true;
      await db.saveNote(note);
      renderNotes();
    }
  });
}

// Launch application
window.addEventListener('DOMContentLoaded', initApp);
