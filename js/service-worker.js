const CACHE_NAME = 'truyen-cache-v2.0.0';
const CACHE_DURATION = 300 * 1000; // tính bằng milliseconds

// Install event - khởi tạo cache
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Cache opened');
      return cache;
    })
  );
  self.skipWaiting();
});
  
// Activate event - dá»n dáº¹p cache cÅ©
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - xá»­ lÃ½ cÃ¡c request
self.addEventListener('fetch', (event) => {
  // Chá»‰ xá»­ lÃ½ GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Bá» qua cÃ¡c request tá»›i tÃªn miá»n fb
  const url = new URL(event.request.url);
  if (
    url.origin.includes('chrome-extension') ||
    url.hostname.includes('facebook.com') ||
    url.hostname.includes('fb.com') ||
    url.hostname.includes('spreadsheets') ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/wp-ajax') ||
    url.pathname.startsWith('/wp-admin') ||
    url.pathname.startsWith('/wp-login.php') 
  ) {
    // console.log('Bỏ qua service worker cho request:', event.request.url);
    return; // Không gọi event.respondWith, để trình duyệt xử lý trực tiếp
  }
  
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    // Kiá»ƒm tra xem cÃ³ cache khÃ´ng
    if (cachedResponse) {
      const cacheTimestamp = cachedResponse.headers.get('x-cache-timestamp');
      const currentTime = Date.now();
      
      // Kiá»ƒm tra xem cache cÃ³ cÃ²n há»£p lá»‡ khÃ´ng (trong vÃ²ng 20 giÃ¢y)
      if (cacheTimestamp && (currentTime - parseInt(cacheTimestamp)) < CACHE_DURATION) {
        // console.log('Láº¥y cache:', request.url);
        return cachedResponse;
      } else {
        // console.log('Cache háº¿t háº¡n, xÃ³a khá»i cache:', request.url);
        // XÃ³a cache Ä‘Ã£ háº¿t háº¡n
        await cache.delete(request);
      }
    }
    
    // Fetch tá»« server
    // console.log('Láº¥y dá»¯ liá»‡u má»›i:', request.url);
    const networkResponse = await fetch(request);
    
    // Chá»‰ cache cÃ¡c response thÃ nh cÃ´ng
    if (networkResponse.ok) {
      // Clone response Ä‘á»ƒ cÃ³ thá»ƒ cache vÃ  return
      const responseToCache = networkResponse.clone();
      
      // Táº¡o response má»›i vá»›i timestamp header
      const headers = new Headers(responseToCache.headers);
      headers.set('x-cache-timestamp', Date.now().toString());
      
      const cachedResponse = new Response(await responseToCache.blob(), {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });
      
      // LÆ°u vÃ o cache
      await cache.put(request, cachedResponse.clone());
      // console.log('LÆ°u cache:', request.url);
      
      return cachedResponse;
    }
    
    return networkResponse;
    
  } catch (error) {
    console.error('Error in handleRequest:', error);
    
    // Náº¿u cÃ³ lá»—i network, thá»­ tráº£ vá» cache cÅ© (ngay cáº£ khi Ä‘Ã£ háº¿t háº¡n)
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('Network failed, serving stale cache:', request.url);
      return cachedResponse;
    }
    
     // Náº¿u khÃ´ng cÃ³ cache, tráº£ vá» lá»—i
    return new Response(`
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Lá»—i káº¿t ná»‘i</title>
      </head>
      <body style="
        padding: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0,0,0,0.9);
        display: flex;
        align-items: flex-start;
        justify-content: center;
        max-width: 800px;
        margin: 0 auto;
      ">
        <div style="
          width: 100%;
          padding: 40px 20px;
          animation: fadeIn 0.5s ease-in;
          text-align: center;
          display: flex;
          justify-content: center;
        ">
          <h1 style="
            color: #fff;
            font-size: 22px;
            line-height: 40px;
            font-weight: 600;
            text-align: center;
            margin: 0;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
          ">
            HÃ£y kiá»ƒm tra káº¿t ná»‘i máº¡ng cá»§a báº¡n
            <ul style="
              padding:0 20px;
              margin: 0;
              margin-top: 20px;
              color: #aeed31;
              line-height: 30px;
              font-weight: 400;
              text-align: left;
              text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
            ">
              <li style="text-align: left;margin-bottom: 12px;"><a href="https://eyep.blog/EwX5vNgg" style="color: red; text-decoration: underline;" target="_blank">Táº£i á»©ng dá»¥ng</a> vá» Ä‘iá»‡n thoáº¡i cá»§a báº¡n Ä‘á»ƒ Ä‘á»c truyá»‡n khÃ´ng cÃ³ quáº£ng cÃ¡o</li>
              <li style="text-align: left;margin-bottom: 12px;">HÃ£y thá»­ báº­t wifi/4G/5G Ä‘á»ƒ truy cáº­p láº¡i trang web</li>
              <li style="text-align: left;margin-bottom: 12px;">Má»Ÿ áº©n danh truy cáº­p láº¡i trang web</li>
            </ul>
            Náº¿u khÃ´ng Ä‘Æ°á»£c hÃ£y gá»­i tin nháº¯n cho admin qua zalo: 0976096541, báº¡n Ä‘ang dÃ¹ng máº¡ng vietel, mobifone, vinaphone, fpt, vnpt hay máº¡ng nÃ o khÃ¡c Ä‘á»ƒ admin kiá»ƒm tra vÃ  há»— trá»£ báº¡n.
          </h1>
        </div>
        <style>
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        </style>
      </body>
      </html>
    `, {
      status: 503,
      statusText: 'Service Unavailable', 
      headers: {
        'Content-Type': 'text/html;charset=UTF-8'
      }
    });
  }
}

// Xá»­ lÃ½ message tá»« main thread (optional)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('Cache cleared');
      // Kiá»ƒm tra xem cÃ³ ports khÃ´ng trÆ°á»›c khi gá»­i message
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true });
      }
      // Hoáº·c gá»­i message vá» client
      if (event.source) {
        event.source.postMessage({ success: true });
      }
    }).catch((error) => {
      console.error('Error clearing cache:', error);
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: false, error: error.message });
      }
      if (event.source) {
        event.source.postMessage({ success: false, error: error.message });
      }
    });
  }
});

// HÃ m helper Ä‘á»ƒ clear cache thá»§ cÃ´ng (cÃ³ thá»ƒ gá»i tá»« DevTools)
async function clearCache() {
  const deleted = await caches.delete(CACHE_NAME);
  console.log('Cache cleared:', deleted);
  return deleted;
}