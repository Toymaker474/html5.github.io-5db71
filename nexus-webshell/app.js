// SPDX-License-Identifier: MIT

const STORAGE_KEY = 'nexus.webshell.workspace.v1';
const HISTORY_KEY = 'nexus.webshell.history.v1';
const terminal = document.querySelector('#terminal');
const form = document.querySelector('#command-form');
const input = document.querySelector('#command-input');
const prompt = document.querySelector('#prompt');
const runtimeStatus = document.querySelector('#runtime-status');
const storageStatus = document.querySelector('#storage-status');

const defaultState = () => ({
  cwd: '/home/tyler',
  entries: {
    '/': { type: 'dir' },
    '/home': { type: 'dir' },
    '/home/tyler': { type: 'dir' },
    '/home/tyler/welcome.txt': {
      type: 'file',
      content: 'Welcome to NEXUS WebShell. Type Get-Help to see real browser-safe commands.\n',
    },
    '/tools': { type: 'dir' },
    '/tools/README.txt': {
      type: 'file',
      content: 'Built-in tools: word-count, sha256, json-pretty, base64-encode, base64-decode.\n',
    },
  },
});

function loadJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

let state = loadJson(STORAGE_KEY, defaultState());
let history = loadJson(HISTORY_KEY, []);
let historyIndex = history.length;

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  storageStatus.textContent = `Workspace: ${Object.keys(state.entries).length} items saved locally`;
}

function saveHistory() {
  history = history.slice(-100);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  historyIndex = history.length;
}

function normalizePath(rawPath = '.') {
  const source = String(rawPath || '.').trim();
  const combined = source.startsWith('/') ? source : `${state.cwd}/${source}`;
  const stack = [];
  for (const part of combined.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return `/${stack.join('/')}` || '/';
}

function parentPath(path) {
  if (path === '/') return '/';
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return `/${parts.join('/')}` || '/';
}

function baseName(path) {
  return path === '/' ? '/' : path.split('/').filter(Boolean).at(-1);
}

function assertEntry(path, type = null) {
  const entry = state.entries[path];
  if (!entry) throw new Error(`Path not found: ${path}`);
  if (type && entry.type !== type) throw new Error(`Expected ${type}: ${path}`);
  return entry;
}

function listChildren(path) {
  assertEntry(path, 'dir');
  return Object.entries(state.entries)
    .filter(([candidate]) => candidate !== path && parentPath(candidate) === path)
    .map(([candidate, entry]) => ({
      name: baseName(candidate),
      type: entry.type,
      path: candidate,
      size: entry.type === 'file' ? new Blob([entry.content || '']).size : null,
    }))
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

function tokenize(text) {
  const tokens = [];
  let current = '';
  let quote = null;
  let escaped = false;
  for (const character of text.trim()) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) tokens.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  if (quote) throw new Error('Unclosed quote.');
  if (escaped) current += '\\';
  if (current) tokens.push(current);
  return tokens;
}

function splitPipeline(text) {
  const segments = [];
  let current = '';
  let quote = null;
  let escaped = false;
  for (const character of text) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      current += character;
      escaped = true;
      continue;
    }
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === '|') {
      if (!current.trim()) throw new Error('Empty pipeline stage.');
      segments.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

function textValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(textValue).join('\n');
  return JSON.stringify(value, null, 2);
}

function print(value, className = 'output') {
  if (value == null || value === '') return;
  const element = document.createElement('pre');
  element.className = `entry ${className}`;
  element.textContent = textValue(value);
  terminal.append(element);
  terminal.scrollTop = terminal.scrollHeight;
}

function updatePrompt() {
  prompt.textContent = `PS ${state.cwd}>`;
  saveState();
}

const tools = [
  { name: 'word-count', purpose: 'Count words, characters, and lines.' },
  { name: 'sha256', purpose: 'Create a SHA-256 hash using Web Crypto.' },
  { name: 'json-pretty', purpose: 'Parse and format JSON.' },
  { name: 'base64-encode', purpose: 'Encode UTF-8 text as Base64.' },
  { name: 'base64-decode', purpose: 'Decode Base64 into UTF-8 text.' },
];

const help = [
  ['Get-Help', 'Show this command list.'],
  ['Get-Date', 'Show the current local date and time.'],
  ['Get-Location / pwd', 'Show the virtual working directory.'],
  ['Get-ChildItem / ls [path]', 'List virtual files as objects.'],
  ['Set-Location / cd <path>', 'Change virtual directory.'],
  ['New-Item <path> [-ItemType Directory]', 'Create a virtual file or folder.'],
  ['Set-Content <file> <text>', 'Replace virtual file content.'],
  ['Add-Content <file> <text>', 'Append virtual file content.'],
  ['Get-Content / cat <file>', 'Read virtual file content.'],
  ['Get-Capability', 'Report browser WebGPU, WASM, storage, and worker support.'],
  ['Get-Tool', 'List built-in agent utilities.'],
  ['Invoke-Tool <name> [text]', 'Run a safe built-in utility. Pipeline input is accepted.'],
  ['Measure-Object', 'Count pipeline items, words, and characters.'],
  ['Select-Object field1,field2', 'Select object properties from pipeline input.'],
  ['Sort-Object [field]', 'Sort pipeline input.'],
  ['ConvertTo-Json', 'Format pipeline input as JSON.'],
  ['Get-History', 'Show recent commands.'],
  ['Clear-Host / clear', 'Clear terminal output.'],
];

const aliases = new Map([
  ['help', 'get-help'],
  ['pwd', 'get-location'],
  ['ls', 'get-childitem'],
  ['dir', 'get-childitem'],
  ['cd', 'set-location'],
  ['cat', 'get-content'],
  ['clear', 'clear-host'],
  ['cls', 'clear-host'],
]);

async function invokeTool(name, value) {
  const text = textValue(value);
  switch (name.toLowerCase()) {
    case 'word-count':
      return {
        words: text.trim() ? text.trim().split(/\s+/).length : 0,
        characters: [...text].length,
        lines: text ? text.split(/\r?\n/).length : 0,
      };
    case 'sha256': {
      if (!crypto?.subtle) throw new Error('Web Crypto is not available.');
      const bytes = new TextEncoder().encode(text);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    case 'json-pretty':
      return JSON.stringify(JSON.parse(text), null, 2);
    case 'base64-encode':
      return btoa(String.fromCharCode(...new TextEncoder().encode(text)));
    case 'base64-decode': {
      const binary = atob(text);
      return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
    }
    default:
      throw new Error(`Unknown tool: ${name}. Run Get-Tool.`);
  }
}

async function runCommand(segment, pipelineInput) {
  const tokens = tokenize(segment);
  if (!tokens.length) return pipelineInput;
  let command = tokens.shift().toLowerCase();
  command = aliases.get(command) || command;

  switch (command) {
    case 'get-help':
      return help.map(([name, description]) => ({ name, description }));
    case 'get-date':
      return new Date().toString();
    case 'get-location':
      return { path: state.cwd };
    case 'get-childitem': {
      const target = normalizePath(tokens[0] || '.');
      return listChildren(target);
    }
    case 'set-location': {
      if (!tokens[0]) throw new Error('Set-Location needs a path.');
      const target = normalizePath(tokens[0]);
      assertEntry(target, 'dir');
      state.cwd = target;
      updatePrompt();
      return { path: state.cwd };
    }
    case 'new-item': {
      if (!tokens[0]) throw new Error('New-Item needs a path.');
      const target = normalizePath(tokens[0]);
      if (state.entries[target]) throw new Error(`Path already exists: ${target}`);
      assertEntry(parentPath(target), 'dir');
      const itemTypeIndex = tokens.findIndex(token => token.toLowerCase() === '-itemtype');
      const requested = itemTypeIndex >= 0 ? tokens[itemTypeIndex + 1]?.toLowerCase() : 'file';
      const type = requested === 'directory' || requested === 'dir' ? 'dir' : 'file';
      state.entries[target] = type === 'dir' ? { type } : { type, content: '' };
      saveState();
      return { path: target, type };
    }
    case 'set-content':
    case 'add-content': {
      if (!tokens[0]) throw new Error(`${command} needs a file path.`);
      const target = normalizePath(tokens.shift());
      assertEntry(parentPath(target), 'dir');
      const content = tokens.length ? tokens.join(' ') : textValue(pipelineInput);
      if (!state.entries[target]) state.entries[target] = { type: 'file', content: '' };
      const entry = assertEntry(target, 'file');
      entry.content = command === 'add-content' ? `${entry.content || ''}${content}` : content;
      saveState();
      return { path: target, bytes: new Blob([entry.content]).size };
    }
    case 'get-content': {
      if (!tokens[0]) {
        if (pipelineInput != null) return pipelineInput;
        throw new Error('Get-Content needs a file path.');
      }
      return assertEntry(normalizePath(tokens[0]), 'file').content || '';
    }
    case 'get-capability':
      return [
        { capability: 'WebAssembly', available: typeof WebAssembly === 'object' },
        { capability: 'WebGPU', available: Boolean(navigator.gpu) },
        { capability: 'Web Workers', available: typeof Worker === 'function' },
        { capability: 'Service Worker', available: 'serviceWorker' in navigator },
        { capability: 'Local Storage', available: typeof localStorage === 'object' },
        { capability: 'Web Crypto', available: Boolean(crypto?.subtle) },
        { capability: 'Touch Input', available: navigator.maxTouchPoints > 0 },
      ];
    case 'get-tool':
      return tools;
    case 'invoke-tool': {
      const toolName = tokens.shift();
      if (!toolName) throw new Error('Invoke-Tool needs a tool name.');
      const value = tokens.length ? tokens.join(' ') : pipelineInput;
      return invokeTool(toolName, value);
    }
    case 'measure-object': {
      const value = pipelineInput ?? tokens.join(' ');
      const items = Array.isArray(value) ? value : value == null ? [] : [value];
      const text = textValue(value);
      return {
        count: items.length,
        words: text.trim() ? text.trim().split(/\s+/).length : 0,
        characters: [...text].length,
        lines: text ? text.split(/\r?\n/).length : 0,
      };
    }
    case 'select-object': {
      const value = pipelineInput;
      if (value == null) throw new Error('Select-Object requires pipeline input.');
      const fields = tokens.join(' ').split(',').map(field => field.trim()).filter(Boolean);
      if (!fields.length) throw new Error('Select-Object needs at least one field.');
      const select = item => Object.fromEntries(fields.map(field => [field, item?.[field] ?? null]));
      return Array.isArray(value) ? value.map(select) : select(value);
    }
    case 'sort-object': {
      const value = pipelineInput;
      if (!Array.isArray(value)) throw new Error('Sort-Object requires an array from the pipeline.');
      const field = tokens[0];
      return [...value].sort((a, b) => {
        const left = field ? a?.[field] : a;
        const right = field ? b?.[field] : b;
        return String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true });
      });
    }
    case 'convertto-json':
      return JSON.stringify(pipelineInput ?? tokens.join(' '), null, 2);
    case 'get-history':
      return history.map((commandText, index) => ({ id: index + 1, command: commandText }));
    case 'clear-host':
      terminal.replaceChildren();
      return null;
    default:
      throw new Error(`Command not found: ${command}. Run Get-Help.`);
  }
}

async function execute(commandText) {
  const trimmed = commandText.trim();
  if (!trimmed) return;
  print(trimmed, 'command');
  history.push(trimmed);
  saveHistory();

  try {
    let value = null;
    for (const segment of splitPipeline(trimmed)) value = await runCommand(segment, value);
    print(value);
  } catch (error) {
    print(error instanceof Error ? error.message : String(error), 'error');
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const command = input.value;
  input.value = '';
  await execute(command);
  input.focus();
});

input.addEventListener('keydown', event => {
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    historyIndex = Math.max(0, historyIndex - 1);
    input.value = history[historyIndex] || '';
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    historyIndex = Math.min(history.length, historyIndex + 1);
    input.value = history[historyIndex] || '';
  }
});

document.querySelectorAll('[data-command]').forEach(button => {
  button.addEventListener('click', () => execute(button.dataset.command || ''));
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(error => {
    print(`Offline worker unavailable: ${error.message}`, 'muted');
  });
}

updatePrompt();
runtimeStatus.textContent = 'READY';
print('NEXUS WebShell 0.1 — safe browser runtime ready.', 'system');
print('Type Get-Help, or tap a command above. This shell cannot access the host operating system.', 'muted');
input.focus();
