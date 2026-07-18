export const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const BALANCE_OF='70a08231';
export const RPC='https://mainnet.base.org';
export const OWNER_USER='tyleroy69';
const OWNER_SALT='2dddc302958b55293db471a1fa3327ed';
const OWNER_HASH='17db39b75359fb1e62a155748b76be81e6ec561b68a8e56fe6c9f74f436a7e22';
export const KEYS={accounts:'pennyspawn_accounts_v6',owner:'pennyspawn_owner_v6',session:'pennyspawn_session_v6',settings:'pennyspawn_settings_v6:',agent:'pennyspawn_agent_v6:',public:'pennyspawn_public_v6',consent:'pennyspawn_ads_consent_v6',runs:'pennyspawn_tool_runs_v6'};
export const BLOCKED=/(phish|credential theft|malware|ransomware|keylogger|fake review|impersonat(?:e|ion)|counterfeit|stolen goods|money mule|bypass kyc|seed phrase|private key|guaranteed profit|spam campaign|unauthorized access)/i;
export const defaults=()=>({baseWallet:'',btcWallet:'',cycleMinutes:10,skills:'',rpc:RPC,model:'lite'});
export const defaultAgent=()=>({id:'penny-agent-01',generation:1,fitness:.25,status:'waiting',strategy:'Awaiting setup',why:'Add a public watch-only wallet and load the local model.',nextAction:'Open Settings. Never enter a seed phrase or private key.',cycleStart:0,cycleEnd:0,retired:[],offspring:[],events:[{t:Date.now(),m:'PennySpawn Forge initialized. Fake revenue is disabled.'}]});
export const app={authMode:'login',currentUser:'',spectator:false,activeView:'home',settings:defaults(),agent:defaultAgent(),modelWorker:null,modelReady:false,modelLoading:false,modelDevice:'—',modelName:'not loaded',engine:false,toolMode:'compress',toolRequest:0,installPrompt:null,render:null,market:{prices:{USD:1,BTC:0,ETH:0,SOL:0},healthy:false},wallet:{usdc:0,btc:0,usdcSeen:false,btcSeen:false,baseHealthy:false,btcHealthy:false,baseBlock:0,sessionUsd:0,cycleUsd:0,receipts:0,lastReceipt:0,history:[]},timers:{wallet:null,market:null,cycle:null}};
export const $=id=>document.getElementById(id);
export const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
export const money=(v,d=2)=>'$'+Number(v||0).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
export const short=a=>a?`${a.slice(0,7)}…${a.slice(-5)}`:'Not configured';
export function clock(s){s=Math.max(0,Math.floor(s||0));return`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
export const validBase=v=>/^0x[a-fA-F0-9]{40}$/.test(v||'');
export const validBtc=v=>/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{20,90}$/i.test(v||'');
export function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(window.__psToast);window.__psToast=setTimeout(()=>$('toast').classList.remove('show'),1800)}
function accounts(){try{return JSON.parse(localStorage.getItem(KEYS.accounts)||'{}')}catch{return{}}}
function bytesHex(b){return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function hash(pass,saltHex){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveBits']);const salt=new Uint8Array(saltHex.match(/.{1,2}/g).map(x=>parseInt(x,16)));return bytesHex(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:180000,hash:'SHA-256'},key,256))}
export function seedOwner(){const list=accounts();if(localStorage.getItem(KEYS.owner)!=='1'||!list[OWNER_USER]){list[OWNER_USER]={salt:OWNER_SALT,hash:OWNER_HASH,owner:true};localStorage.setItem(KEYS.accounts,JSON.stringify(list));localStorage.setItem(KEYS.owner,'1')}}
export async function registerAccount(user,pass,confirm){user=user.trim().toLowerCase();if(!/^[a-z0-9_-]{3,24}$/.test(user))throw Error('Use 3–24 letters, numbers, _ or -.');if(pass.length<8)throw Error('Password needs at least 8 characters.');if(pass!==confirm)throw Error('Passwords do not match.');const list=accounts();if(list[user])throw Error('Profile already exists.');const salt=bytesHex(crypto.getRandomValues(new Uint8Array(16)));list[user]={salt,hash:await hash(pass,salt)};localStorage.setItem(KEYS.accounts,JSON.stringify(list));return user}
export async function loginAccount(user,pass){user=user.trim().toLowerCase();const account=accounts()[user];if(!account)throw Error('Profile not found.');if(await hash(pass,account.salt)!==account.hash)throw Error('Password not accepted. Check capitalization.');return user}
export const accountExists=user=>Boolean(accounts()[user]);
const settingsKey=()=>app.currentUser?KEYS.settings+app.currentUser:KEYS.public;
const agentKey=()=>KEYS.agent+app.currentUser;
export function loadState(){try{app.settings={...defaults(),...JSON.parse(localStorage.getItem(settingsKey())||'{}')}}catch{app.settings=defaults()}if(app.currentUser){try{app.agent={...defaultAgent(),...JSON.parse(localStorage.getItem(agentKey())||'{}')}}catch{app.agent=defaultAgent()}}else app.agent=defaultAgent();app.agent.retired=Array.isArray(app.agent.retired)?app.agent.retired:[];app.agent.offspring=Array.isArray(app.agent.offspring)?app.agent.offspring:[];app.agent.events=Array.isArray(app.agent.events)?app.agent.events:[]}
export function saveAgent(){if(app.currentUser)localStorage.setItem(agentKey(),JSON.stringify(app.agent))}
export function log(message){app.agent.events.unshift({t:Date.now(),m:String(message)});app.agent.events=app.agent.events.slice(0,80);saveAgent();app.render?.()}
export function saveSettings(next){app.settings={...defaults(),...next};localStorage.setItem(KEYS.settings+app.currentUser,JSON.stringify(app.settings));localStorage.setItem(KEYS.public,JSON.stringify({baseWallet:app.settings.baseWallet,btcWallet:app.settings.btcWallet,cycleMinutes:app.settings.cycleMinutes,rpc:app.settings.rpc,model:app.settings.model}))}
export function sessionUser(){return sessionStorage.getItem(KEYS.session)}
export function setSession(user){sessionStorage.setItem(KEYS.session,user)}
export function clearSession(){sessionStorage.removeItem(KEYS.session)}
