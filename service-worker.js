const CACHE='cnc-pro-v23-variable-break-net-work-v4';
const CORE=['./','./index.html','./admin.html','./operator.html','./access-config.js','./access-control.js','./manifest.json','./firebase-config.js'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&key.startsWith('cnc-pro-')).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(
    fetch(event.request)
      .then(response=>{
        if(response.ok&&new URL(event.request.url).origin===self.location.origin){
          const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        }
        return response
      })
      .catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html')))
  );
});
