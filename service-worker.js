
const CACHE="rbf-containers-v3-shell-1";
const ASSETS=["./","./index.html","./styles.css","./config.js","./db.js","./app.js","./manifest.webmanifest","./assets/rbf-logo.png","./assets/rbf-banner.png","./assets/icon-192.png","./assets/icon-512.png"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const url=new URL(e.request.url);
  if(url.pathname.includes("/rest/v1/"))return;
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;})));
});
