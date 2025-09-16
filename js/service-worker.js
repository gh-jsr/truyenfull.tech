const CACHE_NAME = 'truyen-cache-v1.7.3';
const CACHE_DURATION = 300 * 1000; // tính bằng milliseconds

// Danh sách tài nguyên cần pre-cache
const PRECACHE_URLS = [
  '/',
  '/offline/',
  'https://cdn.jsdelivr.net/',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Thêm pre-caching cho các tài nguyên quan trọng
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  if (
    url.origin.includes('chrome-extension') ||
    url.hostname.includes('umami') ||
    url.hostname.includes('spreadsheets') ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/ajax') ||
    url.pathname.startsWith('/wp-json') ||
    url.pathname.startsWith('/wp-admin')
  ) {
    return;
  }

  // Chiến lược khác nhau cho từng loại tài nguyên
  if (url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/)) {
    // Cache-first cho hình ảnh
    event.respondWith(handleImageRequest(event.request));
  } else if (url.pathname.match(/\.(css|js)$/)) {
    // Network-first cho CSS và JS
    event.respondWith(handleAssetRequest(event.request));
  } else {
    // Stale-while-revalidate cho HTML và các tài nguyên khác
    event.respondWith(handleRequest(event.request));
  }
});

// Xử lý hình ảnh - Cache First Strategy
async function handleImageRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('Error fetching image:', error);
    return new Response('Image not available', { status: 404 });
  }
}

// Xử lý CSS/JS - Network First Strategy
async function handleAssetRequest(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('Error fetching asset:', error);

    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    return new Response('Asset not available', { status: 404 });
  }
}

// Giữ nguyên hàm handleRequest của bạn với một số cải tiến
async function handleRequest(request) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      const cacheTimestamp = cachedResponse.headers.get('x-cache-timestamp');
      const currentTime = Date.now();

      if (cacheTimestamp && (currentTime - parseInt(cacheTimestamp)) < CACHE_DURATION) {
        // Thêm cập nhật cache trong nền
        updateCacheInBackground(request, cache);
        return cachedResponse;
      } else {
        await cache.delete(request);
      }
    }

    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const responseToCache = networkResponse.clone();

      const headers = new Headers(responseToCache.headers);
      headers.set('x-cache-timestamp', Date.now().toString());

      const cachedResponse = new Response(await responseToCache.blob(), {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });

      await cache.put(request, cachedResponse.clone());

      return cachedResponse;
    }

    return networkResponse;

  } catch (error) {
    console.error('Error in handleRequest:', error);

    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // Thêm xử lý trang offline cho HTML requests
    if (request.mode === 'navigate' || (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
      const offlineResponse = await cache.match('/offline/');
      if (offlineResponse) {
        return offlineResponse;
      }
    }

    return new Response('Hãy kiểm tra kết nối mạng của bạn', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Thêm hàm cập nhật cache trong nền
async function updateCacheInBackground(request, cache) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const responseToCache = networkResponse.clone();

      const headers = new Headers(responseToCache.headers);
      headers.set('x-cache-timestamp', Date.now().toString());

      const cachedResponse = new Response(await responseToCache.blob(), {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });

      await cache.put(request, cachedResponse);
    }
  } catch (error) {
    console.error('Error updating cache in background:', error);
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true });
      }
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

// Thêm background sync cho form submissions
self.addEventListener('sync', (event) => {
  if (event.tag === 'form-submission') {
    event.waitUntil(handleFormSubmission());
  }
});

async function handleFormSubmission() {
  try {
    // Mở IndexedDB để lấy dữ liệu form đã lưu
    // Đây là code mẫu, bạn cần thay đổi để phù hợp với cách lưu trữ của bạn
    const pendingForms = await getPendingForms();

    for (const form of pendingForms) {
      try {
        const response = await fetch(form.url, {
          method: form.method || 'POST',
          headers: form.headers || {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.body
        });

        if (response.ok) {
          // Xóa form đã gửi thành công
          await removePendingForm(form.id);
        }
      } catch (error) {
        console.error('Error submitting form:', error);
      }
    }
  } catch (error) {
    console.error('Error in handleFormSubmission:', error);
  }
}

// Hàm giả định để lấy form từ storage
async function getPendingForms() {
  // Trong thực tế, bạn sẽ lấy từ IndexedDB
  return [];
}

// Hàm giả định để xóa form đã gửi
async function removePendingForm(id) {
  // Trong thực tế, bạn sẽ xóa từ IndexedDB
}

// Thêm push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    data = {
      title: 'Thông báo mới',
      body: event.data.text(),
    };
  }

  const options = {
    body: data.body || '',
    icon: data.icon || 'https://cdn.jsdelivr.net/gh/gh-jsr/truyenfull.tech@2.0.0/favicons/favicon-192x192.png',
    badge: 'https://cdn.jsdelivr.net/gh/gh-jsr/truyenfull.tech@2.0.0/favicons/favicon-96x96.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  } else {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});
