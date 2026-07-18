const CACHE='pennyspawn-forge-v8';
const CORE=[
  './',
  './index.html',
  './q.css?v=6',
  './q.js?v=6',
  './state.js?v=8',
  './runtime.js',
  './ui.js?v=8',
  './stability-ui.js?v=8',
  './rpc-ui.js?v=8',
  './model-worker.js?v=8',
  './monetization-config.js?v=6',
  './app.webmanifest?v=6',
  './icon.svg?v=6'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.allSettled(CORE.map(url=>cache.add(new Request(url,{cache:'reload'}))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('pennyspawn-forge-')&&key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request){
  const cache=await caches.open(CACHE);
  try{
    const response=await fetch(request);
    if(response?.ok)cache.put(request,response.clone()).catch(()=>{});
    return response;
  }catch{
    return(await cache.match(request))||(await cache.match('./index.html'))||Response.error();
  }
}

async function staleWhileRevalidate(request){
  const cache=await caches.open(CACHE);
  const cached=await cache.match(request);
  const fresh=fetch(request).then(response=>{
    if(response?.ok)cache.put(request,response.clone()).catch(()=>{});
    return response;
  }).catch(()=>null);
  return cached||(await fresh)||Response.error();
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  const isNavigation=event.request.mode==='navigate'||event.request.destination==='document';
  event.respondWith(isNavigation?networkFirst(event.request):staleWhileRevalidate(event.request));
});
