const CACHE_NAME = 'truyen-cache-v1.0.1';
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

// Activate event - dọn dẹp cache cũ
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

// Fetch event - xử lý các request
self.addEventListener('fetch', (event) => {
  // Chỉ xử lý GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Bỏ qua các request tới tên miền fb
  const url = new URL(event.request.url);
  if (
    url.origin.includes('chrome-extension') ||
    url.hostname.includes('facebook.com') ||
    url.hostname.includes('fb.com') ||
    url.hostname.includes('spreadsheets') ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/ajax') ||
    url.pathname.startsWith('/wp-json') ||
    url.pathname.startsWith('/wp-admin')
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

    // Kiểm tra xem có cache không
    if (cachedResponse) {
      const cacheTimestamp = cachedResponse.headers.get('x-cache-timestamp');
      const currentTime = Date.now();

      // Kiểm tra xem cache có còn hợp lệ không (trong vòng 20 giây)
      if (cacheTimestamp && (currentTime - parseInt(cacheTimestamp)) < CACHE_DURATION) {
        // console.log('Lấy cache:', request.url);
        return cachedResponse;
      } else {
        // console.log('Cache hết hạn, xóa khỏi cache:', request.url);
        // Xóa cache đã hết hạn
        await cache.delete(request);
      }
    }

    // Fetch từ server
    // console.log('Lấy dữ liệu mới:', request.url);
    const networkResponse = await fetch(request);

    // Chỉ cache các response thành công
    if (networkResponse.ok) {
      // Clone response để có thể cache và return
      const responseToCache = networkResponse.clone();

      // Tạo response mới với timestamp header
      const headers = new Headers(responseToCache.headers);
      headers.set('x-cache-timestamp', Date.now().toString());

      const cachedResponse = new Response(await responseToCache.blob(), {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });

      // Lưu vào cache
      await cache.put(request, cachedResponse.clone());
      // console.log('Lưu cache:', request.url);

      return cachedResponse;
    }

    return networkResponse;

  } catch (error) {
    console.error('Error in handleRequest:', error);

    // Nếu có lỗi network, thử trả về cache cũ (ngay cả khi đã hết hạn)
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      console.log('Network failed, serving stale cache:', request.url);
      return cachedResponse;
    }

    // Nếu không có cache, trả về lỗi
    return new Response('Hãy kiểm tra kết nối mạng của bạn', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Xử lý message từ main thread (optional)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('Cache cleared');
      // Kiểm tra xem có ports không trước khi gửi message
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true });
      }
      // Hoặc gửi message về client
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

// Hàm helper để clear cache thủ công (có thể gọi từ DevTools)
async function clearCache() {
  const deleted = await caches.delete(CACHE_NAME);
  console.log('Cache cleared:', deleted);
  return deleted;
}