const $ = id => document.getElementById(id);

const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BALANCE_OF = '70a08231';
const DEFAULT_RPC = 'https://mainnet.base.org';
const ACCOUNT_KEY = 'pennyspawn_local_accounts_v2';
const PUBLIC_KEY = 'pennyspawn_public_settings_v2';
const SETTINGS_PREFIX = 'pennyspawn_settings_v2:';
const STATE_PREFIX = 'pennyspawn_agent_v2:';
const BLOCKED = /(phish|credential theft|steal(?:ing)? password|malware|ransomware|keylogger|fake review|impersonat(?:e|ion)|counterfeit|stolen goods|money mule|bypass kyc|evade law enforcement|seed phrase|private key|guaranteed profit|spam campaign)/i;

let authMode = 'login';
let currentUser = '';
let spectatorMode = false;
let settings = defaultSettings();
let agent = defaultAgent();
let wallet = {
  confirmed: 0,
  display: 0,
  displayFrom: 0,
  displayTo: 0,
  animationStart: performance.now(),
  sessionReceived: 0,
  cycleReceived: 0,
  lastReceiptAt: 0,
  lastPollAt: 0,
  lastBlock: null,
  history: [],
  healthy: false,
  error: ''
};
let modelWorker = null;
let modelReady = false;
let modelLoading = false;
let modelDevice = '—';
let engineRunning = false;
let walletPollTimer = null;
let cycleTimer = null;
let installPrompt = null;
let arenaFx = { beam: 0, flash: 0, particles: [], pulse: 0 };
let dpr = 1;
let chartDpr = 1;

function defaultSettings() {
  return { wallet: '', cycleMinutes: 10, skills: '', rpc: DEFAULT_RPC };
}

function defaultAgent() {
  return {
    id: 'penny-agent-01',
    generation: 1,
    fitness: 0.25,
    status: 'waiting',
    strategy: 'Awaiting a verified wallet and local model.',
    nextAction: 'Add your public Base wallet address in Settings. Never enter a seed phrase or private key.',
    why: 'Real wallet telemetry is required before a survival cycle can begin.',
    cycleStart: 0,
    cycleEnd: 0,
    cycleStartBalance: null,
    modelCycles: 0,
    retired: [],
    offspring: [],
    events: [{ t: Date.now(), m: 'PennySpawn Local initialized. No revenue is simulated.' }]
  };
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => $('toast').classList.remove('show'), 1800);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function log(message) {
  agent.events.unshift({ t: Date.now(), m: String(message) });
  agent.events = agent.events.slice(0, 80);
  saveAgent();
}

function money(value, digits = 6) {
  const n = Number(value || 0);
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(digits)}`;
}

function clock(seconds) {
  seconds = Math.max(0, Math.floor(seconds || 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function validAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
}

function getAccounts() {
  try { return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || '{}'); } catch { return {}; }
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(length = 16) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function passwordHash(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map(x => parseInt(x, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 180000, hash: 'SHA-256' }, key, 256);
  return bytesToHex(bits);
}

async function registerAccount(username, password, confirm) {
  username = username.trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,24}$/.test(username)) throw new Error('Use 3–24 letters, numbers, _ or -.');
  if (password.length < 8) throw new Error('Password must contain at least 8 characters.');
  if (password !== confirm) throw new Error('Passwords do not match.');
  const accounts = getAccounts();
  if (accounts[username]) throw new Error('That local username already exists on this device.');
  const salt = randomHex(16);
  accounts[username] = { salt, hash: await passwordHash(password, salt), createdAt: Date.now() };
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accounts));
  return username;
}

async function loginAccount(username, password) {
  username = username.trim().toLowerCase();
  const account = getAccounts()[username];
  if (!account) throw new Error('No local account with that username. Register first.');
  const hash = await passwordHash(password, account.salt);
  if (hash !== account.hash) throw new Error('Password not accepted.');
  return username;
}

function switchAuth(mode) {
  authMode = mode;
  $('loginTab').classList.toggle('active', mode === 'login');
  $('registerTab').classList.toggle('active', mode === 'register');
  $('confirmRow').classList.toggle('hidden', mode !== 'register');
  $('authSubmit').textContent = mode === 'login' ? 'Login' : 'Create local account';
  $('authPass').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('authError').textContent = '';
}

async function handleAuth(event) {
  event.preventDefault();
  $('authError').textContent = '';
  const username = $('authUser').value;
  const password = $('authPass').value;
  try {
    currentUser = authMode === 'register'
      ? await registerAccount(username, password, $('authConfirm').value)
      : await loginAccount(username, password);
    spectatorMode = false;
    sessionStorage.setItem('pennyspawn_user', currentUser);
    openApp();
    toast(authMode === 'register' ? 'Local account created' : 'Welcome back');
  } catch (error) {
    $('authError').textContent = error.message || String(error);
  }
}

function loadSettings() {
  const key = currentUser ? SETTINGS_PREFIX + currentUser : PUBLIC_KEY;
  try { settings = { ...defaultSettings(), ...JSON.parse(localStorage.getItem(key) || '{}') }; }
  catch { settings = defaultSettings(); }
  if (currentUser) localStorage.setItem(PUBLIC_KEY, JSON.stringify({ wallet: settings.wallet, cycleMinutes: settings.cycleMinutes, rpc: settings.rpc }));
}

function saveSettings() {
  if (spectatorMode || !currentUser) return;
  const walletAddress = $('walletAddress').value.trim();
  const rpc = $('rpcUrl').value.trim();
  if (walletAddress && !validAddress(walletAddress)) throw new Error('Public wallet must be a valid 0x address.');
  if (!/^https:\/\//i.test(rpc)) throw new Error('RPC must use HTTPS.');
  settings = {
    wallet: walletAddress,
    cycleMinutes: Math.max(2, Math.min(60, Number($('cycleMinutes').value) || 10)),
    skills: $('skillsInput').value.trim().slice(0, 600),
    rpc
  };
  localStorage.setItem(SETTINGS_PREFIX + currentUser, JSON.stringify(settings));
  localStorage.setItem(PUBLIC_KEY, JSON.stringify({ wallet: settings.wallet, cycleMinutes: settings.cycleMinutes, rpc: settings.rpc }));
  closeSettings();
  stopWalletPolling();
  if (settings.wallet) startWalletPolling();
  startEngine();
  render();
}

function loadAgent() {
  if (!currentUser) { agent = defaultAgent(); return; }
  try { agent = { ...defaultAgent(), ...JSON.parse(localStorage.getItem(STATE_PREFIX + currentUser) || '{}') }; }
  catch { agent = defaultAgent(); }
  agent.events = Array.isArray(agent.events) ? agent.events : [];
  agent.retired = Array.isArray(agent.retired) ? agent.retired : [];
  agent.offspring = Array.isArray(agent.offspring) ? agent.offspring : [];
}

function saveAgent() {
  if (currentUser) localStorage.setItem(STATE_PREFIX + currentUser, JSON.stringify(agent));
}

function openApp() {
  loadSettings();
  loadAgent();
  $('authGate').classList.add('hidden');
  $('appShell').setAttribute('aria-hidden', 'false');
  document.body.classList.add('app-open');
  $('accountBadge').textContent = spectatorMode ? 'SPECTATOR' : currentUser.toUpperCase();
  $('settingsBtn').style.display = spectatorMode ? 'none' : '';
  populateSettings();
  resizeCanvases();
  render();
  if (settings.wallet) startWalletPolling();
  if (!spectatorMode && settings.wallet) setTimeout(startEngine, 700);
}

function openSpectator() {
  spectatorMode = true;
  currentUser = '';
  sessionStorage.setItem('pennyspawn_user', 'spectator');
  openApp();
}

function logout() {
  stopEngine();
  stopWalletPolling();
  currentUser = '';
  spectatorMode = false;
  sessionStorage.removeItem('pennyspawn_user');
  $('authPass').value = '';
  $('authConfirm').value = '';
  $('authGate').classList.remove('hidden');
  $('appShell').setAttribute('aria-hidden', 'true');
  closeSettings();
}

function populateSettings() {
  $('walletAddress').value = settings.wallet || '';
  $('cycleMinutes').value = settings.cycleMinutes;
  $('cycleMinutesLabel').textContent = `${settings.cycleMinutes} minute${settings.cycleMinutes === 1 ? '' : 's'}`;
  $('skillsInput').value = settings.skills || '';
  $('rpcUrl').value = settings.rpc || DEFAULT_RPC;
}

function openSettings() {
  if (spectatorMode) return toast('Register or login to change settings');
  populateSettings();
  $('settingsSheet').classList.add('open');
  $('settingsSheet').setAttribute('aria-hidden', 'false');
}

function closeSettings() {
  $('settingsSheet').classList.remove('open');
  $('settingsSheet').setAttribute('aria-hidden', 'true');
}

async function rpc(method, params) {
  const response = await fetch(settings.rpc || DEFAULT_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Math.floor(Math.random() * 1e9), method, params }),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(body.error.message || 'RPC error');
  return body.result;
}

async function fetchWalletBalance() {
  if (!validAddress(settings.wallet)) return;
  const padded = settings.wallet.slice(2).toLowerCase().padStart(64, '0');
  const [balanceHex, blockHex] = await Promise.all([
    rpc('eth_call', [{ to: USDC_CONTRACT, data: `0x${BALANCE_OF}${padded}` }, 'latest']),
    rpc('eth_blockNumber', [])
  ]);
  const raw = BigInt(balanceHex || '0x0');
  const balance = Number(raw) / 1_000_000;
  const block = parseInt(blockHex || '0x0', 16);
  applyConfirmedBalance(balance, block);
}

function applyConfirmedBalance(balance, block) {
  const previous = wallet.confirmed;
  const first = wallet.lastPollAt === 0;
  wallet.lastPollAt = Date.now();
  wallet.lastBlock = block;
  wallet.healthy = true;
  wallet.error = '';
  if (first) {
    wallet.confirmed = balance;
    wallet.display = balance;
    wallet.displayFrom = balance;
    wallet.displayTo = balance;
    if (agent.cycleStartBalance == null) agent.cycleStartBalance = balance;
    log(`Connected to Base. Confirmed USDC balance: ${money(balance)} at block ${block}.`);
  } else {
    const delta = balance - previous;
    wallet.confirmed = balance;
    wallet.displayFrom = wallet.display;
    wallet.displayTo = balance;
    wallet.animationStart = performance.now();
    if (delta > 0.0000001) {
      wallet.sessionReceived += delta;
      wallet.cycleReceived += delta;
      wallet.lastReceiptAt = Date.now();
      arenaFx.pulse = 1;
      burst('receipt');
      log(`Verified incoming USDC: +${money(delta)} at Base block ${block}.`);
    } else if (delta < -0.0000001) {
      log(`Wallet balance decreased by ${money(Math.abs(delta))}. This is not counted as earnings.`);
    }
  }
  wallet.history.push({ t: Date.now(), v: balance });
  wallet.history = wallet.history.slice(-180);
  render();
}

function startWalletPolling() {
  if (!validAddress(settings.wallet)) return;
  stopWalletPolling();
  fetchWalletBalance().catch(handleRpcError);
  walletPollTimer = setInterval(() => fetchWalletBalance().catch(handleRpcError), 3000);
}

function handleRpcError(error) {
  wallet.healthy = false;
  wallet.error = error.message || String(error);
  $('rpcHealth').textContent = 'error';
  $('rpcHealth').className = 'red';
  render();
}

function stopWalletPolling() {
  clearInterval(walletPollTimer);
  walletPollTimer = null;
}

function initModelWorker() {
  if (modelWorker) return;
  modelWorker = new Worker('./model-worker.js', { type: 'module' });
  modelWorker.onmessage = event => {
    const message = event.data || {};
    if (message.type === 'progress') {
      modelLoading = true;
      $('modelProgressWrap').classList.remove('hidden');
      $('modelProgressText').textContent = `Downloading ${String(message.file || 'model').split('/').pop()}`;
      $('modelProgressValue').textContent = `${message.percent || 0}%`;
      $('modelProgressBar').style.width = `${message.percent || 0}%`;
    }
    if (message.type === 'status') {
      modelDevice = message.device || modelDevice;
      if (message.status === 'ready' || message.status === 'generator-ready') {
        modelReady = true;
        modelLoading = false;
        $('modelProgressWrap').classList.add('hidden');
        $('modelName').textContent = message.model || 'SmolLM2';
        $('modelDevice').textContent = modelDevice;
        agent.status = 'alive';
        log(`Local open model ready on ${modelDevice}.`);
        if (!agent.strategy || agent.strategy.startsWith('Awaiting')) requestPlan('initialization');
      }
    }
    if (message.type === 'plan') applyPlan(message.text, message.category);
    if (message.type === 'notice') log(message.message);
    if (message.type === 'error') {
      modelLoading = false;
      modelReady = false;
      agent.status = 'model error';
      log(`Local model error: ${message.message}`);
      fallbackPlan('Model failed to load; using deterministic legal fallback.');
      render();
    }
    render();
  };
  modelWorker.onerror = error => {
    modelLoading = false;
    modelReady = false;
    log(`Model Worker failed: ${error.message || 'unknown error'}`);
    fallbackPlan('Model Worker unavailable; using deterministic legal fallback.');
    render();
  };
}

function requestPlan(reason) {
  if (!modelReady || !modelWorker) return fallbackPlan(`Local model not ready during ${reason}.`);
  agent.status = 'thinking';
  agent.modelCycles += 1;
  log(`Agent is generating the next legal strategy after ${reason}.`);
  modelWorker.postMessage({
    type: 'plan',
    payload: {
      skills: settings.skills,
      previous: agent.strategy,
      earned: wallet.cycleReceived
    }
  });
  render();
}

function applyPlan(text, category) {
  if (!text || BLOCKED.test(text)) return fallbackPlan('Generated plan failed the legal shield.');
  const strategy = text.match(/STRATEGY:\s*(.+)/i)?.[1]?.trim() || category || 'Offer a small lawful text-cleanup service.';
  const nextAction = text.match(/NEXT ACTION:\s*(.+)/i)?.[1]?.trim() || 'Review the generated service and manually publish it on a platform that permits it.';
  const why = text.match(/WHY:\s*(.+)/i)?.[1]?.trim() || 'This is a small, honest task that can be delivered without private data or deceptive claims.';
  agent.strategy = strategy.slice(0, 260);
  agent.nextAction = nextAction.slice(0, 360);
  agent.why = why.slice(0, 360);
  agent.status = engineRunning ? 'alive' : 'ready';
  log(`New strategy selected: ${agent.strategy}`);
  saveAgent();
  render();
}

function fallbackPlan(reason) {
  const plans = [
    ['JSON Repair Sprint', 'Create three before-and-after examples of broken JSON repaired into valid JSON, then manually publish the examples where developer services are allowed.', 'The output is concrete, testable, and does not require access to customer accounts.'],
    ['Prompt Compression Pack', 'Prepare five examples that turn long user-provided prompts into short structured prompts, then offer manual review before delivery.', 'The service is useful, low-risk, and can be completed locally.'],
    ['Accessibility Text Pack', 'Create a small portfolio of accurate alt-text examples for user-provided images and clearly state that humans should verify sensitive descriptions.', 'Accessibility copy has clear value and avoids deceptive performance claims.'],
    ['Honest Listing Cleanup', 'Make a template that improves spelling, structure, and clarity without inventing ratings, scarcity, certifications, or product claims.', 'It improves presentation while preserving factual honesty.']
  ];
  const pick = plans[agent.generation % plans.length];
  agent.strategy = pick[0];
  agent.nextAction = pick[1];
  agent.why = pick[2];
  agent.status = engineRunning ? 'alive' : 'ready';
  log(`${reason} Safe fallback strategy activated: ${pick[0]}.`);
  saveAgent();
}

function startEngine() {
  if (spectatorMode) return toast('Login to run the local engine');
  if (!validAddress(settings.wallet)) { openSettings(); return toast('Add a public Base wallet first'); }
  initModelWorker();
  if (!modelReady && !modelLoading) {
    modelLoading = true;
    $('modelProgressWrap').classList.remove('hidden');
    $('modelProgressText').textContent = 'Starting open-model download…';
    modelWorker.postMessage({ type: 'init' });
  }
  engineRunning = true;
  agent.status = modelReady ? 'alive' : 'loading model';
  if (!agent.cycleStart || !agent.cycleEnd || agent.cycleEnd <= Date.now()) beginCycle();
  clearInterval(cycleTimer);
  cycleTimer = setInterval(tickCycle, 500);
  $('engineBtn').textContent = 'Pause local engine';
  log(`Local survival engine started. Cycle length: ${settings.cycleMinutes} minutes.`);
  render();
}

function stopEngine() {
  engineRunning = false;
  clearInterval(cycleTimer);
  cycleTimer = null;
  if (agent.status !== 'thinking') agent.status = 'paused';
  if ($('engineBtn')) $('engineBtn').textContent = 'Start local engine';
  saveAgent();
  render();
}

function beginCycle() {
  const now = Date.now();
  agent.cycleStart = now;
  agent.cycleEnd = now + settings.cycleMinutes * 60_000;
  agent.cycleStartBalance = wallet.confirmed;
  wallet.cycleReceived = 0;
  log(`Generation ${agent.generation} began a ${settings.cycleMinutes}-minute cycle at ${money(wallet.confirmed)} confirmed USDC.`);
  saveAgent();
}

function tickCycle() {
  if (!engineRunning) return;
  if (Date.now() >= agent.cycleEnd) evaluateCycle();
  render();
}

function evaluateCycle() {
  if (!engineRunning) return;
  const received = wallet.cycleReceived;
  const old = { id: agent.id, generation: agent.generation, strategy: agent.strategy, earned: received, fitness: agent.fitness };
  if (received > 0.0000001) {
    old.status = 'survived';
    agent.offspring.push({ ...old, id: `offspring-${String(agent.offspring.length + 1).padStart(2, '0')}`, status: 'offspring', parentId: old.id });
    log(`${old.id} survived with ${money(received)} verified incoming USDC. A child strategy was created.`);
    burst('offspring');
  } else {
    old.status = 'retired';
    agent.retired.push(old);
    log(`${old.id} received no verified USDC during the cycle. Strategy retired; replacement requested.`);
    fireBeam();
  }
  agent.generation += 1;
  agent.id = `penny-agent-${String(agent.generation).padStart(2, '0')}`;
  agent.fitness = Math.round(agent.fitness * 2.5 * 10000) / 10000;
  agent.status = 'thinking';
  agent.retired = agent.retired.slice(-12);
  agent.offspring = agent.offspring.slice(-12);
  beginCycle();
  requestPlan(received > 0 ? 'verified earnings' : 'zero-earning retirement');
  saveAgent();
}

function render() {
  const remaining = agent.cycleEnd ? Math.max(0, (agent.cycleEnd - Date.now()) / 1000) : 0;
  const total = Math.max(1, settings.cycleMinutes * 60);
  const progress = agent.cycleStart ? Math.max(0, Math.min(100, ((total - remaining) / total) * 100)) : 0;
  $('topState').textContent = wallet.healthy ? (engineRunning ? 'RUNNING' : 'WALLET LIVE') : 'OFFLINE';
  $('statusDot').className = `dot ${wallet.healthy ? 'online' : wallet.error ? 'error' : ''}`;
  $('connectionText').textContent = wallet.healthy ? `BASE BLOCK ${wallet.lastBlock || '—'}` : wallet.error ? 'RPC ERROR' : 'NO WALLET';
  $('countdown').textContent = agent.cycleEnd ? clock(remaining) : '--:--';
  $('watcherText').textContent = engineRunning ? `watching ${agent.id}` : 'engine paused';
  $('walletBlock').textContent = wallet.lastBlock ? `Base block ${wallet.lastBlock}` : settings.wallet ? 'connecting…' : 'not configured';
  $('sessionEarned').textContent = `+${money(wallet.sessionReceived)}`;
  $('cycleEarned').textContent = `+${money(wallet.cycleReceived)}`;
  $('cycleGoal').textContent = 'survival: any verified receipt';
  const sessionHours = Math.max(1 / 3600, (Date.now() - (wallet.history[0]?.t || Date.now())) / 3_600_000);
  $('paceActual').textContent = `${money(wallet.sessionReceived / sessionHours)}/h`;
  $('paceNote').textContent = wallet.sessionReceived > 0 ? 'confirmed incoming pace' : 'no confirmed receipts';
  $('generationMetric').textContent = `GEN-${String(agent.generation).padStart(2, '0')}`;
  $('fitnessMetric').textContent = `fitness ${Number(agent.fitness).toFixed(agent.fitness < 10 ? 3 : 2).replace(/0+$/, '').replace(/\.$/, '')}`;
  $('agentName').textContent = agent.id;
  $('agentStatus').textContent = agent.status;
  $('agentStatus').className = agent.status === 'alive' ? 'mint' : agent.status.includes('error') ? 'red' : 'amber';
  $('modelName').textContent = modelReady ? 'SmolLM2 + MiniLM' : modelLoading ? 'downloading…' : 'not installed';
  $('modelDevice').textContent = modelDevice;
  $('cycleLength').textContent = `${settings.cycleMinutes} minutes`;
  $('cycleProgress').style.width = `${progress}%`;
  $('engineBtn').textContent = engineRunning ? 'Pause local engine' : 'Start local engine';
  $('strategyName').textContent = agent.strategy.split(/[.!?]/)[0].slice(0, 70) || 'awaiting plan';
  $('thoughtBubble').textContent = `“${agent.why}”`;
  $('nextAction').textContent = agent.nextAction;
  $('lastReceipt').textContent = wallet.lastReceiptAt ? new Date(wallet.lastReceiptAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'none';
  $('cycleStartBalance').textContent = agent.cycleStartBalance == null ? '—' : money(agent.cycleStartBalance);
  $('rpcHealth').textContent = wallet.healthy ? 'healthy' : wallet.error ? 'error' : 'offline';
  $('rpcHealth').className = wallet.healthy ? 'mint' : wallet.error ? 'red' : '';
  $('modelCycles').textContent = String(agent.modelCycles || 0);
  $('retiredCount').textContent = String(agent.retired.length);
  $('offspringCount').textContent = String(agent.offspring.length);
  $('chartEmpty').style.display = wallet.history.length > 1 ? 'none' : 'grid';
  renderTree();
  renderLog();
}

function renderTree() {
  const nodes = [...agent.retired.slice(-3), { id: agent.id, generation: agent.generation, status: 'active', strategy: agent.strategy }, ...agent.offspring.slice(-3)];
  $('tree').innerHTML = nodes.map((node, index) => `${index ? '<span class="arrow">→</span>' : ''}<article class="node ${node.status === 'active' ? 'active' : node.status === 'retired' ? 'dead' : ''}"><b>${escapeHtml(node.id)}</b><small>GEN ${node.generation} · ${escapeHtml(node.status)}</small></article>`).join('') || '<article class="node"><b>No lineage yet</b><small>Start the engine</small></article>';
}

function renderLog() {
  $('log').innerHTML = agent.events.map(event => `<div class="event"><time>${new Date(event.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><p>${escapeHtml(event.m)}</p></div>`).join('');
}

function animateBalance(now) {
  const duration = 850;
  const p = Math.min(1, (now - wallet.animationStart) / duration);
  const eased = 1 - Math.pow(1 - p, 3);
  wallet.display = wallet.displayFrom + (wallet.displayTo - wallet.displayFrom) * eased;
  $('walletBalance').textContent = money(wallet.display);
}

const arena = $('arena');
const arenaCtx = arena.getContext('2d');
const chart = $('earningsChart');
const chartCtx = chart.getContext('2d');

function resizeCanvases() {
  for (const [canvas, ctx, assign] of [[arena, arenaCtx, v => dpr = v], [chart, chartCtx, v => chartDpr = v]]) {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    assign(ratio);
  }
}

function burst(kind) {
  const rect = arena.getBoundingClientRect();
  const x = rect.width * 0.5, y = rect.height * 0.56;
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2, s = 0.8 + Math.random() * 3.5;
    arenaFx.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, kind });
  }
}

function fireBeam() {
  arenaFx.beam = 1;
  arenaFx.flash = 1;
  burst('dead');
}

function drawArena(now) {
  const rect = arena.getBoundingClientRect();
  const w = rect.width, h = rect.height, t = now / 1000;
  arenaCtx.clearRect(0, 0, w, h);
  const bg = arenaCtx.createRadialGradient(w * .5, h * .55, 8, w * .5, h * .55, Math.max(w, h) * .7);
  bg.addColorStop(0, 'rgba(115,255,176,.12)'); bg.addColorStop(.5, 'rgba(92,130,255,.035)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
  arenaCtx.fillStyle = bg; arenaCtx.fillRect(0, 0, w, h);
  arenaCtx.strokeStyle = 'rgba(115,255,176,.08)'; arenaCtx.lineWidth = 1;
  for (let i = 1; i < 7; i++) { arenaCtx.beginPath(); arenaCtx.arc(w * .5, h * .57, i * 31 + Math.sin(t + i) * 2, 0, Math.PI * 2); arenaCtx.stroke(); }
  const watcher = { x: w * .82, y: h * .22 };
  arenaCtx.fillStyle = 'rgba(102,220,255,.14)'; arenaCtx.beginPath(); arenaCtx.arc(watcher.x, watcher.y, 26 + Math.sin(t * 2) * 2, 0, Math.PI * 2); arenaCtx.fill();
  arenaCtx.strokeStyle = 'rgba(102,220,255,.55)'; arenaCtx.beginPath(); arenaCtx.arc(watcher.x, watcher.y, 11, 0, Math.PI * 2); arenaCtx.stroke(); arenaCtx.beginPath(); arenaCtx.arc(watcher.x, watcher.y, 3, 0, Math.PI * 2); arenaCtx.fillStyle = '#66dcff'; arenaCtx.fill();
  const x = w * .5, y = h * .57, alive = agent.status !== 'retired';
  const radius = 48 + Math.sin(t * 2.2) * 3 + arenaFx.pulse * 10;
  const orb = arenaCtx.createRadialGradient(x - 13, y - 15, 4, x, y, radius * 1.25);
  orb.addColorStop(0, 'rgba(255,255,255,.9)'); orb.addColorStop(.18, alive ? 'rgba(115,255,176,.88)' : 'rgba(255,114,142,.8)'); orb.addColorStop(1, 'rgba(5,15,10,.05)');
  arenaCtx.fillStyle = orb; arenaCtx.beginPath(); arenaCtx.arc(x, y, radius, 0, Math.PI * 2); arenaCtx.fill();
  arenaCtx.strokeStyle = alive ? 'rgba(115,255,176,.65)' : 'rgba(255,114,142,.65)'; arenaCtx.lineWidth = 2; arenaCtx.beginPath(); arenaCtx.arc(x, y, radius + 9, t, t + Math.PI * 1.5); arenaCtx.stroke();
  if (arenaFx.beam > 0) {
    arenaCtx.save(); arenaCtx.globalAlpha = arenaFx.beam; arenaCtx.strokeStyle = '#ff728e'; arenaCtx.lineWidth = 7 + arenaFx.beam * 10; arenaCtx.shadowBlur = 30; arenaCtx.shadowColor = '#ff315f'; arenaCtx.beginPath(); arenaCtx.moveTo(watcher.x, watcher.y); arenaCtx.lineTo(x, y); arenaCtx.stroke(); arenaCtx.restore(); arenaFx.beam = Math.max(0, arenaFx.beam - .025);
  }
  arenaFx.particles = arenaFx.particles.filter(p => p.life > 0);
  for (const p of arenaFx.particles) { p.x += p.vx; p.y += p.vy; p.vy += .025; p.life -= .018; arenaCtx.globalAlpha = Math.max(0, p.life); arenaCtx.fillStyle = p.kind === 'dead' ? '#ff728e' : p.kind === 'offspring' ? '#b49dff' : '#74ffb0'; arenaCtx.beginPath(); arenaCtx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); arenaCtx.fill(); }
  arenaCtx.globalAlpha = 1;
  arenaFx.flash = Math.max(0, arenaFx.flash - .04); arenaFx.pulse = Math.max(0, arenaFx.pulse - .025);
  if (arenaFx.flash > 0) { arenaCtx.fillStyle = `rgba(255,114,142,${arenaFx.flash * .22})`; arenaCtx.fillRect(0, 0, w, h); }
  arenaCtx.fillStyle = 'rgba(245,255,249,.9)'; arenaCtx.font = '700 12px -apple-system, sans-serif'; arenaCtx.textAlign = 'center'; arenaCtx.fillText(agent.id.toUpperCase(), x, y + radius + 35);
}

function drawChart() {
  const rect = chart.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  chartCtx.clearRect(0, 0, w, h);
  const values = wallet.history;
  if (values.length < 2) return;
  const min = Math.min(...values.map(x => x.v));
  const max = Math.max(...values.map(x => x.v));
  const range = Math.max(0.000001, max - min);
  chartCtx.strokeStyle = 'rgba(255,255,255,.055)'; chartCtx.lineWidth = 1;
  for (let i = 1; i < 5; i++) { chartCtx.beginPath(); chartCtx.moveTo(0, h * i / 5); chartCtx.lineTo(w, h * i / 5); chartCtx.stroke(); }
  const gradient = chartCtx.createLinearGradient(0, 0, w, 0); gradient.addColorStop(0, '#74ffb0'); gradient.addColorStop(.55, '#66dcff'); gradient.addColorStop(1, '#b49dff');
  chartCtx.strokeStyle = gradient; chartCtx.lineWidth = 3; chartCtx.beginPath();
  values.forEach((point, i) => { const x = i / (values.length - 1) * w; const y = h - 24 - ((point.v - min) / range) * (h - 48); if (i === 0) chartCtx.moveTo(x, y); else chartCtx.lineTo(x, y); });
  chartCtx.stroke();
}

function frame(now) {
  animateBalance(now);
  drawArena(now);
  drawChart();
  requestAnimationFrame(frame);
}

function setupEvents() {
  $('loginTab').onclick = () => switchAuth('login');
  $('registerTab').onclick = () => switchAuth('register');
  $('authForm').onsubmit = handleAuth;
  $('spectatorBtn').onclick = openSpectator;
  $('settingsBtn').onclick = openSettings;
  $('closeSettingsBtn').onclick = closeSettings;
  $('sheetBackdrop').onclick = closeSettings;
  $('cycleMinutes').oninput = () => $('cycleMinutesLabel').textContent = `${$('cycleMinutes').value} minutes`;
  $('saveSettingsBtn').onclick = () => { try { saveSettings(); toast('Settings saved'); } catch (error) { toast(error.message); } };
  $('logoutBtn').onclick = logout;
  $('engineBtn').onclick = () => engineRunning ? stopEngine() : startEngine();
  $('installBtn').onclick = async () => {
    if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; }
    else toast('On iPhone: Share → Add to Home Screen');
  };
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
  window.addEventListener('resize', resizeCanvases);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      resizeCanvases();
      if (settings.wallet) fetchWalletBalance().catch(handleRpcError);
      if (engineRunning && agent.cycleEnd && Date.now() >= agent.cycleEnd) evaluateCycle();
    }
  });
}

async function boot() {
  setupEvents();
  switchAuth('login');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  const saved = sessionStorage.getItem('pennyspawn_user');
  if (saved === 'spectator') openSpectator();
  else if (saved && getAccounts()[saved]) { currentUser = saved; spectatorMode = false; openApp(); }
  resizeCanvases();
  requestAnimationFrame(frame);
  setInterval(render, 1000);
}

boot();
