// ============================================================
// VaporPrint Queue Demo - Simulated Flow (No Backend Required)
// Uses localStorage to sync between Student & Owner tabs.
// ============================================================

// --- State ---
const STORAGE_KEY = 'vaporprint_demo_queue';
let uploadedFiles = [];
let printConfig = { colorMode: 'bw', duplex: 'single', copies: 1 };
let currentJobId = null;

// --- Helpers ---
function generateOrderNum() {
  return '#' + String(Math.floor(100 + Math.random() * 900));
}
function generateOTP() {
  return String(Math.floor(1000 + Math.random() * 9000));
}
function getQueue() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveQueue(q) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(q));
  window.dispatchEvent(new Event('storage')); // trigger same-tab listeners
}

// --- Screen Navigation ---
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (id === 'owner-dashboard') renderOwnerQueue();
}

// --- File Upload ---
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');

fileInput?.addEventListener('change', (e) => handleFileSelect(e.target.files));
dropZone?.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone?.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('drag-over'); handleFileSelect(e.dataTransfer.files); });

function handleFileSelect(files) {
  for (const f of files) {
    if (f.size > 100 * 1024 * 1024) continue;
    uploadedFiles.push({ name: f.name, size: f.size, type: f.type, file: f });
  }
  renderFileList();
}

function renderFileList() {
  const list = document.getElementById('file-list');
  const config = document.getElementById('config-section');
  if (!list) return;

  if (uploadedFiles.length === 0) {
    list.innerHTML = '';
    config?.classList.add('hidden');
    return;
  }

  config?.classList.remove('hidden');
  list.innerHTML = uploadedFiles.map((f, i) => `
    <div class="file-item">
      <div class="file-item-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      </div>
      <div class="file-item-info">
        <div class="file-item-name">${f.name}</div>
        <div class="file-item-meta">${(f.size / 1024).toFixed(0)} KB • ${f.type.split('/')[1] || 'file'}</div>
      </div>
      <button class="file-item-remove" onclick="removeFile(${i})">✕</button>
    </div>
  `).join('');
}

function removeFile(idx) {
  uploadedFiles.splice(idx, 1);
  renderFileList();
}

// --- Config ---
function setConfig(btn) {
  const group = btn.parentElement;
  group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  printConfig[btn.dataset.config] = btn.dataset.value;
}

function changeCopies(delta) {
  printConfig.copies = Math.max(1, Math.min(99, printConfig.copies + delta));
  document.getElementById('copies-count').textContent = printConfig.copies;
}

// --- Send to Print ---
function sendToPrint() {
  if (uploadedFiles.length === 0) return;

  const orderNum = generateOrderNum();
  const queue = getQueue();
  const totalPages = uploadedFiles.reduce((s, f) => s + Math.ceil(f.size / 50000), 0); // rough estimate
  const pricePerPage = printConfig.colorMode === 'color' ? 5 : 2;
  const totalPrice = totalPages * pricePerPage * printConfig.copies;

  const job = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    orderNum,
    files: uploadedFiles.map(f => ({ name: f.name, size: f.size, type: f.type })),
    config: { ...printConfig },
    status: 'waiting', // waiting -> printing -> ready -> done
    otp: null,
    price: Math.max(totalPrice, 5),
    createdAt: Date.now(),
    totalPages,
  };

  queue.push(job);
  saveQueue(queue);
  currentJobId = job.id;
  uploadedFiles = [];

  // Show tracking
  showTrackingScreen(job);
}

// --- Student Tracking ---
function showTrackingScreen(job) {
  showScreen('student-tracking');
  document.getElementById('tracking-order-num').textContent = job.orderNum;
  updateTrackingUI(job);

  // Poll for updates (simulating realtime via localStorage)
  if (window._trackingInterval) clearInterval(window._trackingInterval);
  window._trackingInterval = setInterval(() => {
    const queue = getQueue();
    const updated = queue.find(j => j.id === currentJobId);
    if (updated) {
      updateTrackingUI(updated);
      if (updated.status === 'done') clearInterval(window._trackingInterval);
    }
  }, 500);
}

function updateTrackingUI(job) {
  const iconEl = document.getElementById('tracking-icon');
  const waiting = document.getElementById('status-waiting');
  const printing = document.getElementById('status-printing');
  const ready = document.getElementById('status-ready');

  // Hide all icons first
  document.getElementById('icon-waiting').classList.add('hidden');
  document.getElementById('icon-printing').classList.add('hidden');
  document.getElementById('icon-ready').classList.add('hidden');

  waiting.classList.add('hidden');
  printing.classList.add('hidden');
  ready.classList.add('hidden');

  if (job.status === 'waiting') {
    document.getElementById('icon-waiting').classList.remove('hidden');
    iconEl.className = 'tracking-status-icon waiting';
    waiting.classList.remove('hidden');
    const queue = getQueue();
    const waitingJobs = queue.filter(j => j.status === 'waiting');
    const pos = waitingJobs.findIndex(j => j.id === job.id) + 1;
    document.getElementById('queue-position').textContent = 
      pos > 0 ? `${pos - 1} people ahead of you` : 'You\'re next!';
    document.getElementById('queue-progress').style.width = pos <= 1 ? '90%' : `${Math.max(10, 90 - (pos - 1) * 20)}%`;
  } else if (job.status === 'printing') {
    document.getElementById('icon-printing').classList.remove('hidden');
    iconEl.className = 'tracking-status-icon printing';
    printing.classList.remove('hidden');
    // Vibrate
    if (navigator.vibrate) navigator.vibrate(100);
  } else if (job.status === 'ready') {
    document.getElementById('icon-ready').classList.remove('hidden');
    iconEl.className = 'tracking-status-icon ready';
    ready.classList.remove('hidden');
    document.getElementById('otp-display').textContent = job.otp || '----';
    document.getElementById('price-display').textContent = job.price;
    // Vibrate + sound
    if (navigator.vibrate) navigator.vibrate([100, 50, 200]);
    playDing();
  }
}

function playDing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) { /* ignore */ }
}

// ============================================================
// SHOP OWNER DASHBOARD
// ============================================================

function renderOwnerQueue() {
  const queue = getQueue();
  const list = document.getElementById('queue-list');
  if (!list) return;

  // Update stats
  const waiting = queue.filter(j => j.status === 'waiting').length;
  const printing = queue.filter(j => j.status === 'printing').length;
  const ready = queue.filter(j => j.status === 'ready').length;
  const done = queue.filter(j => j.status === 'done').length;

  document.getElementById('stat-waiting').textContent = waiting;
  document.getElementById('stat-printing').textContent = printing;
  document.getElementById('stat-ready').textContent = ready;
  document.getElementById('stat-done').textContent = done;

  const activeJobs = queue.filter(j => j.status !== 'done');

  if (activeJobs.length === 0) {
    list.innerHTML = `<div class="empty-queue"><p>Waiting for print jobs...</p><p class="hint-text">Switch to the Student tab and upload a file to see it appear here.</p></div>`;
    return;
  }

  list.innerHTML = activeJobs.map(job => {
    const colorTag = job.config.colorMode === 'color' ? '<span class="job-tag tag-color">COLOR</span>' : '<span class="job-tag tag-bw">B&W</span>';
    const statusTag = job.status === 'waiting' ? '<span class="tag-status tag-waiting">⏳ WAITING</span>'
      : job.status === 'printing' ? '<span class="tag-status tag-printing">🖨️ PRINTING</span>'
      : '<span class="tag-status tag-ready">✅ READY</span>';

    let actions = '';
    if (job.status === 'waiting') {
      actions = `<button class="btn btn-primary btn-sm" onclick="ownerPrintJob('${job.id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        PRINT JOB</button>`;
    } else if (job.status === 'printing') {
      actions = `<button class="btn btn-success btn-sm" onclick="ownerMarkReady('${job.id}')">✓ MARK READY</button>`;
    } else if (job.status === 'ready') {
      actions = `<span style="font-size:11px;font-weight:800;color:var(--success)">OTP: ${job.otp}</span>`;
    }

    actions += ` <button class="btn btn-danger btn-sm" onclick="ownerDeleteJob('${job.id}')">✕</button>`;

    const fileNames = job.files.map(f => f.name).join(', ');
    return `
      <div class="job-card">
        <div class="job-left">
          <div class="job-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div style="min-width:0">
            <div class="job-name">${fileNames}</div>
            <div class="job-meta">${job.orderNum} • ${job.config.copies} copies • ~${job.totalPages} pages • ₹${job.price}</div>
            <div class="job-tags">${colorTag} ${statusTag}</div>
          </div>
        </div>
        <div class="job-actions">${actions}</div>
      </div>
    `;
  }).join('');
}

function ownerPrintJob(jobId) {
  const queue = getQueue();
  const job = queue.find(j => j.id === jobId);
  if (!job) return;
  job.status = 'printing';
  saveQueue(queue);
  renderOwnerQueue();
  playDing();
}

function ownerMarkReady(jobId) {
  const queue = getQueue();
  const job = queue.find(j => j.id === jobId);
  if (!job) return;
  job.status = 'ready';
  job.otp = generateOTP();
  saveQueue(queue);
  renderOwnerQueue();
  playDing();
}

function ownerDeleteJob(jobId) {
  let queue = getQueue();
  queue = queue.filter(j => j.id !== jobId);
  saveQueue(queue);
  renderOwnerQueue();
}

// --- Master OTP Verification ---
function handleMasterOTP(input) {
  input.value = input.value.replace(/\D/g, '');
  document.getElementById('master-verify-btn').disabled = input.value.length !== 4;
}

function verifyMasterOTP() {
  const input = document.getElementById('master-otp-input');
  const otp = input.value;
  const queue = getQueue();
  const job = queue.find(j => j.status === 'ready' && j.otp === otp);

  if (!job) {
    input.style.borderColor = 'var(--danger)';
    input.style.animation = 'shake .3s';
    setTimeout(() => { input.style.borderColor = ''; input.style.animation = ''; }, 500);
    return;
  }

  // Mark as done
  job.status = 'done';
  saveQueue(queue);
  input.value = '';
  document.getElementById('master-verify-btn').disabled = true;
  renderOwnerQueue();

  // Flash success
  const bar = document.querySelector('.master-otp-bar');
  bar.style.borderColor = 'var(--success)';
  bar.style.background = 'hsl(160,60%,96%)';
  setTimeout(() => { bar.style.borderColor = ''; bar.style.background = ''; }, 1500);
}

// --- Cross-Tab Sync via storage event ---
window.addEventListener('storage', () => {
  // If owner dashboard is visible, re-render
  if (document.getElementById('owner-dashboard').classList.contains('active')) {
    renderOwnerQueue();
  }
});

// Also poll for same-tab updates (localStorage events don't fire in same tab normally)
setInterval(() => {
  if (document.getElementById('owner-dashboard').classList.contains('active')) {
    renderOwnerQueue();
  }
}, 1000);

// Init
document.getElementById('role-select').classList.add('active');
