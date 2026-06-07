// AeroTransit System Controller

// --- System State ---
const state = {
  activeView: 'booking',
  passes: [],
  activeTransaction: null,
  seatLockTimer: null,
  lockExpiresAt: null,
  
  // DevOps metrics & simulation
  trafficRate: 35, // req/s
  autoscaling: true,
  lbAlgorithm: 'round-robin',
  lastRoutedIndex: 0,
  servers: [
    { id: 'node-01', name: 'AeroNode-US1', cpu: 12, connections: 18, status: 'healthy' },
    { id: 'node-02', name: 'AeroNode-US2', cpu: 12, connections: 17, status: 'healthy' }
  ],
  queue: [],
  latency: 18, // ms
  integritySuccessCount: 100,
  integrityFailureCount: 0,
  serverCrashCount: 0,

  // HMAC verification secret key
  secretKey: 'AEROTRANSIT_CLOUD_GATEWAY_HMAC_SECRET_2026'
};

// --- Constant Databases ---
const ROUTE_DATABASE = {
  'route-1': { id: 'route-1', name: 'Metro Express', source: 'Downtown Terminal', dest: 'Airport Terminal', basePrice: 25.00, distance: 120 },
  'route-2': { id: 'route-2', name: 'InterCity Liner', source: 'Hub City Central', dest: 'North Terminus', basePrice: 45.50, distance: 240 },
  'route-3': { id: 'route-3', name: 'Coastal Shuttle', source: 'Bay Area Wharf', dest: 'Beachside Boardwalk', basePrice: 15.00, distance: 65 },
  'route-4': { id: 'route-4', name: 'Trans-State Sleeper', source: 'East Terminal', dest: 'West Terminal', basePrice: 85.00, distance: 480 }
};

// --- Init Application ---
document.addEventListener('DOMContentLoaded', () => {
  // Load passes from localStorage if exists
  const savedPasses = localStorage.getItem('aerotransit_passes');
  if (savedPasses) {
    try {
      state.passes = JSON.parse(savedPasses);
      updatePassBadge();
    } catch (e) {
      console.error('Error loading passes:', e);
    }
  }

  // Initialize Lucide icons
  lucide.createIcons();

  // Setup UI event listeners
  setupNavigation();
  setupBookingForm();
  setupDevOpsConsole();
  setupVerifierPortal();

  // Start DevOps simulation loop (ticks every 1s)
  setInterval(devopsSimulationTick, 1000);

  // Render initial active servers
  renderServerNodes();
});

// --- Toast Notification Utility ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconName = 'check-circle';
  if (type === 'warning') iconName = 'alert-triangle';
  if (type === 'danger') iconName = 'alert-octagon';
  
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="toast-icon"></i>
    <div class="toast-msg">${message}</div>
  `;
  container.appendChild(toast);
  lucide.createIcons();

  // Auto remove toast
  setTimeout(() => {
    toast.style.animation = 'slide-in 0.3s reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --- Terminal Logger Utility ---
function addDevOpsLog(message, type = 'info') {
  const terminal = document.getElementById('devops-terminal-logs');
  if (!terminal) return;

  const time = new Date().toLocaleTimeString();
  
  let labelClass = 'text-success';
  if (type === 'warning') labelClass = 'text-warning';
  if (type === 'danger' || type === 'health-danger') labelClass = 'text-danger';
  if (type === 'scaler-success') labelClass = 'text-success';
  if (type === 'sys') labelClass = 'text-success';
  
  let typePrefix = `[INFO]`;
  if (type === 'lb') typePrefix = `[LB]`;
  if (type === 'scaler' || type === 'scaler-success') typePrefix = `[SCALER]`;
  if (type === 'health' || type === 'health-danger') typePrefix = `[HEALTH]`;
  if (type === 'queue') typePrefix = `[QUEUE]`;
  if (type === 'security') typePrefix = `[SECURITY]`;
  
  const logLine = document.createElement('div');
  logLine.className = 'terminal-log-line';
  
  logLine.innerHTML = `<span style="color:var(--text-muted)">[${time}]</span> <span class="${labelClass}" style="font-weight:600;">${typePrefix}</span> ${message}`;
  
  terminal.appendChild(logLine);
  
  // Cap lines at 50
  while (terminal.childElementCount > 50) {
    terminal.firstElementChild.remove();
  }
  
  // Scroll to bottom
  terminal.scrollTop = terminal.scrollHeight;
}

// --- Cryptographic Signatures (SHA-256 HMAC Simulation) ---
// Simple hash function for quick client-side cryptographic demo
// Calculates a signature based on passenger, route, seat, date, price, and our secret key.
function calculatePassSignature(passId, passengerName, routeId, seatNum, date, price) {
  const payload = `${passId}|${passengerName}|${routeId}|${seatNum}|${date}|${parseFloat(price).toFixed(2)}|${state.secretKey}`;
  
  // Calculate SHA256 string representation
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Form a hex signature
  const hexSig = Math.abs(hash).toString(16).padStart(8, '0') + 
                 Math.abs(hash * 31).toString(16).padStart(8, '0');
  return hexSig.toUpperCase();
}

// --- Navigation Controller ---
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetView = item.getAttribute('data-view');
      switchView(targetView);
    });
  });
}

function switchView(viewId) {
  state.activeView = viewId;
  
  // Update sidebar buttons active states
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-view') === viewId);
  });

  // Switch panels
  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `view-${viewId}`);
  });

  // Update headers
  const viewTitles = {
    booking: { title: "Book Bus Passes", desc: "Secure, tamper-proof ticketing with instant seat locking." },
    vault: { title: "My Pass Wallet", desc: "View and manage your cryptographically signed boarding passes." },
    verifier: { title: "Ticket Verifier Terminal", desc: "Perform gate-level cryptographic validations and anti-theft checks." },
    devops: { title: "DevOps Orchestration Console", desc: "Monitor system health, CPU loads, and auto-scaling events." }
  };

  const titleNode = document.getElementById('current-view-title');
  const descNode = document.getElementById('current-view-desc');
  
  if (viewTitles[viewId]) {
    titleNode.textContent = viewTitles[viewId].title;
    descNode.textContent = viewTitles[viewId].desc;
  }

  // Trigger specialized view renders
  if (viewId === 'vault') {
    renderPassVault();
  } else if (viewId === 'verifier') {
    updateVerifierDropdown();
  } else if (viewId === 'devops') {
    updateDevOpsUI();
  }

  // Refresh lucide icons
  lucide.createIcons();
}

// --- Booking Portal Logic ---
function setupBookingForm() {
  const routeSelect = document.getElementById('route-select');
  const travelDate = document.getElementById('travel-date');
  const travelTime = document.getElementById('travel-time');
  const passengerName = document.getElementById('passenger-name');
  const proceedBtn = document.getElementById('btn-proceed-seating');
  const priceBox = document.getElementById('price-box');
  const tamperCheckbox = document.getElementById('tamper-price-checkbox');

  // Set minimum date to today
  const today = new Date().toISOString().split('T')[0];
  travelDate.setAttribute('min', today);
  travelDate.value = today;

  function handleInputChange() {
    const routeId = routeSelect.value;
    const name = passengerName.value.trim();
    const date = travelDate.value;

    if (routeId && name && date) {
      proceedBtn.removeAttribute('disabled');
      calculateAndDisplayPrice();
    } else {
      proceedBtn.setAttribute('disabled', 'true');
      priceBox.classList.add('hidden');
    }
  }

  routeSelect.addEventListener('change', handleInputChange);
  travelDate.addEventListener('change', handleInputChange);
  travelTime.addEventListener('change', handleInputChange);
  passengerName.addEventListener('change', handleInputChange);
  passengerName.addEventListener('input', handleInputChange);
  tamperCheckbox.addEventListener('change', calculateAndDisplayPrice);

  function calculateAndDisplayPrice() {
    const routeId = routeSelect.value;
    if (!routeId) return;

    const route = ROUTE_DATABASE[routeId];
    let baseFare = route.basePrice;
    
    // Check if we are simulating tampering
    if (tamperCheckbox.checked) {
      baseFare = 1.00; // Simulated tampered price!
    }

    const taxRate = 0.08;
    const tax = baseFare * taxRate;
    const total = baseFare + tax;

    // Show breakdown
    priceBox.classList.remove('hidden');
    document.getElementById('base-fare-price').textContent = `$${baseFare.toFixed(2)}`;
    document.getElementById('tax-price').textContent = `$${tax.toFixed(2)}`;
    document.getElementById('total-fare-price').textContent = `$${total.toFixed(2)}`;
    
    // Generate transaction locking id
    if (!state.activeTransaction || state.activeTransaction.routeId !== routeId) {
      const txId = 'TX-' + Math.floor(100000 + Math.random() * 900000);
      document.getElementById('transaction-id').textContent = txId;
      state.activeTransaction = {
        txId,
        routeId,
        basePrice: baseFare,
        tax,
        totalPrice: total,
        passengerName: passengerName.value.trim(),
        date: travelDate.value,
        time: travelTime.value
      };
    }
  }

  // Handle proceed to seating mapping
  document.getElementById('route-search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.activeTransaction) return;

    // Transition seating section out of disabled state
    const seatingSection = document.getElementById('seating-section');
    seatingSection.classList.remove('disabled-state');

    // Trigger seat locking countdown
    startSeatLockTimer();

    // Render seats grid
    generateSeatingGrid();

    // Update seating summary
    document.getElementById('seating-summary').textContent = "Seating session initialized. Choose a seat to lock. Price locks expire in 10 minutes.";
    showToast("Seat selection active. Secure transactional pricing locked.", "success");
  });
}

function startSeatLockTimer() {
  if (state.seatLockTimer) clearInterval(state.seatLockTimer);
  
  const timerCount = document.getElementById('timer-countdown');
  const timerBadge = document.getElementById('seating-timer');
  timerBadge.classList.remove('hidden');

  let duration = 600; // 10 minutes
  
  function updateTimer() {
    let minutes = Math.floor(duration / 60);
    let seconds = duration % 60;
    
    minutes = minutes < 10 ? '0' + minutes : minutes;
    seconds = seconds < 10 ? '0' + seconds : seconds;
    
    timerCount.textContent = `${minutes}:${seconds}`;
    
    if (duration <= 0) {
      clearInterval(state.seatLockTimer);
      // Expired! Lock out seat map
      document.getElementById('seating-section').classList.add('disabled-state');
      timerBadge.classList.add('hidden');
      document.getElementById('btn-book-now').classList.add('hidden');
      document.getElementById('seating-summary').innerHTML = `<span class="text-danger">Transactional seat lock expired! Please search again to renew.</span>`;
      state.activeTransaction = null;
      showToast("Transactional lock expired. Seating map locked to prevent pricing collision.", "warning");
    }
    duration--;
  }

  updateTimer();
  state.seatLockTimer = setInterval(updateTimer, 1000);
}

// Generate the physical seats (4 columns, rows representing different tiers)
function generateSeatingGrid() {
  const grid = document.getElementById('seats-grid');
  grid.innerHTML = '';

  // 28 seats total (7 rows of 4)
  // Rows 1-2: Premium (gold)
  // Rows 3-6: Standard (gray)
  // Row 7: Sleeper (purple, double height rows simulated by layout)
  const rows = 7;
  const cols = 4;

  // Mock occupied seats
  const occupiedSeats = [3, 7, 12, 18, 22];

  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const seatNum = (r - 1) * cols + c;
      const isOccupied = occupiedSeats.includes(seatNum);
      
      let tier = 'standard';
      if (r <= 2) tier = 'premium';
      if (r === 7) tier = 'sleeper';

      const btn = document.createElement('button');
      btn.className = `seat-btn ${tier} ${isOccupied ? 'occupied' : ''}`;
      btn.setAttribute('data-seat', seatNum);
      btn.setAttribute('data-tier', tier);
      btn.innerHTML = seatNum;

      if (!isOccupied) {
        btn.addEventListener('click', () => handleSeatSelection(btn, seatNum, tier));
      }
      grid.appendChild(btn);
    }
  }
}

function handleSeatSelection(btn, seatNum, tier) {
  // Toggle selection
  const previouslySelected = document.querySelector('.seat-btn.selected');
  if (previouslySelected) {
    previouslySelected.classList.remove('selected');
  }

  // If clicked again on the same, we just toggle it off
  if (previouslySelected && previouslySelected.getAttribute('data-seat') === seatNum.toString()) {
    document.getElementById('btn-book-now').classList.add('hidden');
    document.getElementById('seating-summary').textContent = "Select a seat to lock and secure your booking.";
    state.activeTransaction.seat = null;
    return;
  }

  btn.classList.add('selected');
  
  // Calculate tier pricing multiplier
  let multiplier = 1.0;
  let tierLabel = 'Standard Seat';
  if (tier === 'premium') { multiplier = 1.20; tierLabel = 'Premium Class (+20%)'; }
  if (tier === 'sleeper') { multiplier = 1.50; tierLabel = 'Sleeper Pod (+50%)'; }

  const basePrice = state.activeTransaction.basePrice * multiplier;
  const tax = basePrice * 0.08;
  const total = basePrice + tax;

  // Update transaction ticket
  state.activeTransaction.seat = seatNum;
  state.activeTransaction.seatTier = tier;
  state.activeTransaction.finalPrice = total;

  // Display summary details
  document.getElementById('seating-summary').innerHTML = `
    Seat <strong>#${seatNum}</strong> locked. class: <strong>${tierLabel}</strong>.<br>
    Final secure transaction value: <strong class="text-success">$${total.toFixed(2)}</strong>.
  `;

  // Show buy button
  const bookBtn = document.getElementById('btn-book-now');
  bookBtn.classList.remove('hidden');
  bookBtn.onclick = () => processCheckout();
}

// --- Checkout System & Transactional Queues ---
function processCheckout() {
  if (!state.activeTransaction || !state.activeTransaction.seat) {
    showToast("Invalid checkout: Seat not selected", "danger");
    return;
  }

  // System load throttling check
  const systemCpu = parseFloat(state.servers.reduce((acc, s) => acc + s.cpu, 0) / state.servers.length);
  
  if (systemCpu > 85) {
    // Traffic surge! Place client in queue
    showToast("Server cluster load high. Rate limiting gateway activated.", "warning");
    initializeVirtualQueue();
  } else {
    // Normal booking processing (direct transaction)
    executeTransaction();
  }
}

function initializeVirtualQueue() {
  // Create a queue entry overlay in document body
  const queueOverlay = document.createElement('div');
  queueOverlay.id = 'queue-overlay';
  queueOverlay.className = 'glass-card';
  queueOverlay.style.position = 'fixed';
  queueOverlay.style.top = '50%';
  queueOverlay.style.left = '50%';
  queueOverlay.style.transform = 'translate(-50%, -50%)';
  queueOverlay.style.zIndex = '1000';
  queueOverlay.style.width = '420px';
  queueOverlay.style.padding = '30px';
  queueOverlay.style.boxShadow = '0 0 40px rgba(0,0,0,0.8), 0 0 2px var(--accent-cyan)';
  
  let queuePos = Math.floor(10 + Math.random() * 15);
  
  queueOverlay.innerHTML = `
    <h3 style="font-family: var(--font-family-title); display:flex; align-items:center; gap:10px; margin-bottom:15px; color: var(--warning)">
      <i data-lucide="hourglass" class="pulse-indicator" style="position:relative; right:0;"></i> 
      Cloud Checkout Queue
    </h3>
    <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:20px; line-height:1.5;">
      AeroTransit Cloud Load Balancer is throttling requests to prevent database write collision and pricing errors under heavy rush.
    </p>
    <div style="background:rgba(0,0,0,0.2); padding:16px; border-radius:8px; border:1px solid rgba(255,255,255,0.05); text-align:center; margin-bottom:20px;">
      <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Position in Line</div>
      <strong id="queue-position-val" style="font-size:2rem; color:var(--accent-cyan); font-family:var(--font-family-title);">${queuePos}</strong>
    </div>
    <div class="progress-bar-container" style="height:8px; margin-bottom:10px;">
      <div id="queue-progress-bar" class="progress-bar-fill cpu-fill" style="width: 0%; background:var(--accent-gradient);"></div>
    </div>
    <div style="text-align:center; font-size:0.75rem; color:var(--text-muted);">Please do not refresh or close this panel.</div>
  `;
  document.body.appendChild(queueOverlay);
  lucide.createIcons();

  // Add to global state queue tracker for devops visibility
  state.queue.push({ txId: state.activeTransaction.txId, pos: queuePos });
  updateDevOpsUI();

  // Tick down queue position every 700ms
  const maxPos = queuePos;
  const queueInterval = setInterval(() => {
    queuePos--;
    const progress = ((maxPos - queuePos) / maxPos) * 100;
    
    const posNode = document.getElementById('queue-position-val');
    const barNode = document.getElementById('queue-progress-bar');
    
    if (posNode) posNode.textContent = queuePos;
    if (barNode) barNode.style.width = `${progress}%`;
    
    if (queuePos <= 0) {
      clearInterval(queueInterval);
      queueOverlay.remove();
      
      // Remove from state queue
      state.queue = state.queue.filter(q => q.txId !== state.activeTransaction.txId);
      updateDevOpsUI();

      // Proceed to transaction
      executeTransaction();
    }
  }, 800);
}

function executeTransaction() {
  const tx = state.activeTransaction;
  const route = ROUTE_DATABASE[tx.routeId];

  // Pass Generation
  const passId = 'AT-' + Math.floor(10000000 + Math.random() * 90000000);
  const signature = calculatePassSignature(
    passId, 
    tx.passengerName, 
    tx.routeId, 
    tx.seat, 
    tx.date, 
    tx.finalPrice
  );

  const newPass = {
    passId,
    passengerName: tx.passengerName,
    routeId: tx.routeId,
    routeName: route.name,
    source: route.source,
    dest: route.dest,
    distance: route.distance,
    date: tx.date,
    time: tx.time,
    seat: tx.seat,
    seatTier: tx.seatTier,
    price: tx.finalPrice,
    signature: signature,
    used: false,
    issuedAt: new Date().toISOString()
  };

  // Save pass to state & localStorage
  state.passes.unshift(newPass);
  localStorage.setItem('aerotransit_passes', JSON.stringify(state.passes));

  // Clear transactional state & locking
  clearInterval(state.seatLockTimer);
  state.activeTransaction = null;
  document.getElementById('seating-timer').classList.add('hidden');
  document.getElementById('seating-section').classList.add('disabled-state');
  document.getElementById('btn-book-now').classList.add('hidden');
  document.getElementById('price-box').classList.add('hidden');
  document.getElementById('route-search-form').reset();
  
  updatePassBadge();

  // Reset seat grid selection style
  const selectedSeat = document.querySelector('.seat-btn.selected');
  if (selectedSeat) selectedSeat.className = 'seat-btn standard occupied'; // marked as occupied now!

  showToast("Bus pass successfully booked, signed & secured in wallet!", "success");
  switchView('vault');
}

function updatePassBadge() {
  const badge = document.getElementById('pass-badge');
  badge.textContent = state.passes.length;
  badge.classList.toggle('hidden', state.passes.length === 0);
}

// --- Pass Vault Rendering ---
function renderPassVault() {
  const container = document.getElementById('vault-passes-container');
  container.innerHTML = '';

  if (state.passes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="empty-icon" data-lucide="wallet"></i>
        <h3>No Passes Booked Yet</h3>
        <p>Book a ticket from the route planner to view your cryptographically secured bus passes here.</p>
        <button class="btn-primary btn-inline" onclick="switchView('booking')">Book a Pass Now</button>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  state.passes.forEach(pass => {
    const card = document.createElement('div');
    card.className = `bus-pass-card ${pass.used ? 'used' : ''}`;
    
    // Create Pass Layout
    card.innerHTML = `
      <div class="pass-header">
        <div class="pass-brand">
          <i data-lucide="shield-check"></i> AeroTransit Secure
        </div>
        <div class="pass-badge">${pass.used ? 'SCANNED / USED' : 'ACTIVE PASS'}</div>
      </div>
      <div class="pass-body">
        <div class="pass-route">
          <div class="route-point">
            <span class="label">From</span>
            <span class="city">${pass.source.split(' ')[0]}</span>
          </div>
          <div class="route-arrow">
            <i data-lucide="arrow-right-left"></i>
            <span class="route-dist">${pass.distance} km</span>
          </div>
          <div class="route-point">
            <span class="label">To</span>
            <span class="city">${pass.dest.split(' ')[0]}</span>
          </div>
        </div>

        <div class="pass-grid">
          <div class="pass-info-block">
            <span class="label">Passenger</span>
            <span class="value">${pass.passengerName}</span>
          </div>
          <div class="pass-info-block">
            <span class="label">Travel Date</span>
            <span class="value">${pass.date} @ ${pass.time}</span>
          </div>
          <div class="pass-info-block">
            <span class="label">Seat / Tier</span>
            <span class="value">#${pass.seat} (${pass.seatTier.toUpperCase()})</span>
          </div>
          <div class="pass-info-block">
            <span class="label">Fare (Inc. Cloud fee)</span>
            <span class="value text-success">$${pass.price.toFixed(2)}</span>
          </div>
        </div>

        <div class="pass-qr-section">
          <canvas class="qr-canvas" id="canvas-${pass.passId}"></canvas>
          <div class="qr-caption">SIG: ${pass.signature.substring(0, 16)}...</div>
        </div>
      </div>
      <div class="pass-footer">
        <div>Pass ID: <span class="pass-id">${pass.passId}</span></div>
        <div style="font-size:0.65rem; color:var(--text-muted);">WebCrypto Sign: OK</div>
      </div>
    `;

    container.appendChild(card);
    
    // Draw the custom QR signature representation on canvas
    drawCustomQRPattern(`canvas-${pass.passId}`, pass.signature);
  });

  lucide.createIcons();
}

// Generates an offline-reproducible visually accurate barcode/QR pattern on canvas using the hash signature bytes
function drawCustomQRPattern(canvasId, signature) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const size = 140;
  canvas.width = size;
  canvas.height = size;

  // Clear Canvas to White
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);

  // Set grid configuration (15x15 data matrix)
  const cols = 15;
  const rows = 15;
  const cellSize = Math.floor(size / cols);
  const padding = (size - (cols * cellSize)) / 2;

  // Convert hex signature string into boolean data matrix
  const sigData = [];
  // Use hex string to build grid
  for (let i = 0; i < signature.length; i++) {
    const byte = parseInt(signature[i], 16);
    // Expand a single hex char (0-15) into 4 bits
    sigData.push((byte & 8) > 0);
    sigData.push((byte & 4) > 0);
    sigData.push((byte & 2) > 0);
    sigData.push((byte & 1) > 0);
  }

  // Draw black modules
  ctx.fillStyle = '#000000';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Check if we are inside QR corner detection markers
      const isTopLeftMarker = (r < 4 && c < 4);
      const isTopRightMarker = (r < 4 && c >= cols - 4);
      const isBottomLeftMarker = (r >= rows - 4 && c < 4);

      if (isTopLeftMarker || isTopRightMarker || isBottomLeftMarker) {
        // Draw standard QR finder patterns
        const localR = r < 4 ? r : (r >= rows - 4 ? r - (rows - 4) : r);
        const localC = c < 4 ? c : (c >= cols - 4 ? c - (cols - 4) : c);

        // Finder pattern ring style: hollow 4x4 squares
        const fill = (localR === 0 || localR === 3 || localC === 0 || localC === 3) || (localR === 1.5 && localC === 1.5) || (localR === 1 && localC === 1) || (localR === 2 && localC === 2);
        if (fill) {
          ctx.fillRect(padding + c * cellSize, padding + r * cellSize, cellSize, cellSize);
        }
      } else {
        // Draw data bytes based on signature array
        const index = (r * cols + c) % sigData.length;
        if (sigData[index]) {
          ctx.fillRect(padding + c * cellSize, padding + r * cellSize, cellSize, cellSize);
        }
      }
    }
  }
}

// --- Ticket Verifier Logic (Conductor Terminal) ---
function setupVerifierPortal() {
  const dropdown = document.getElementById('verifier-pass-select');
  const scanBtn = document.getElementById('btn-scan-pass');

  scanBtn.addEventListener('click', () => {
    const selectedPassId = dropdown.value;
    if (!selectedPassId) return;
    
    // Find pass in state
    const passIndex = state.passes.findIndex(p => p.passId === selectedPassId);
    if (passIndex === -1) return;

    triggerScannerSequence(state.passes[passIndex]);
  });
}

function updateVerifierDropdown() {
  const dropdown = document.getElementById('verifier-pass-select');
  const scanBtn = document.getElementById('btn-scan-pass');
  const sabotageBox = document.getElementById('tamper-pass-options-box');

  dropdown.innerHTML = '';
  
  if (state.passes.length === 0) {
    dropdown.innerHTML = `<option value="" disabled selected>No active passes in system...</option>`;
    scanBtn.setAttribute('disabled', 'true');
    sabotageBox.classList.add('hidden');
    return;
  }

  scanBtn.removeAttribute('disabled');
  sabotageBox.classList.remove('hidden');

  state.passes.forEach(pass => {
    const option = document.createElement('option');
    option.value = pass.passId;
    option.textContent = `${pass.passId} - ${pass.passengerName} (Seat #${pass.seat})`;
    dropdown.appendChild(option);
  });

  // Setup sabotage click events
  document.getElementById('btn-tamper-name').onclick = () => sabotagePass('name', dropdown.value);
  document.getElementById('btn-tamper-route').onclick = () => sabotagePass('route', dropdown.value);
  document.getElementById('btn-tamper-price').onclick = () => sabotagePass('price', dropdown.value);
}

function sabotagePass(property, passId) {
  const pass = state.passes.find(p => p.passId === passId);
  if (!pass) return;

  if (property === 'name') {
    pass.passengerName = "Hacker Clone";
    showToast(`Sabotaged pass ${passId}: Altered passenger name to "Hacker Clone"`, "warning");
  } else if (property === 'route') {
    pass.source = "Secret Hacker Base";
    pass.dest = "VIP Terminal";
    showToast(`Sabotaged pass ${passId}: Altered destinations`, "warning");
  } else if (property === 'price') {
    pass.price = 1.00; // Force price down!
    showToast(`Sabotaged pass ${passId}: Altered ticket price to $1.00`, "warning");
  }

  // Update localStorage to simulate local DB tampering
  localStorage.setItem('aerotransit_passes', JSON.stringify(state.passes));
  updateVerifierDropdown();
}

async function triggerScannerSequence(pass) {
  const screen = document.getElementById('scanner-result-panel').firstElementChild;
  const display = document.getElementById('scanner-display');
  const details = document.getElementById('scanner-details');
  const cryptoBox = document.getElementById('crypto-log-box');
  const cryptoLines = document.getElementById('crypto-terminal-lines');

  // Show crypto box
  if (cryptoBox) cryptoBox.classList.remove('hidden');
  if (cryptoLines) cryptoLines.innerHTML = '';

  // Reset display
  screen.className = 'scanner-screen scanning';
  display.innerHTML = `
    <i data-lucide="scan" class="scanner-idle-icon" style="animation: spin 2s linear infinite"></i>
    <p>Reading QR Matrix Payload...</p>
  `;
  details.innerHTML = '';
  lucide.createIcons();

  const sleep = ms => new Promise(res => setTimeout(res, ms));
  
  async function writeLine(text, type) {
    const div = document.createElement('div');
    div.className = `crypto-line ${type}`;
    div.innerHTML = text;
    cryptoLines.appendChild(div);
    cryptoLines.parentElement.scrollTop = cryptoLines.parentElement.scrollHeight;
    await sleep(250);
  }

  // Cryptographic step-by-step typewriter logs
  await writeLine(`[SYS] Scan sequence initialized for ticket: ${pass.passId}...`, 'sys');
  await writeLine(`[SYS] Reading offline QR canvas data matrix...`, 'sys');
  
  const expectedSig = calculatePassSignature(
    pass.passId, 
    pass.passengerName, 
    pass.routeId, 
    pass.seat, 
    pass.date, 
    pass.price
  );
  
  await writeLine(`[SEC] Reconstructing signature verification string:<br>"${pass.passId}|${pass.passengerName}|${pass.routeId}|${pass.seat}|${pass.date}|${parseFloat(pass.price).toFixed(2)}|[SECRET_SALT]"`, 'sec');
  await writeLine(`[SEC] Executing SHA-256 HMAC checksum algorithm...`, 'sec');
  
  const signatureMatches = (pass.signature === expectedSig);
  
  await writeLine(`[SEC] Extracted signature: <span style="font-family:monospace; font-weight:700;">${pass.signature.substring(0, 16)}</span>`, 'sec');
  await writeLine(`[SEC] Re-computed signature: <span style="font-family:monospace; font-weight:700;">${expectedSig.substring(0, 16)}</span>`, 'sec');

  if (!signatureMatches) {
    await writeLine(`[SEC] Integrity validation check: FAILED (Signatures mismatch!)`, 'err');
    await writeLine(`[SYS] Gate status: LOCKED. Ticket price/details tampered.`, 'err');
    
    // TAMPER DETECTED
    state.integrityFailureCount++;
    addDevOpsLog(`SECURITY ALERT: Gate verifier blocked ticket [${pass.passId}] due to pricing/signature tamper.`, 'security');
    
    screen.className = 'scanner-screen scan-failed';
    display.innerHTML = `
      <i data-lucide="x-circle" style="color:var(--danger); width:48px; height:48px;"></i>
      <div class="result-badge text-danger">TAMPER FRAUD</div>
      <p class="result-msg">Security signature integrity check failed. Pass payload has been altered offline.</p>
    `;
    showToast("Security Exception: QR Code signature verification failed!", "danger");
    renderScannerDetails(pass, false, "Signature Mismatch / Pricing Sabotage");
  } 
  else if (pass.used) {
    await writeLine(`[SEC] Integrity validation check: PASSED (Signature valid)`, 'success');
    await writeLine(`[SYS] Querying cloud pass registry check-in register...`, 'sys');
    await writeLine(`[SYS] Double-scan validation: FAILED (Check-in flag = true)`, 'err');
    await writeLine(`[SYS] Gate status: LOCKED. Boarding denied (Double check-in exception).`, 'err');
    
    // DUPLICATE ATTEMPT DETECTED
    state.integrityFailureCount++;
    addDevOpsLog(`SECURITY ALERT: Gate verifier blocked boarding reuse check for pass [${pass.passId}] (Used flag true).`, 'security');
    
    screen.className = 'scanner-screen scan-failed';
    display.innerHTML = `
      <i data-lucide="alert-octagon" style="color:var(--danger); width:48px; height:48px;"></i>
      <div class="result-badge text-danger">TICKET STOLEN / DUPLICATE</div>
      <p class="result-msg">Double-scan alert. Pass ID already boarding on node: AeroNode-US1.</p>
    `;
    showToast("Double Boarding Attempt Blocked! Single-use pass policy violation.", "danger");
    renderScannerDetails(pass, false, "Ticket Already Used / Shared Clone");
  }
  else {
    await writeLine(`[SEC] Integrity validation check: PASSED (Signature valid)`, 'success');
    await writeLine(`[SYS] Querying cloud pass registry check-in register...`, 'sys');
    await writeLine(`[SYS] Double-scan validation: PASSED (Check-in flag = false)`, 'success');
    
    // Determine routed server node
    const nonCrashedNodes = state.servers.filter(s => s.status !== 'crashed');
    const routedNode = nonCrashedNodes[state.lastRoutedIndex % Math.max(1, nonCrashedNodes.length)] || { name: 'AeroNode-US1' };
    
    await writeLine(`[SYS] Mapping transaction check-in register write to node [${routedNode.name}]...`, 'sys');
    await writeLine(`[SYS] Gate status: UNLOCKED. Boarding authorized!`, 'success');
    
    // SUCCESS boarding allowed
    state.integritySuccessCount++;
    pass.used = true;
    // Save scanned state to local storage
    localStorage.setItem('aerotransit_passes', JSON.stringify(state.passes));
    
    addDevOpsLog(`Gate verifier validated pass [${pass.passId}] (Passenger: ${pass.passengerName}). Routed registry write to node [${routedNode.name}].`, 'sys');
    
    screen.className = 'scanner-screen scan-success';
    display.innerHTML = `
      <i data-lucide="check-circle" style="color:var(--success); width:48px; height:48px;"></i>
      <div class="result-badge text-success">PASS VALID</div>
      <p class="result-msg">Cryptographic key verified. Safe boarding authorized.</p>
    `;
    showToast("Boarding cleared. Ticket signature checks complete.", "success");
    renderScannerDetails(pass, true, "Valid");
    
    // Update badge states
    updatePassBadge();
  }
  
  lucide.createIcons();
}

function renderScannerDetails(pass, isSuccess, statusDesc) {
  const details = document.getElementById('scanner-details');
  details.innerHTML = `
    <h4 style="font-size:0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom:8px; margin-bottom:10px;">Gate Registry Readout</h4>
    <div class="verifier-details-grid">
      <div>
        <span>Pass ID</span>
        <strong>${pass.passId}</strong>
      </div>
      <div>
        <span>Status</span>
        <strong class="${isSuccess ? 'text-success' : 'text-danger'}">${statusDesc}</strong>
      </div>
      <div>
        <span>Passenger</span>
        <strong>${pass.passengerName}</strong>
      </div>
      <div>
        <span>Route</span>
        <strong>${pass.source.split(' ')[0]} ➔ ${pass.dest.split(' ')[0]}</strong>
      </div>
      <div>
        <span>Seat Assignment</span>
        <strong>Seat #${pass.seat} (${pass.seatTier.toUpperCase()})</strong>
      </div>
      <div>
        <span>Signed Fare Value</span>
        <strong>$${pass.price.toFixed(2)}</strong>
      </div>
    </div>
  `;
}

// --- DevOps Simulation & Load Auto-Scaling Console ---
function setupDevOpsConsole() {
  const range = document.getElementById('traffic-range');
  const rangeVal = document.getElementById('traffic-slider-val');
  const autoscalingCheckbox = document.getElementById('autoscaling-checkbox');

  range.addEventListener('input', () => {
    state.trafficRate = parseInt(range.value);
    rangeVal.textContent = `${state.trafficRate} req/s`;
    
    // De-activate active buttons presets
    document.querySelectorAll('.btn-preset').forEach(btn => btn.classList.remove('active'));
    updateDevOpsUI();
  });

  autoscalingCheckbox.addEventListener('change', () => {
    state.autoscaling = autoscalingCheckbox.checked;
    const descText = document.getElementById('devops-scaling-status');
    if (!state.autoscaling) {
      descText.textContent = "Cluster manual override (Auto-Scaling OFF)";
      showToast("Auto-scaling disabled. Server nodes locked.", "warning");
      addDevOpsLog("Dynamic auto-scaler disabled by operator. Cluster locked.", "warning");
    } else {
      descText.textContent = "Cluster scaling enabled (Target load: 60%)";
      showToast("Auto-scaling enabled. Dynamic provisioning active.", "success");
      addDevOpsLog("Dynamic auto-scaler enabled. Elastic triggers active.", "scaler-success");
    }
  });

  // Handle Preset Clicks
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const preset = btn.getAttribute('data-preset');
      
      if (preset === 'normal') {
        state.trafficRate = 35;
        addDevOpsLog("Preset activated: Normal Traffic (35 req/s)", "sys");
      } else if (preset === 'rush') {
        state.trafficRate = 420;
        addDevOpsLog("Preset activated: Rush Hour Peak (420 req/s)", "warning");
      } else if (preset === 'flash') {
        state.trafficRate = 880;
        addDevOpsLog("Preset activated: Ticket Flash Sale (880 req/s). Rate limiter queue monitoring active.", "warning");
      } else if (preset === 'ddos') {
        state.trafficRate = 1500;
        addDevOpsLog("Preset activated: CRITICAL DDoS Attack (1500 req/s). High fail-rate alerts triggered.", "danger");
      }

      range.value = state.trafficRate;
      rangeVal.textContent = `${state.trafficRate} req/s`;
      updateDevOpsUI();
    });
  });

  // Load Balancer Policy Dropdown
  const lbSelect = document.getElementById('lb-algorithm');
  const lbActivePolicy = document.getElementById('lb-active-policy');
  
  if (lbSelect) {
    lbSelect.addEventListener('change', () => {
      state.lbAlgorithm = lbSelect.value;
      let policyName = "Round Robin";
      if (state.lbAlgorithm === 'least-connections') policyName = "Least Connections";
      if (state.lbAlgorithm === 'sticky-session') policyName = "Sticky Sessions";
      
      lbActivePolicy.textContent = policyName;
      addDevOpsLog(`Load Balancer routing policy changed to: ${policyName.toUpperCase()}`, 'lb');
      showToast(`LB Routing algorithm set to ${policyName}`, 'success');
      updateDevOpsUI();
    });
  }

  // Clear Logs Button
  const clearLogsBtn = document.getElementById('btn-clear-logs');
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
      const terminal = document.getElementById('devops-terminal-logs');
      if (terminal) terminal.innerHTML = '';
      showToast("DevOps console log buffer cleared.", "success");
    });
  }
}

// Tick loop running in background every 1s simulating CPU fluctuation and elastic scaling
function devopsSimulationTick() {
  const activeNodes = state.servers.filter(s => s.status !== 'crashed');
  const serverCount = state.servers.length;
  const activeCount = activeNodes.length;
  
  // Self-healing Check
  state.servers.forEach((server) => {
    if (server.status === 'crashed' && server.crashedAt && (Date.now() - server.crashedAt >= 5000)) {
      // Heal server!
      server.status = 'healthy';
      server.cpu = 12;
      server.connections = 0;
      delete server.crashedAt;
      addDevOpsLog(`Self-healing system recovered offline instance [${server.name}]. rejoining pool.`, 'health');
      showToast(`Node ${server.name} auto-repaired and re-joined cluster.`, 'success');
      renderServerNodes();
    }
  });

  // System status and load calculations
  let avgCpu = 0;
  if (activeCount === 0) {
    avgCpu = 100;
    state.latency = 2000;
  } else {
    // Peak server capacity per node: 150 req/s
    const capacity = activeCount * 150;
    
    // Calculate base cluster load
    let baseLoad = (state.trafficRate / capacity) * 100;
    baseLoad += (Math.random() * 4 - 2); // random jitter
    const targetLoad = Math.max(5, Math.min(100, Math.round(baseLoad)));

    // Update node metrics based on states
    state.servers.forEach(server => {
      if (server.status === 'crashed') {
        server.cpu = 0;
        server.connections = 0;
      } else if (server.status === 'spiking') {
        server.cpu = 100;
        // takes maximum connections
        server.connections = Math.round((state.trafficRate / activeCount) * 1.4);
      } else {
        // healthy
        const nodeLoad = Math.max(5, Math.min(100, Math.round(targetLoad + (Math.random() * 6 - 3))));
        server.cpu = nodeLoad;
        
        // Router distribution simulation
        if (state.lbAlgorithm === 'round-robin') {
          server.connections = Math.round((state.trafficRate / activeCount) + (Math.random() * 2 - 1));
        } else if (state.lbAlgorithm === 'least-connections') {
          // Connections distributed to keep loads even
          server.connections = Math.round((state.trafficRate / activeCount) * (1 - (server.cpu - targetLoad)/180));
        } else { // sticky-session
          // distributes with sticky hashing bias
          const indexOffset = server.name.charCodeAt(server.name.length - 1) % 3;
          server.connections = Math.round((state.trafficRate / activeCount) * (0.8 + indexOffset * 0.15));
        }
        server.connections = Math.max(0, server.connections);

        if (nodeLoad >= 90) {
          server.status = 'overloaded';
        } else {
          server.status = 'healthy';
        }
      }
    });

    avgCpu = Math.round(state.servers.reduce((acc, s) => acc + s.cpu, 0) / serverCount);
  }

  // Elastic Scaling Controller Loop (only triggers if auto-scaling is enabled and healthy servers exist)
  if (state.autoscaling && activeCount > 0) {
    if (avgCpu > 60 && state.servers.length < 9) {
      provisionServerNode();
    } else if (avgCpu < 25 && state.servers.length > 2) {
      deprovisionServerNode();
    }
  }

  // System latency calculations
  if (activeCount === 0) {
    state.latency = 5000;
    state.serverCrashCount++;
  } else if (avgCpu >= 90) {
    state.latency = Math.round(180 + (avgCpu - 90) * 150);
    state.serverCrashCount++;
  } else {
    state.latency = Math.round(15 + (avgCpu / 10) * 2);
  }

  // Database transaction integrity rate
  const integrityVal = document.getElementById('devops-integrity-rate');
  const crashStateVal = document.getElementById('devops-crash-state');
  
  if (activeCount === 0) {
    state.integrityFailureCount += Math.floor(Math.random() * 8 + 4);
    if (crashStateVal) {
      crashStateVal.textContent = "CRITICAL / CLUSTER OFFLINE";
      crashStateVal.className = "text-danger";
    }
    document.querySelector('.status-dot').className = "status-dot offline";
    document.querySelector('.status-text').textContent = "Cluster Offline 503";
    
    if (Math.random() < 0.4) {
      addDevOpsLog("CRITICAL ERROR: No active server nodes available in routing pool. Checkout server 503.", "health-danger");
    }
  } else if (avgCpu >= 98 && !state.autoscaling) {
    state.integrityFailureCount += Math.floor(Math.random() * 5);
    if (crashStateVal) {
      crashStateVal.textContent = "CRASHING / 503 SERVICE UNAVAILABLE";
      crashStateVal.className = "text-danger";
    }
    document.querySelector('.status-dot').className = "status-dot offline";
    document.querySelector('.status-text').textContent = "Server Overload 503";
  } else {
    const hasSpikeNode = state.servers.some(s => s.status === 'spiking' || s.status === 'overloaded');
    if (crashStateVal) {
      crashStateVal.textContent = hasSpikeNode ? "DEGRADED PERFORMANCE" : "HEALTHY / ONLINE";
      crashStateVal.className = hasSpikeNode ? "text-warning" : "text-success";
    }
    
    document.querySelector('.status-dot').className = hasSpikeNode ? "status-dot degraded" : "status-dot online";
    document.querySelector('.status-text').textContent = hasSpikeNode ? "System Load High" : "Cloud Server Status";
  }

  const successRate = (state.integritySuccessCount / (state.integritySuccessCount + state.integrityFailureCount)) * 100;
  if (integrityVal) {
    integrityVal.textContent = `${successRate.toFixed(2)}%`;
    integrityVal.className = successRate < 95 ? 'text-danger' : 'text-success';
  }

  // Log routing statistics periodically
  if (activeCount > 0 && Math.random() < 0.35) {
    const algoName = state.lbAlgorithm.replace('-', ' ').toUpperCase();
    addDevOpsLog(`Load Balancer routed request pool across ${activeCount} active nodes. Policy: ${algoName}.`, 'lb');
  }

  // Update UI values
  updateDevOpsUI();
}

function provisionServerNode() {
  const nextNum = state.servers.length + 1;
  const newNode = {
    id: `node-0${nextNum}`,
    name: `AeroNode-US${nextNum}`,
    cpu: 10,
    connections: 0,
    status: 'healthy'
  };
  state.servers.push(newNode);
  renderServerNodes();
  addDevOpsLog(`Auto-Scaler spawned replacement node [${newNode.name}] to balance high load.`, 'scaler');
  showToast(`Auto-Scaling Out: Provisioned node [${newNode.name}]`, "success");
}

function deprovisionServerNode() {
  const removed = state.servers.pop();
  renderServerNodes();
  addDevOpsLog(`Auto-Scaler terminated idle node [${removed.name}] to conserve cloud resources.`, 'scaler');
  showToast(`Auto-Scaling In: Terminated node [${removed.name}]`, "warning");
}

function renderServerNodes() {
  const container = document.getElementById('nodes-visualizer-container');
  if (!container) return;

  container.innerHTML = '';

  state.servers.forEach(server => {
    const box = document.createElement('div');
    box.id = server.id;
    
    // Set appropriate class based on status
    let boxClass = 'node-box active';
    let iconName = 'server';
    
    if (server.status === 'crashed') {
      boxClass = 'node-box crashed';
      iconName = 'x-circle';
    } else if (server.status === 'spiking') {
      boxClass = 'node-box spiking';
      iconName = 'zap';
    } else if (server.status === 'overloaded') {
      boxClass = 'node-box overloaded';
      iconName = 'alert-triangle';
    }

    box.className = boxClass;

    box.innerHTML = `
      <i data-lucide="${iconName}" class="node-icon"></i>
      <div class="node-name">${server.name}</div>
      <div class="node-load-text">Load: ${server.cpu}%</div>
      <div class="node-load-text">Active: ${server.connections} c/s</div>
      <div class="node-bar-container">
        <div class="node-bar-fill" style="width: ${server.cpu}%; background: ${
          server.status === 'crashed' ? 'var(--danger)' : 
          (server.status === 'spiking' || server.status === 'overloaded' ? 'var(--warning)' : 'var(--success)')
        }"></div>
      </div>
    `;

    // Click behavior to toggle node states (crash simulation)
    box.addEventListener('click', () => {
      toggleServerNodeState(server);
    });

    container.appendChild(box);
  });
  
  lucide.createIcons();
}

function toggleServerNodeState(server) {
  if (server.status === 'crashed') {
    // Recover
    server.status = 'healthy';
    server.cpu = 10;
    delete server.crashedAt;
    addDevOpsLog(`Operator manual override: Restarted node [${server.name}]. Rejoining pool.`, 'health');
    showToast(`Server node ${server.name} recovered.`, 'success');
  } else if (server.status === 'spiking') {
    // Crash
    server.status = 'crashed';
    server.cpu = 0;
    server.connections = 0;
    server.crashedAt = Date.now();
    addDevOpsLog(`Operator manual override: Terminated node [${server.name}] immediately!`, 'health-danger');
    showToast(`Server node ${server.name} crashed!`, 'danger');
  } else {
    // Spike CPU
    server.status = 'spiking';
    server.cpu = 100;
    addDevOpsLog(`Operator manual override: Simulated CPU leak spike on node [${server.name}]. CPU at 100%.`, 'warning');
    showToast(`CPU leak simulated on ${server.name}.`, 'warning');
  }
  renderServerNodes();
  updateDevOpsUI();
}

function updateDevOpsUI() {
  const avgCpu = Math.round(state.servers.reduce((acc, s) => acc + s.cpu, 0) / state.servers.length);
  
  // Dashboard values
  document.getElementById('devops-cpu-val').textContent = `${avgCpu}%`;
  const barFill = document.getElementById('devops-cpu-bar');
  barFill.style.width = `${avgCpu}%`;
  barFill.className = `progress-bar-fill cpu-fill ${avgCpu >= 90 ? 'danger' : ''}`;

  document.getElementById('devops-nodes-val').textContent = `${state.servers.length} Nodes`;
  document.getElementById('devops-req-val').textContent = `${state.trafficRate} req/s`;
  
  // Queue stats
  document.getElementById('devops-queue-val').textContent = `${state.queue.length} In Queue`;
  const queueStatus = document.getElementById('devops-queue-status');
  if (state.queue.length > 0) {
    queueStatus.textContent = `Throttling: Gate closed (Queue Active)`;
    queueStatus.className = 'stat-subtext text-warning';
  } else {
    queueStatus.textContent = `Gateway: Open (Direct Access)`;
    queueStatus.className = 'stat-subtext';
  }

  // Sidebar stats
  document.getElementById('sidebar-servers').textContent = `${state.servers.length} Nodes`;
  document.getElementById('sidebar-cpu').textContent = `${avgCpu}%`;

  // Topbar stats
  document.getElementById('pill-queue').textContent = state.queue.length;
  document.getElementById('pill-latency').textContent = `${state.latency}ms`;

  document.getElementById('devops-latency-val').textContent = `${state.latency} ms`;

  // Update node boxes colors directly
  state.servers.forEach(server => {
    const box = document.getElementById(server.id);
    if (box) {
      box.className = `node-box ${server.status === 'overloaded' ? 'overloaded' : 'active'}`;
      const loadText = box.querySelector('.node-load-text');
      if (loadText) loadText.textContent = `Load: ${server.cpu}%`;
      const connText = box.querySelectorAll('.node-load-text')[1];
      if (connText) connText.textContent = `Active: ${server.connections} c/s`;
      const bar = box.querySelector('.node-bar-fill');
      if (bar) {
        bar.style.width = `${server.cpu}%`;
        bar.style.background = server.status === 'overloaded' ? 'var(--danger)' : 'var(--success)';
      }
    }
  });
}
