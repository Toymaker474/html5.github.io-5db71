const $ = id => document.getElementById(id);

const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BALANCE_OF = '70a08231';
const DEFAULT_RPC = 'https://mainnet.base.org';
const ACCOUNT_KEY = 'pennyspawn_accounts_v5';
const OWNER_MIGRATION_KEY = 'pennyspawn_owner_seed_v5';
const SETTINGS_PREFIX = 'pennyspawn_settings_v5:';
const STATE_PREFIX = 'pennyspawn_agent_v5:';
const PUBLIC_KEY = 'pennyspawn_public_v5';
const OWNER_USER = 'tyleroy69';
const OWNER_SALT = '2dddc302958b55293db471a1fa3327ed';
const OWNER_HASH = '17db39b75359fb1e62a155748b76be81e6ec561b68a8e56fe6c9f74f436a7e22';
const BLOCKED = /(phish|credential theft|steal(?:ing)? password|malware|ransomware|keylogger|fake review|impersonat(?:e|ion)|counterfeit|stolen goods|money mule|bypass kyc|evade law enforcement|seed phrase|private key|guaranteed profit|spam campaign|unauthorized access)/i;

let authMode = 'login';
let currentUser = '';
let spectatorMode = false;
let balanceHidden = false;
let settings = defaultSettings();
let agent = defaultAgent();
let modelWorker = null;
let modelReady = false;
let modelLoading = false;
let modelDevice = '—';
let loadedModelChoice = '';
let engineRunning = false;
let walletTimer = null;
let marketTimer = null;
let cycleTimer = null;
let installPrompt = null;
let dpr = 1;
let arenaFx = { beam: 0, flash: 0, pulse: 0, particles: [] };

const market = {
  prices: { USD: 1, BTC: 0, ETH: 0, SOL: 0 },
  healthy: false,
  updatedAt: 0,
  error: ''
};

const wallet = {
  usdc: 0,
  btc: 0,
  displayUsdc: 0,
  displayBtc: 0,
  fromUsdc: 0,
  toUsdc: 0,
  fromBtc: 0,
  toBtc: 0,
  animationStart: performance.now(),
  usdcSeen: false,
  btcSeen: false,
  baseHealthy: false,
  btcHealthy: false,
  baseBlock: null,
  lastReceiptAt: 0,
  sessionReceivedUsd: 0,
  cycleReceivedUsd: 0,
  cycleReceiptCount: 0,
  receiptCount: 0,
  history: [],
  errors: []
};

function defaultSettings() {
  return {
    baseWallet: '',
    btcWallet: '',
    cycleMinutes: 10,
    skills: '',
    rpc: DEFAULT_RPC,
    model: 'lite',
    autoRun: true
  };
}

function defaultAgent() {
  return {
    id: 'penny-agent-01',
    generation: 1,
    fitness: 0.25,
    status: 'waiting',
    strategy: 'Awaiting watch-only wallet setup.',
    nextAction: 'Open Settings and add a public Base or Bitcoin address. Never enter a seed phrase.',
    why: 'The app needs verified public blockchain telemetry before starting a survival cycle.',
    cycleStart: 0,
    cycleEnd: 0,
    modelCycles: 0,
    retired: [],
    offspring: [],
    events: [{ t: Date.now(), m: 'PennySpawn Neo initialized. Revenue simulation is disabled.' }]
  };
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => $('toast').classList.remove('show'), 1900);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function log(message) {
  agent.events.unshift({ t: Date.now(), m: String(message) });
  agent.events = agent.events.slice(0, 100);
  saveAgent();
}

function money(value, digits = 2) {
  const n = Number(value || 0);
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function compactMoney(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_000_000) return money(n / 1_000_000, 2) + 'M';
  if (Math.abs(n) >= 1_000) return money(n / 1_000, 2) + 'K';
  return money(n, 2);
}

function clock(seconds) {
  seconds = Math.max(0, Math.floor(seconds || 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function validBaseAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
}

function validBtcAddress(value) {
  const address = String(value || '').trim();
  return /^(bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(address);
}

function shorten(value, start = 6, end = 4) {
  const text = String(value || '');
  return text.length > start + end + 3 ? `${text.slice(0, start)}…${text.slice(-end)}` : text;
}

function getAccounts() {
  try { return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || '{}'); }
  catch { return {}; }
}

function ensureOwnerAccount() {
  const accounts = getAccounts();
  if (localStorage.getItem(OWNER_MIGRATION_KEY) !== '1' || !accounts[OWNER_USER]) {
    accounts[OWNER_USER] = {
      salt: OWNER_SALT,
      hash: OWNER_HASH,
      createdAt: Date.now(),
      owner: true,
      version: 5
    };
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accounts));
    localStorage.setItem(OWNER_MIGRATION_KEY, '1');
  }
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
  if (accounts[username]) throw new Error('That profile already exists on this device.');
  const salt = randomHex(16);
  accounts[username] = { salt, hash: await passwordHash(password, salt), createdAt: Date.now() };
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accounts));
  return username;
}

async function loginAccount(username, password) {
  username = username.trim().toLowerCase();
  const account = getAccounts()[username];
  if (!account) throw new Error('Profile not found. Use New profile or the owner username.');
  const hash = await passwordHash(password, account.salt);
  if (hash !== account.hash) throw new Error('Password not accepted. Check capitalization and try again.');
  return username;
}

function switchAuth(mode) {
  authMode = mode;
  const isLogin = mode === 'login';
  $('loginTab').classList.toggle('active', isLogin);
  $('registerTab').classList.toggle('active', !isLogin);
  $('loginTab').setAttribute('aria-selected', String(isLogin));
  $('registerTab').setAttribute('aria-selected', String(!isLogin));
  $('confirmRow').classList.toggle('hidden', isLogin);
  $('authConfirm').required = !isLogin;
  $('authSubmit').querySelector('span').textContent = isLogin ? 'Enter owner dashboard' : 'Create local profile';
  $('authPass').autocomplete = isLogin ? 'current-password' : 'new-password';
  $('authError').textContent = '';
}

async function handleAuth(event) {
  event.preventDefault();
  $('authError').textContent = '';
  $('authSubmit').disabled = true;
  try {
    currentUser = authMode === 'register'
      ? await registerAccount($('authUser').value, $('authPass').value, $('authConfirm').value)
      : await loginAccount($('authUser').value, $('authPass').value);
    spectatorMode = false;
    sessionStorage.setItem('pennyspawn_user_v5', currentUser);
    openApp();
    toast(authMode === 'register' ? 'Profile created' : 'Owner dashboard unlocked');
  } catch (error) {
    $('authError').textContent = error.message || String(error);
  } finally {
    $('authSubmit').disabled = false;
  }
}

function settingsKey() {
  return currentUser ? SETTINGS_PREFIX + currentUser : PUBLIC_KEY;
}

function loadSettings() {
  try { settings = { ...defaultSettings(), ...JSON.parse(localStorage.getItem(settingsKey()) || '{}') }; }
  catch { settings = defaultSettings(); }
}

function savePublicSettings() {
  localStorage.setItem(PUBLIC_KEY, JSON.stringify({
    baseWallet: settings.baseWallet,
    btcWallet: settings.btcWallet,
    cycleMinutes: settings.cycleMinutes,
    rpc: settings.rpc
  }));
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

function populateSettings() {
  $('walletAddress').value = settings.baseWallet || '';
  $('btcAddress').value = settings.btcWallet || '';
  $('cycleMinutes').value = settings.cycleMinutes;
  $('cycleMinutesLabel').textContent = `${settings.cycleMinutes} MIN`;
  $('skillsInput').value = settings.skills || '';
  $('rpcUrl').value = settings.rpc || DEFAULT_RPC;
  const modelRadio = document.querySelector(`input[name="modelChoice"][value="${settings.model}"]`);
  if (modelRadio) modelRadio.checked = true;
}

function openApp() {
  loadSettings();
  loadAgent();
  $('authGate').classList.add('hidden');
  $('appShell').setAttribute('aria-hidden', 'false');
  $('bottomDock').classList.remove('hidden');
  document.body.classList.remove('auth-open');
  $('headerSub').textContent = spectatorMode ? 'READ ONLY · WATCH MODE' : `${currentUser.toUpperCase()} · OWNER MODE`;
  $('settingsBtn').style.display = spectatorMode ? 'none' : '';
  populateSettings();
  resizeArena();
  render();
  startMarketPolling();
  startWalletPolling();
  if (!spectatorMode && hasConfiguredWallet() && settings.autoRun) setTimeout(startEngine, 500);
  if (!spectatorMode && !hasConfiguredWallet()) setTimeout(openSettings, 500);
}

function openSpectator() {
  spectatorMode = true;
  currentUser = '';
  sessionStorage.setItem('pennyspawn_user_v5', 'spectator');
  openApp();
}

function logout() {
  stopEngine();
  stopWalletPolling();
  stopMarketPolling();
  stopModelWorker();
  currentUser = '';
  spectatorMode = false;
  sessionStorage.removeItem('pennyspawn_user_v5');
  $('authPass').value = '';
  $('authConfirm').value = '';
  $('appShell').setAttribute('aria-hidden', 'true');
  $('bottomDock').classList.add('hidden');
  $('authGate').classList.remove('hidden');
  document.body.classList.add('auth-open');
  closeSettings();
}

function openSettings() {
  if (spectatorMode) return toast('Read-only mode cannot change settings');
  populateSettings();
  $('settingsSheet').classList.add('open');
  $('settingsSheet').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeSettings() {
  $('settingsSheet').classList.remove('open');
  $('settingsSheet').setAttribute('aria-hidden', 'true');
  if (!document.body.classList.contains('auth-open')) document.body.style.overflow = '';
}

function saveSettings() {
  if (spectatorMode || !currentUser) return;
  const baseWallet = $('walletAddress').value.trim();
  const btcWallet = $('btcAddress').value.trim();
  const rpcUrl = $('rpcUrl').value.trim();
  if (baseWallet && !validBaseAddress(baseWallet)) throw new Error('Base address must be a valid public 0x address.');
  if (btcWallet && !validBtcAddress(btcWallet)) throw new Error('Bitcoin address format is not recognized.');
  if (!/^https:\/\//i.test(rpcUrl)) throw new Error('Base RPC must use HTTPS.');
  const selectedModel = document.querySelector('input[name="modelChoice"]:checked')?.value || 'lite';
  const modelChanged = selectedModel !== settings.model;
  settings = {
    ...settings,
    baseWallet,
    btcWallet,
    cycleMinutes: Math.max(2, Math.min(60, Number($('cycleMinutes').value) || 10)),
    skills: $('skillsInput').value.trim().slice(0, 600),
    rpc: rpcUrl,
    model: selectedModel,
    autoRun: true
  };
  localStorage.setItem(SETTINGS_PREFIX + currentUser, JSON.stringify(settings));
  savePublicSettings();
  closeSettings();
  if (modelChanged) stopModelWorker();
  stopWalletPolling();
  startWalletPolling();
  startEngine();
  render();
  toast('Saved. Agent launching automatically');
}

function hasConfiguredWallet() {
  return validBaseAddress(settings.baseWallet) || validBtcAddress(settings.btcWallet);
}

async function baseRpc(method, params) {
  const response = await fetch(settings.rpc || DEFAULT_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Math.floor(Math.random() * 1e9), method, params }),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Base RPC HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(body.error.message || 'Base RPC error');
  return body.result;
}

async function fetchBaseBalance() {
  if (!validBaseAddress(settings.baseWallet)) {
    wallet.baseHealthy = false;
    return;
  }
  const padded = settings.baseWallet.slice(2).toLowerCase().padStart(64, '0');
  const [balanceHex, blockHex] = await Promise.all([
    baseRpc('eth_call', [{ to: USDC_CONTRACT, data: `0x${BALANCE_OF}${padded}` }, 'latest']),
    baseRpc('eth_blockNumber', [])
  ]);
  const balance = Number(BigInt(balanceHex || '0x0')) / 1_000_000;
  wallet.baseBlock = parseInt(blockHex || '0x0', 16);
  wallet.baseHealthy = true;
  applyAssetBalance('USDC', balance);
}

async function fetchBtcBalance() {
  if (!validBtcAddress(settings.btcWallet)) {
    wallet.btcHealthy = false;
    return;
  }
  const response = await fetch(`https://mempool.space/api/address/${encodeURIComponent(settings.btcWallet)}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Bitcoin API HTTP ${response.status}`);
  const data = await response.json();
  const confirmedSats = Number(data?.chain_stats?.funded_txo_sum || 0) - Number(data?.chain_stats?.spent_txo_sum || 0);
  wallet.btcHealthy = true;
  applyAssetBalance('BTC', confirmedSats / 100_000_000);
}

function applyAssetBalance(asset, balance) {
  const seenKey = asset === 'USDC' ? 'usdcSeen' : 'btcSeen';
  const valueKey = asset === 'USDC' ? 'usdc' : 'btc';
  const displayKey = asset === 'USDC' ? 'displayUsdc' : 'displayBtc';
  const fromKey = asset === 'USDC' ? 'fromUsdc' : 'fromBtc';
  const toKey = asset === 'USDC' ? 'toUsdc' : 'toBtc';
  const previous = wallet[valueKey];
  if (!wallet[seenKey]) {
    wallet[seenKey] = true;
    wallet[valueKey] = balance;
    wallet[displayKey] = balance;
    wallet[fromKey] = balance;
    wallet[toKey] = balance;
    log(`${asset} watch connected at ${asset === 'USDC' ? money(balance, 6) : balance.toFixed(8) + ' BTC'}.`);
  } else {
    const delta = balance - previous;
    wallet[valueKey] = balance;
    wallet[fromKey] = wallet[displayKey];
    wallet[toKey] = balance;
    wallet.animationStart = performance.now();
    if (delta > (asset === 'USDC' ? 0.0000001 : 0.000000001)) recordReceipt(asset, delta);
    else if (delta < -(asset === 'USDC' ? 0.0000001 : 0.000000001)) log(`${asset} balance decreased. The decrease is not counted as earnings.`);
  }
  pushHistory();
}

function recordReceipt(asset, amount) {
  const usd = asset === 'USDC' ? amount : amount * (market.prices.BTC || 0);
  wallet.sessionReceivedUsd += usd;
  wallet.cycleReceivedUsd += usd;
  wallet.cycleReceiptCount += 1;
  wallet.receiptCount += 1;
  wallet.lastReceiptAt = Date.now();
  arenaFx.pulse = 1;
  burst('receipt');
  log(`Verified incoming ${asset}: ${asset === 'USDC' ? money(amount, 6) : amount.toFixed(8) + ' BTC'}${usd ? ` (${money(usd, 2)})` : ''}.`);
}

function portfolioUsd() {
  return wallet.usdc + wallet.btc * (market.prices.BTC || 0);
}

function pushHistory() {
  wallet.history.push({ t: Date.now(), v: portfolioUsd() });
  wallet.history = wallet.history.slice(-160);
}

function handleWalletError(source, error) {
  const message = error?.message || String(error);
  wallet.errors = [...wallet.errors.filter(x => x.source !== source), { source, message, t: Date.now() }].slice(-4);
  if (source === 'base') wallet.baseHealthy = false;
  if (source === 'btc') wallet.btcHealthy = false;
  render();
}

async function pollWallets() {
  const jobs = [];
  if (validBaseAddress(settings.baseWallet)) jobs.push(fetchBaseBalance().catch(error => handleWalletError('base', error)));
  if (validBtcAddress(settings.btcWallet)) jobs.push(fetchBtcBalance().catch(error => handleWalletError('btc', error)));
  await Promise.all(jobs);
  render();
}

function startWalletPolling() {
  stopWalletPolling();
  if (!hasConfiguredWallet()) return render();
  pollWallets();
  walletTimer = setInterval(pollWallets, 10_000);
}

function stopWalletPolling() {
  clearInterval(walletTimer);
  walletTimer = null;
}

async function fetchSpot(asset) {
  const response = await fetch(`https://api.coinbase.com/v2/prices/${asset}-USD/spot`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${asset} price HTTP ${response.status}`);
  const body = await response.json();
  const price = Number(body?.data?.amount);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`${asset} price invalid`);
  return price;
}

async function fetchMarket() {
  try {
    const [btc, eth, sol] = await Promise.all(['BTC', 'ETH', 'SOL'].map(fetchSpot));
    market.prices = { USD: 1, BTC: btc, ETH: eth, SOL: sol };
    market.healthy = true;
    market.updatedAt = Date.now();
    market.error = '';
  } catch (error) {
    market.healthy = false;
    market.error = error?.message || String(error);
    try {
      const response = await fetch('https://mempool.space/api/v1/prices', { cache: 'no-store' });
      const data = await response.json();
      if (Number(data?.USD) > 0) market.prices.BTC = Number(data.USD);
    } catch {}
  }
  renderMarket();
  render();
}

function startMarketPolling() {
  stopMarketPolling();
  fetchMarket();
  marketTimer = setInterval(fetchMarket, 30_000);
}

function stopMarketPolling() {
  clearInterval(marketTimer);
  marketTimer = null;
}

function stopModelWorker() {
  if (modelWorker) modelWorker.terminate();
  modelWorker = null;
  modelReady = false;
  modelLoading = false;
  modelDevice = '—';
  loadedModelChoice = '';
}

function initModelWorker() {
  if (modelWorker && loadedModelChoice === settings.model) return;
  stopModelWorker();
  loadedModelChoice = settings.model;
  modelWorker = new Worker('./model-worker.js?v=5', { type: 'module' });
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
        agent.status = 'alive';
        log(`Local model ready: ${message.model || settings.model} on ${modelDevice}.`);
        if (!agent.strategy || agent.strategy.startsWith('Awaiting')) requestPlan('initialization');
      }
    }
    if (message.type === 'plan') applyPlan(message.text, message.category);
    if (message.type === 'notice') log(message.message);
    if (message.type === 'error') {
      modelLoading = false;
      modelReady = false;
      agent.status = 'model fallback';
      log(`Local model error: ${message.message}`);
      fallbackPlan('Model unavailable; safe deterministic planner activated.');
    }
    render();
  };
  modelWorker.onerror = error => {
    modelLoading = false;
    modelReady = false;
    log(`Model Worker failed: ${error.message || 'unknown error'}`);
    fallbackPlan('Model Worker unavailable; safe deterministic planner activated.');
    render();
  };
}

function requestPlan(reason) {
  if (!modelReady || !modelWorker) return fallbackPlan(`Local model not ready during ${reason}.`);
  agent.status = 'thinking';
  agent.modelCycles += 1;
  log(`Agent is generating a lawful strategy after ${reason}.`);
  modelWorker.postMessage({
    type: 'plan',
    payload: {
      model: settings.model,
      skills: settings.skills,
      previous: agent.strategy,
      earned: wallet.cycleReceivedUsd
    }
  });
  render();
}

function applyPlan(text, category) {
  if (!text || BLOCKED.test(text)) return fallbackPlan('Generated plan failed the legal shield.');
  const strategy = text.match(/STRATEGY:\s*(.+)/i)?.[1]?.trim() || category || 'Offer a lawful text-cleanup service.';
  const nextAction = text.match(/NEXT ACTION:\s*(.+)/i)?.[1]?.trim() || 'Review the service and manually publish it where the platform permits it.';
  const why = text.match(/WHY:\s*(.+)/i)?.[1]?.trim() || 'The task is useful, reviewable, and does not require access to private customer accounts.';
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
    ['JSON Repair Sprint', 'Create three before-and-after examples of broken JSON repaired into valid JSON, then manually post the service where developer work is allowed.', 'Concrete, testable work that needs no customer credentials.'],
    ['Prompt Compression Pack', 'Build five examples that turn long user-provided prompts into short structured prompts and offer human review before delivery.', 'Small, clear deliverables can be completed entirely on-device.'],
    ['Accessibility Copy Pack', 'Create accurate alt-text examples for user-provided images and clearly require human verification for sensitive details.', 'Accessibility text has clear utility without deceptive claims.'],
    ['Honest Listing Cleanup', 'Prepare a template that improves spelling and structure without inventing ratings, scarcity, certifications, or product claims.', 'It improves presentation while preserving factual honesty.'],
    ['Game Name Forge', 'Create an original naming package for indie games with trademark-check reminders and short positioning notes.', 'The work matches creative and HTML5 interests while remaining reviewable.']
  ];
  const pick = plans[agent.generation % plans.length];
  agent.strategy = pick[0];
  agent.nextAction = pick[1];
  agent.why = pick[2];
  agent.status = engineRunning ? 'alive' : 'ready';
  log(`${reason} ${pick[0]} activated.`);
  saveAgent();
}

function startEngine() {
  if (spectatorMode || !currentUser) return;
  if (!hasConfiguredWallet()) return openSettings();
  initModelWorker();
  if (!modelReady && !modelLoading) {
    modelLoading = true;
    $('modelProgressWrap').classList.remove('hidden');
    $('modelProgressText').textContent = settings.model === 'deep' ? 'Preparing Qwen2.5 download…' : 'Preparing SmolLM2 download…';
    modelWorker.postMessage({ type: 'init', payload: { model: settings.model } });
  }
  engineRunning = true;
  agent.status = modelReady ? 'alive' : 'loading model';
  if (!agent.cycleStart || !agent.cycleEnd || agent.cycleEnd <= Date.now()) beginCycle();
  clearInterval(cycleTimer);
  cycleTimer = setInterval(tickCycle, 500);
  log(`Automatic local engine started. Cycle length: ${settings.cycleMinutes} minutes.`);
  render();
}

function stopEngine() {
  engineRunning = false;
  clearInterval(cycleTimer);
  cycleTimer = null;
  if (agent.status !== 'thinking') agent.status = 'paused';
  saveAgent();
  render();
}

function beginCycle() {
  const now = Date.now();
  agent.cycleStart = now;
  agent.cycleEnd = now + settings.cycleMinutes * 60_000;
  wallet.cycleReceivedUsd = 0;
  wallet.cycleReceiptCount = 0;
  log(`Generation ${agent.generation} began a ${settings.cycleMinutes}-minute verified-receipt cycle.`);
  saveAgent();
}

function tickCycle() {
  if (!engineRunning) return;
  if (Date.now() >= agent.cycleEnd) evaluateCycle();
  render();
}

function evaluateCycle() {
  if (!engineRunning) return;
  const survived = wallet.cycleReceiptCount > 0;
  const old = {
    id: agent.id,
    generation: agent.generation,
    strategy: agent.strategy,
    earnedUsd: wallet.cycleReceivedUsd,
    receipts: wallet.cycleReceiptCount,
    fitness: agent.fitness,
    status: survived ? 'survived' : 'retired'
  };
  if (survived) {
    agent.offspring.push({ ...old, id: `offspring-${String(agent.offspring.length + 1).padStart(2, '0')}`, status: 'offspring', parentId: old.id });
    log(`${old.id} survived with ${old.receipts} verified receipt${old.receipts === 1 ? '' : 's'}. A child strategy was created.`);
    burst('offspring');
  } else {
    agent.retired.push(old);
    log(`${old.id} received no verified funds during the cycle. Strategy retired and replaced.`);
    fireBeam();
  }
  agent.generation += 1;
  agent.id = `penny-agent-${String(agent.generation).padStart(2, '0')}`;
  agent.fitness = Math.round(agent.fitness * 2.5 * 10000) / 10000;
  agent.status = 'thinking';
  agent.retired = agent.retired.slice(-16);
  agent.offspring = agent.offspring.slice(-16);
  beginCycle();
  requestPlan(survived ? 'verified receipt survival' : 'zero-receipt retirement');
  saveAgent();
}

function render() {
  const remaining = agent.cycleEnd ? Math.max(0, (agent.cycleEnd - Date.now()) / 1000) : 0;
  const totalSeconds = Math.max(1, settings.cycleMinutes * 60);
  const progress = agent.cycleStart ? Math.max(0, Math.min(100, ((totalSeconds - remaining) / totalSeconds) * 100)) : 0;
  const anyWalletHealthy = wallet.baseHealthy || wallet.btcHealthy;
  const configured = hasConfiguredWallet();
  const portfolio = portfolioUsd();

  $('topState').textContent = engineRunning ? 'RUNNING' : anyWalletHealthy ? 'WALLET LIVE' : configured ? 'CONNECTING' : 'SETUP';
  $('statusDot').className = `status-dot ${anyWalletHealthy ? 'online' : wallet.errors.length ? 'error' : ''}`;
  $('portfolioValue').textContent = balanceHidden ? '••••••' : compactMoney(portfolio);
  $('usdcBalance').textContent = balanceHidden ? '••••••' : wallet.displayUsdc.toFixed(6);
  $('btcBalance').textContent = balanceHidden ? '••••••••' : wallet.displayBtc.toFixed(8);
  $('walletHealthText').textContent = anyWalletHealthy ? 'Public blockchain telemetry verified' : configured ? 'Connecting to public networks…' : 'Add a public wallet to begin';
  $('walletBlock').textContent = wallet.baseBlock ? `BASE #${wallet.baseBlock}` : wallet.btcHealthy ? 'BTC LIVE' : 'OFFLINE';
  $('sessionEarned').textContent = `+${money(wallet.sessionReceivedUsd, 2)}`;
  $('lastReceipt').textContent = wallet.lastReceiptAt ? `Last receipt ${new Date(wallet.lastReceiptAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'No confirmed receipt';
  $('cycleEarned').textContent = `+${money(wallet.cycleReceivedUsd, 2)}`;
  $('cycleGoal').textContent = `${wallet.cycleReceiptCount} verified receipt${wallet.cycleReceiptCount === 1 ? '' : 's'}`;
  const sessionHours = Math.max(1 / 3600, (Date.now() - (wallet.history[0]?.t || Date.now())) / 3_600_000);
  $('paceActual').textContent = `${money(wallet.sessionReceivedUsd / sessionHours, 2)}/h`;
  $('paceNote').textContent = wallet.sessionReceivedUsd > 0 ? 'confirmed incoming pace' : 'no confirmed receipts';
  $('generationMetric').textContent = `GEN-${String(agent.generation).padStart(2, '0')}`;
  $('fitnessMetric').textContent = `fitness ${Number(agent.fitness).toFixed(agent.fitness < 10 ? 3 : 2).replace(/0+$/, '').replace(/\.$/, '')}`;
  $('countdown').textContent = agent.cycleEnd ? clock(remaining) : '--:--';
  $('watcherText').textContent = engineRunning ? `watching ${agent.id}` : configured ? 'wallet online · agent paused' : 'waiting for setup';
  $('modelBadge').textContent = modelReady ? `${settings.model === 'deep' ? 'QWEN' : 'SMOLLM2'} · ${String(modelDevice).toUpperCase()}` : modelLoading ? 'MODEL LOADING' : 'MODEL OFFLINE';

  $('agentName').textContent = agent.id;
  $('agentStatus').textContent = agent.status;
  $('agentStatus').style.color = agent.status === 'alive' ? 'var(--mint)' : agent.status.includes('error') ? 'var(--red)' : 'var(--amber)';
  $('strategyName').textContent = agent.strategy.split(/[.!?]/)[0].slice(0, 78) || 'Awaiting plan';
  $('thoughtBubble').textContent = agent.why;
  $('nextAction').textContent = agent.nextAction;
  $('cycleLength').textContent = `${settings.cycleMinutes} min`;
  $('cycleProgress').style.width = `${progress}%`;
  $('modelName').textContent = settings.model === 'deep' ? 'Qwen2.5 0.5B' : 'SmolLM2 135M';
  $('modelDevice').textContent = modelReady ? String(modelDevice).toUpperCase() : modelLoading ? 'LOADING' : 'NOT LOADED';

  $('baseWalletLabel').textContent = settings.baseWallet ? shorten(settings.baseWallet, 7, 5) : 'Not configured';
  $('baseWalletState').textContent = wallet.baseHealthy ? 'LIVE' : settings.baseWallet ? 'WAIT' : 'OFF';
  $('baseWalletState').style.color = wallet.baseHealthy ? 'var(--mint)' : 'var(--muted)';
  $('btcWalletLabel').textContent = settings.btcWallet ? shorten(settings.btcWallet, 9, 5) : 'Not configured';
  $('btcWalletState').textContent = wallet.btcHealthy ? 'LIVE' : settings.btcWallet ? 'WAIT' : 'OFF';
  $('btcWalletState').style.color = wallet.btcHealthy ? 'var(--mint)' : 'var(--muted)';

  renderTree();
  renderLog();
  renderMarket();
}

function renderTree() {
  const nodes = [...agent.retired.slice(-3), { id: agent.id, generation: agent.generation, status: 'active' }, ...agent.offspring.slice(-3)];
  $('tree').innerHTML = nodes.map((node, index) => `${index ? '<span class="arrow">→</span>' : ''}<article class="node ${node.status === 'active' ? 'active' : node.status === 'retired' ? 'dead' : ''}"><b>${escapeHtml(node.id)}</b><small>GEN ${node.generation} · ${escapeHtml(node.status)}</small></article>`).join('');
  $('lineageCount').textContent = `${nodes.length} NODE${nodes.length === 1 ? '' : 'S'}`;
}

function renderLog() {
  $('log').innerHTML = agent.events.map(event => `<div class="event"><time>${new Date(event.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><p>${escapeHtml(event.m)}</p></div>`).join('');
  $('eventCount').textContent = `${agent.events.length} EVENT${agent.events.length === 1 ? '' : 'S'}`;
}

function renderMarket() {
  $('btcPrice').textContent = market.prices.BTC ? compactMoney(market.prices.BTC) : '—';
  $('ethPrice').textContent = market.prices.ETH ? compactMoney(market.prices.ETH) : '—';
  $('solPrice').textContent = market.prices.SOL ? compactMoney(market.prices.SOL) : '—';
  $('btcPriceState').textContent = market.healthy ? 'public spot' : market.prices.BTC ? 'fallback price' : 'unavailable';
  $('marketUpdated').textContent = market.updatedAt ? `Updated ${new Date(market.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : market.error || 'Waiting for market data';
  renderConverter();
}

function renderConverter() {
  const amount = Math.max(0, Number($('swapAmount').value) || 0);
  const from = $('swapFrom').value;
  const to = $('swapTo').value;
  const fromPrice = market.prices[from] || 0;
  const toPrice = market.prices[to] || 0;
  if (!fromPrice || !toPrice) return $('swapResult').textContent = '—';
  const result = amount * fromPrice / toPrice;
  $('swapResult').textContent = to === 'USD' ? money(result, 2) : `${result.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${to}`;
}

function animateBalances(now) {
  const duration = 850;
  const p = Math.min(1, (now - wallet.animationStart) / duration);
  const eased = 1 - Math.pow(1 - p, 3);
  wallet.displayUsdc = wallet.fromUsdc + (wallet.toUsdc - wallet.fromUsdc) * eased;
  wallet.displayBtc = wallet.fromBtc + (wallet.toBtc - wallet.fromBtc) * eased;
}

const arena = $('arena');
const arenaCtx = arena.getContext('2d');

function resizeArena() {
  const rect = arena.getBoundingClientRect();
  dpr = Math.min(2, devicePixelRatio || 1);
  arena.width = Math.max(1, Math.floor(rect.width * dpr));
  arena.height = Math.max(1, Math.floor(rect.height * dpr));
  arenaCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function burst(kind) {
  const rect = arena.getBoundingClientRect();
  const x = rect.width * .5, y = rect.height * .53;
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2, s = .8 + Math.random() * 3.8;
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

  const bg = arenaCtx.createRadialGradient(w * .5, h * .52, 4, w * .5, h * .52, Math.max(w, h) * .75);
  bg.addColorStop(0, 'rgba(112,255,173,.13)');
  bg.addColorStop(.42, 'rgba(98,217,255,.035)');
  bg.addColorStop(1, 'rgba(0,0,0,0)');
  arenaCtx.fillStyle = bg;
  arenaCtx.fillRect(0, 0, w, h);

  arenaCtx.save();
  arenaCtx.translate(w * .5, h * .72);
  arenaCtx.strokeStyle = 'rgba(116,255,176,.065)';
  arenaCtx.lineWidth = 1;
  for (let i = -6; i <= 6; i++) {
    arenaCtx.beginPath(); arenaCtx.moveTo(i * 34, 0); arenaCtx.lineTo(i * 14, -h * .58); arenaCtx.stroke();
  }
  for (let j = 0; j < 7; j++) {
    const y = -j * 26;
    arenaCtx.beginPath(); arenaCtx.moveTo(-w, y); arenaCtx.lineTo(w, y); arenaCtx.stroke();
  }
  arenaCtx.restore();

  const cx = w * .5, cy = h * .52;
  for (let i = 0; i < 4; i++) {
    arenaCtx.strokeStyle = `rgba(${i % 2 ? '98,217,255' : '112,255,173'},${.12 - i * .018})`;
    arenaCtx.lineWidth = 1;
    arenaCtx.beginPath();
    arenaCtx.ellipse(cx, cy, 72 + i * 27, 34 + i * 14, t * (.08 + i * .015), 0, Math.PI * 2);
    arenaCtx.stroke();
  }

  const nodes = [
    { a: t * .68, r: 116, label: '$', color: '#4c96ff' },
    { a: -t * .54 + 2.1, r: 142, label: '₿', color: '#f7931a' },
    { a: t * .37 + 4.2, r: 88, label: 'AI', color: '#a98cff' }
  ];
  for (const node of nodes) {
    const x = cx + Math.cos(node.a) * node.r;
    const y = cy + Math.sin(node.a) * node.r * .42;
    arenaCtx.strokeStyle = 'rgba(210,255,230,.09)';
    arenaCtx.beginPath(); arenaCtx.moveTo(cx, cy); arenaCtx.lineTo(x, y); arenaCtx.stroke();
    arenaCtx.fillStyle = node.color;
    arenaCtx.shadowBlur = 18; arenaCtx.shadowColor = node.color;
    arenaCtx.beginPath(); arenaCtx.arc(x, y, 13, 0, Math.PI * 2); arenaCtx.fill();
    arenaCtx.shadowBlur = 0;
    arenaCtx.fillStyle = '#04100a'; arenaCtx.font = '900 9px -apple-system,sans-serif'; arenaCtx.textAlign = 'center'; arenaCtx.textBaseline = 'middle'; arenaCtx.fillText(node.label, x, y + .5);
  }

  const coreRadius = 47 + Math.sin(t * 2.1) * 3 + arenaFx.pulse * 10;
  const core = arenaCtx.createRadialGradient(cx - 13, cy - 15, 3, cx, cy, coreRadius * 1.35);
  core.addColorStop(0, 'rgba(255,255,255,.95)');
  core.addColorStop(.16, 'rgba(112,255,173,.94)');
  core.addColorStop(.48, 'rgba(70,219,145,.34)');
  core.addColorStop(1, 'rgba(4,12,8,0)');
  arenaCtx.fillStyle = core; arenaCtx.beginPath(); arenaCtx.arc(cx, cy, coreRadius, 0, Math.PI * 2); arenaCtx.fill();
  arenaCtx.strokeStyle = 'rgba(112,255,173,.72)'; arenaCtx.lineWidth = 2; arenaCtx.beginPath(); arenaCtx.arc(cx, cy, coreRadius + 8, t, t + Math.PI * 1.45); arenaCtx.stroke();

  const watcher = { x: w * .82, y: h * .20 };
  arenaCtx.fillStyle = 'rgba(98,217,255,.12)'; arenaCtx.beginPath(); arenaCtx.arc(watcher.x, watcher.y, 25 + Math.sin(t * 2) * 2, 0, Math.PI * 2); arenaCtx.fill();
  arenaCtx.strokeStyle = 'rgba(98,217,255,.65)'; arenaCtx.beginPath(); arenaCtx.arc(watcher.x, watcher.y, 10, 0, Math.PI * 2); arenaCtx.stroke();
  arenaCtx.fillStyle = '#62d9ff'; arenaCtx.beginPath(); arenaCtx.arc(watcher.x, watcher.y, 3, 0, Math.PI * 2); arenaCtx.fill();

  if (arenaFx.beam > 0) {
    arenaCtx.save(); arenaCtx.globalAlpha = arenaFx.beam; arenaCtx.strokeStyle = '#ff6d89'; arenaCtx.lineWidth = 7 + arenaFx.beam * 10; arenaCtx.shadowBlur = 30; arenaCtx.shadowColor = '#ff315f'; arenaCtx.beginPath(); arenaCtx.moveTo(watcher.x, watcher.y); arenaCtx.lineTo(cx, cy); arenaCtx.stroke(); arenaCtx.restore();
    arenaFx.beam = Math.max(0, arenaFx.beam - .025);
  }

  arenaFx.particles = arenaFx.particles.filter(p => p.life > 0);
  for (const p of arenaFx.particles) {
    p.x += p.vx; p.y += p.vy; p.vy += .025; p.life -= .018;
    arenaCtx.globalAlpha = Math.max(0, p.life);
    arenaCtx.fillStyle = p.kind === 'dead' ? '#ff6d89' : p.kind === 'offspring' ? '#a98cff' : '#70ffad';
    arenaCtx.beginPath(); arenaCtx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); arenaCtx.fill();
  }
  arenaCtx.globalAlpha = 1;

  const history = wallet.history;
  if (history.length > 1) {
    const min = Math.min(...history.map(x => x.v));
    const max = Math.max(...history.map(x => x.v));
    const range = Math.max(.000001, max - min);
    const grad = arenaCtx.createLinearGradient(20, 0, w - 20, 0); grad.addColorStop(0, '#70ffad'); grad.addColorStop(.55, '#62d9ff'); grad.addColorStop(1, '#a98cff');
    arenaCtx.strokeStyle = grad; arenaCtx.lineWidth = 2; arenaCtx.beginPath();
    history.forEach((point, index) => {
      const x = 24 + index / (history.length - 1) * (w - 48);
      const y = h - 42 - ((point.v - min) / range) * 42;
      if (index === 0) arenaCtx.moveTo(x, y); else arenaCtx.lineTo(x, y);
    });
    arenaCtx.stroke();
  }

  arenaFx.flash = Math.max(0, arenaFx.flash - .04);
  arenaFx.pulse = Math.max(0, arenaFx.pulse - .025);
  if (arenaFx.flash > 0) { arenaCtx.fillStyle = `rgba(255,109,137,${arenaFx.flash * .20})`; arenaCtx.fillRect(0, 0, w, h); }
}

function frame(now) {
  animateBalances(now);
  drawArena(now);
  requestAnimationFrame(frame);
}

function setupNavigation() {
  const buttons = [...document.querySelectorAll('.dock-item')];
  buttons.forEach(button => button.addEventListener('click', () => {
    document.getElementById(button.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  const sections = [...document.querySelectorAll('[data-nav]')];
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(x => x.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    const target = visible.target.id;
    buttons.forEach(button => button.classList.toggle('active', button.dataset.target === target));
  }, { rootMargin: '-28% 0px -58% 0px', threshold: [0, .1, .3] });
  sections.forEach(section => observer.observe(section));
}

function setupEvents() {
  $('loginTab').onclick = () => switchAuth('login');
  $('registerTab').onclick = () => switchAuth('register');
  $('authForm').onsubmit = handleAuth;
  $('spectatorBtn').onclick = openSpectator;
  $('revealPassBtn').onclick = () => {
    const hidden = $('authPass').type === 'password';
    $('authPass').type = hidden ? 'text' : 'password';
    $('revealPassBtn').textContent = hidden ? 'Hide' : 'Show';
  };
  $('settingsBtn').onclick = openSettings;
  $('closeSettingsBtn').onclick = closeSettings;
  $('sheetBackdrop').onclick = closeSettings;
  $('cycleMinutes').oninput = () => $('cycleMinutesLabel').textContent = `${$('cycleMinutes').value} MIN`;
  $('saveSettingsBtn').onclick = () => { try { saveSettings(); } catch (error) { toast(error.message || String(error)); } };
  $('logoutBtn').onclick = logout;
  $('hideBalanceBtn').onclick = () => { balanceHidden = !balanceHidden; $('hideBalanceBtn').textContent = balanceHidden ? '○' : '◉'; render(); };
  ['swapAmount', 'swapFrom', 'swapTo'].forEach(id => $(id).addEventListener('input', renderConverter));
  $('swapDirectionBtn').onclick = () => { const from = $('swapFrom').value; $('swapFrom').value = $('swapTo').value; $('swapTo').value = from; renderConverter(); };
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
  window.addEventListener('resize', resizeArena);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      resizeArena();
      pollWallets();
      fetchMarket();
      if (engineRunning && agent.cycleEnd && Date.now() >= agent.cycleEnd) evaluateCycle();
    }
  });
  setupNavigation();
}

async function boot() {
  ensureOwnerAccount();
  setupEvents();
  switchAuth('login');
  $('authUser').value = OWNER_USER;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=5', { updateViaCache: 'none' }).catch(() => {});
  const saved = sessionStorage.getItem('pennyspawn_user_v5');
  if (saved === 'spectator') openSpectator();
  else if (saved && getAccounts()[saved]) { currentUser = saved; spectatorMode = false; openApp(); }
  resizeArena();
  requestAnimationFrame(frame);
  setInterval(render, 1000);
}

boot();
