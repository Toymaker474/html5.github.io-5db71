const FREE_RPCS = [
  {
    id: 'standard',
    name: 'Base Standard',
    badge: 'FREE',
    url: 'https://mainnet.base.org',
    detail: 'Official Base endpoint · no signup · rate-limited'
  },
  {
    id: 'flash',
    name: 'Base Flashblocks',
    badge: 'FAST',
    url: 'https://mainnet-preconf.base.org',
    detail: 'Official pre-confirmation endpoint · no signup · rate-limited'
  }
];

const MODE_KEY = 'pennyspawn_rpc_mode_v7';
const LAST_GOOD_KEY = 'pennyspawn_rpc_last_good_v7';
const $ = id => document.getElementById(id);

function injectStyles() {
  if ($('rpcControlStyles')) return;
  const style = document.createElement('style');
  style.id = 'rpcControlStyles';
  style.textContent = `
    .rpc-control{margin:-2px 0 18px;padding:14px;border:1px solid rgba(255,255,255,.09);border-radius:20px;background:linear-gradient(145deg,rgba(23,29,45,.94),rgba(8,12,22,.96));box-shadow:0 16px 44px rgba(0,0,0,.25)}
    .rpc-control *{box-sizing:border-box}.rpc-kicker{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:11px}.rpc-kicker span{font-size:11px;font-weight:800;letter-spacing:.13em;color:#8d9ab8}.rpc-kicker b{padding:5px 8px;border-radius:999px;background:rgba(88,255,166,.12);border:1px solid rgba(88,255,166,.25);color:#70ffb1;font-size:10px;letter-spacing:.08em}
    .rpc-presets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.rpc-preset{min-height:74px;padding:11px;text-align:left;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.035);color:#fff;transition:.2s transform,.2s border-color,.2s background}.rpc-preset:active{transform:scale(.98)}.rpc-preset.active{border-color:rgba(103,255,175,.55);background:linear-gradient(145deg,rgba(62,255,154,.13),rgba(87,151,255,.08));box-shadow:inset 0 0 0 1px rgba(103,255,175,.08)}.rpc-preset strong{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:13px}.rpc-preset strong em{font-style:normal;font-size:9px;padding:3px 6px;border-radius:999px;background:rgba(255,255,255,.09);color:#9fffc4}.rpc-preset small{display:block;margin-top:6px;color:#8995ae;font-size:10px;line-height:1.35}
    .rpc-auto{grid-column:1/-1;min-height:62px;background:linear-gradient(100deg,rgba(105,73,255,.13),rgba(63,216,255,.08))}.rpc-auto strong em{color:#c8baff}.rpc-custom{grid-column:1/-1;min-height:58px}
    .rpc-health{display:flex;align-items:center;gap:9px;margin-top:12px;padding:10px 11px;border-radius:14px;background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.06)}.rpc-health i{width:9px;height:9px;border-radius:50%;background:#6e7890;box-shadow:0 0 0 5px rgba(110,120,144,.1);flex:0 0 auto}.rpc-health.testing i{background:#ffcf5c;box-shadow:0 0 0 5px rgba(255,207,92,.1);animation:rpcPulse 1s infinite}.rpc-health.good i{background:#62ffad;box-shadow:0 0 0 5px rgba(98,255,173,.11)}.rpc-health.bad i{background:#ff6788;box-shadow:0 0 0 5px rgba(255,103,136,.11)}.rpc-health div{min-width:0}.rpc-health b{display:block;font-size:12px;color:#f8fbff}.rpc-health small{display:block;margin-top:2px;color:#8995ae;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .rpc-actions{display:grid;grid-template-columns:1fr auto;gap:9px;margin-top:10px}.rpc-test,.rpc-copy{min-height:42px;border-radius:13px;border:1px solid rgba(255,255,255,.09);font-weight:750}.rpc-test{background:linear-gradient(100deg,#6dffae,#4bbdf8);color:#07110d}.rpc-copy{padding:0 14px;background:rgba(255,255,255,.055);color:#fff}.rpc-test:disabled{opacity:.55}.rpc-help{margin:10px 2px 0;color:#7f8aa3;font-size:10px;line-height:1.45}.rpc-help a{color:#8edbff;text-decoration:none}.rpc-field-free{display:inline-flex!important;align-items:center;gap:6px}.rpc-field-free:after{content:'FREE';padding:3px 6px;border-radius:999px;background:rgba(98,255,173,.12);color:#75ffb5;font-size:9px;letter-spacing:.08em}.field input.rpc-readonly{color:#b9c5dd;background:rgba(255,255,255,.028)}
    @keyframes rpcPulse{50%{opacity:.45;transform:scale(.82)}}
    @media(max-width:430px){.rpc-control{border-radius:18px;padding:12px}.rpc-preset{min-height:70px;padding:10px}.rpc-presets{gap:8px}}
  `;
  document.head.appendChild(style);
}

function rpcRequest(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([
      { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] },
      { jsonrpc: '2.0', id: 2, method: 'eth_blockNumber', params: [] }
    ]),
    cache: 'no-store',
    signal: controller.signal
  }).then(async response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const rows = Array.isArray(data) ? data : [data];
    const chain = rows.find(x => x.id === 1)?.result;
    const blockHex = rows.find(x => x.id === 2)?.result;
    if (chain !== '0x2105') throw new Error('Not Base Mainnet');
    if (!blockHex) throw new Error('No block response');
    return {
      url,
      latency: Math.max(1, Math.round(performance.now() - started)),
      block: parseInt(blockHex, 16)
    };
  }).finally(() => clearTimeout(timer));
}

function buildControl(input) {
  const wrap = document.createElement('section');
  wrap.className = 'rpc-control';
  wrap.id = 'rpcControl';
  wrap.innerHTML = `
    <div class="rpc-kicker"><span>ONE-TAP BASE CONNECTION</span><b>NO API KEY NEEDED</b></div>
    <div class="rpc-presets">
      <button class="rpc-preset rpc-auto" type="button" data-rpc-mode="auto"><strong>⚡ Auto-pick fastest <em>RECOMMENDED</em></strong><small>Tests both free official endpoints and selects the healthiest one.</small></button>
      ${FREE_RPCS.map(rpc => `<button class="rpc-preset" type="button" data-rpc-mode="${rpc.id}" data-rpc-url="${rpc.url}"><strong>${rpc.name}<em>${rpc.badge}</em></strong><small>${rpc.detail}</small></button>`).join('')}
      <button class="rpc-preset rpc-custom" type="button" data-rpc-mode="custom"><strong>🔧 Custom provider <em>OPTIONAL</em></strong><small>Use an Alchemy, CDP, QuickNode, Ankr, or other HTTPS endpoint when you outgrow the public rate limit.</small></button>
    </div>
    <div class="rpc-health" id="rpcHealth"><i></i><div><b id="rpcHealthTitle">Ready to test</b><small id="rpcHealthDetail">Choose Auto for the easiest setup.</small></div></div>
    <div class="rpc-actions"><button class="rpc-test" id="rpcTestBtn" type="button">Test connection</button><button class="rpc-copy" id="rpcCopyBtn" type="button">Copy</button></div>
    <p class="rpc-help">RPC is only the public read-only bridge used to check Base blocks and your public USDC balance. The free official endpoints need no account, but Base documents them as rate-limited and not intended for heavy production traffic. <a href="https://docs.base.org/base-chain/quickstart/connecting-to-base" target="_blank" rel="noopener">Official Base info ↗</a></p>
  `;
  input.closest('.field')?.insertAdjacentElement('afterend', wrap);
  return wrap;
}

function modeForUrl(url) {
  return FREE_RPCS.find(rpc => rpc.url === url)?.id || 'custom';
}

export function bootRpcUI() {
  const input = $('rpcUrl');
  if (!input || $('rpcControl')) return;
  injectStyles();

  const label = input.closest('.field')?.querySelector(':scope > span');
  if (label) {
    label.textContent = 'Base RPC connection';
    label.classList.add('rpc-field-free');
  }
  input.autocapitalize = 'none';
  input.spellcheck = false;
  input.placeholder = 'https://your-base-rpc.example';

  const control = buildControl(input);
  const health = $('rpcHealth');
  const title = $('rpcHealthTitle');
  const detail = $('rpcHealthDetail');
  const testBtn = $('rpcTestBtn');
  const copyBtn = $('rpcCopyBtn');
  const buttons = [...control.querySelectorAll('[data-rpc-mode]')];
  let testing = false;

  function setHealth(kind, headline, subline) {
    health.className = `rpc-health ${kind || ''}`.trim();
    title.textContent = headline;
    detail.textContent = subline;
  }

  function activate(mode) {
    buttons.forEach(button => button.classList.toggle('active', button.dataset.rpcMode === mode));
    localStorage.setItem(MODE_KEY, mode);
    const custom = mode === 'custom';
    input.readOnly = !custom;
    input.classList.toggle('rpc-readonly', !custom);
  }

  async function testOne(url) {
    return rpcRequest(url);
  }

  async function chooseFastest() {
    setHealth('testing', 'Testing free Base endpoints…', 'Checking latency and current block height.');
    const results = await Promise.allSettled(FREE_RPCS.map(rpc => testOne(rpc.url)));
    const healthy = results
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value)
      .sort((a, b) => a.latency - b.latency);
    if (!healthy.length) throw new Error('Both public endpoints are temporarily unavailable or rate-limited.');
    const winner = healthy[0];
    input.value = winner.url;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    localStorage.setItem(LAST_GOOD_KEY, winner.url);
    activate('auto');
    setHealth('good', `Connected in ${winner.latency} ms`, `Auto selected ${modeForUrl(winner.url) === 'flash' ? 'Flashblocks' : 'Standard'} · Base block ${winner.block.toLocaleString()}`);
    return winner;
  }

  async function runTest({ autoFallback = true } = {}) {
    if (testing) return;
    testing = true;
    testBtn.disabled = true;
    const mode = localStorage.getItem(MODE_KEY) || modeForUrl(input.value.trim());
    try {
      if (mode === 'auto') {
        await chooseFastest();
      } else {
        const url = input.value.trim();
        if (!/^https:\/\//i.test(url)) throw new Error('RPC URL must start with https://');
        setHealth('testing', 'Testing connection…', url);
        const result = await testOne(url);
        localStorage.setItem(LAST_GOOD_KEY, result.url);
        setHealth('good', `Connected in ${result.latency} ms`, `Base Mainnet · block ${result.block.toLocaleString()} · tap Save and launch`);
      }
    } catch (error) {
      const modeNow = localStorage.getItem(MODE_KEY) || 'custom';
      if (autoFallback && modeNow !== 'custom') {
        try {
          const recovered = await chooseFastest();
          setHealth('good', 'Recovered automatically', `${recovered.latency} ms · switched to a working free endpoint`);
        } catch {
          setHealth('bad', 'Could not connect', error?.message || 'Endpoint unavailable');
        }
      } else {
        setHealth('bad', 'Could not connect', error?.message || 'Endpoint unavailable');
      }
    } finally {
      testing = false;
      testBtn.disabled = false;
    }
  }

  buttons.forEach(button => {
    button.addEventListener('click', async () => {
      const mode = button.dataset.rpcMode;
      if (mode === 'auto') {
        activate('auto');
        await runTest();
        return;
      }
      if (mode === 'custom') {
        activate('custom');
        input.focus();
        input.select();
        setHealth('', 'Custom mode', 'Paste a provider HTTPS endpoint, then test it. Never paste a private key.');
        return;
      }
      input.value = button.dataset.rpcUrl;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      activate(mode);
      await runTest();
    });
  });

  testBtn.addEventListener('click', () => runTest());
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(input.value.trim());
      copyBtn.textContent = 'Copied ✓';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1400);
    } catch {
      input.select();
    }
  });

  input.addEventListener('input', () => {
    if (modeForUrl(input.value.trim()) === 'custom') activate('custom');
    setHealth('', 'Not tested yet', 'Tap Test connection before saving.');
  });

  const savedMode = localStorage.getItem(MODE_KEY);
  const currentMode = savedMode || modeForUrl(input.value.trim());
  activate(currentMode);
  if (!input.value.trim()) input.value = localStorage.getItem(LAST_GOOD_KEY) || FREE_RPCS[0].url;

  const sheet = $('settingsSheet');
  if (sheet) {
    new MutationObserver(() => {
      if (!sheet.classList.contains('open')) return;
      const detected = modeForUrl(input.value.trim());
      const preferred = localStorage.getItem(MODE_KEY) || detected;
      activate(preferred === 'auto' ? 'auto' : detected);
      if (health.classList.contains('good')) return;
      setTimeout(() => runTest(), 180);
    }).observe(sheet, { attributes: true, attributeFilter: ['class'] });
  }

  window.PS_TEST_RPC = runTest;
}
