/* TPV Punto Verde - Service Worker v20261105
   Al activarse, ELIMINA todas las caches viejas: la app siempre
   descarga HTML/CSS/JS frescos del servidor. Sin archivos atrapados. */
   const VERSION = 'tpv-v20261105';

   self.addEventListener('install', () => {
       self.skipWaiting();
   });
   
   self.addEventListener('activate', event => {
       event.waitUntil(
           caches.keys()
               .then(keys => Promise.all(keys.map(k => caches.delete(k))))
               .then(() => self.clients.claim())
       );
   });
   
   /* Estrategia: RED primero (siempre fresco); solo si no hay red, cache */
   self.addEventListener('fetch', event => {
       if (event.request.method !== 'GET') return;
       event.respondWith(
           fetch(event.request)
               .then(resp => {
                   const copia = resp.clone();
                   caches.open(VERSION).then(cache => cache.put(event.request, copia));
                   return resp;
               })
               .catch(() => caches.match(event.request))
       );
   });