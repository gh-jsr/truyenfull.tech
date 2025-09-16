/**
 * PWA Main JavaScript
 * File: pwa.js hoặc pwa-main.js
 */

(function () {
  'use strict';

  // Đăng ký Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/service-worker.js')
        .then(function (registration) {
          console.log('ServiceWorker registration successful with scope: ', registration.scope);
        })
        .catch(function (err) {
          console.log('ServiceWorker registration failed: ', err);
        });
    });
  }

  // Biến để lưu trữ sự kiện beforeinstallprompt
  let deferredPrompt;
  let installPromptShown = false;

  // Xử lý sự kiện beforeinstallprompt
  window.addEventListener('beforeinstallprompt', function (e) {
    // Ngăn Chrome hiển thị prompt cài đặt mặc định
    e.preventDefault();

    // Lưu sự kiện để sử dụng sau
    deferredPrompt = e;

    // Hiển thị prompt cài đặt tùy chỉnh cho người dùng mobile
    if (window.innerWidth <= 768 && !installPromptShown) {
      showInstallPrompt();
    }
  });

  // Hiển thị prompt cài đặt tùy chỉnh
  function showInstallPrompt() {
    const promptDiv = document.getElementById('pwa-install-prompt');
    if (!promptDiv) return;

    if (!localStorage.getItem('pwa-prompt-dismissed')) {
      // Animate in
      setTimeout(function () {
        promptDiv.style.display = 'block';
        setTimeout(function () {
          promptDiv.style.transform = 'translateY(0)';
        }, 10);
      }, 2000);

      installPromptShown = true;

      // Xử lý nút cài đặt
      const installBtn = document.getElementById('pwa-install-btn');
      if (installBtn) {
        installBtn.addEventListener('click', function () {
          // Ẩn prompt
          promptDiv.style.transform = 'translateY(100%)';
          setTimeout(function () {
            promptDiv.style.display = 'none';
          }, 300);

          // Hiển thị prompt cài đặt của trình duyệt
          if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(function (choiceResult) {
              if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the install prompt');
                showNotification('Cảm ơn bạn đã cài đặt ứng dụng!', 'success');
              } else {
                console.log('User dismissed the install prompt');
              }
              deferredPrompt = null;
            });
          }
        });
      }

      // Xử lý nút bỏ qua
      const dismissBtn = document.getElementById('pwa-dismiss-btn');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', function () {
          promptDiv.style.transform = 'translateY(100%)';
          setTimeout(function () {
            promptDiv.style.display = 'none';
          }, 300);
          localStorage.setItem('pwa-prompt-dismissed', Date.now());
        });
      }

      // Xử lý nút đóng
      const closeBtn = document.getElementById('pwa-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', function () {
          promptDiv.style.transform = 'translateY(100%)';
          setTimeout(function () {
            promptDiv.style.display = 'none';
          }, 300);
          localStorage.setItem('pwa-prompt-dismissed', Date.now());
        });
      }

      // Tự động ẩn sau 15 giây
      setTimeout(function () {
        if (promptDiv.style.display !== 'none') {
          promptDiv.style.transform = 'translateY(100%)';
          setTimeout(function () {
            promptDiv.style.display = 'none';
          }, 300);
        }
      }, 15000);
    }
  }

  // Kiểm tra và reset prompt sau 7 ngày
  function checkPromptDismissalTime() {
    const dismissedTime = localStorage.getItem('pwa-prompt-dismissed');
    if (dismissedTime) {
      const now = Date.now();
      const daysSinceDismissed = (now - dismissedTime) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed > 7) {
        localStorage.removeItem('pwa-prompt-dismissed');
      }
    }
  }
  checkPromptDismissalTime();

  // Xử lý sự kiện appinstalled
  window.addEventListener('appinstalled', function (evt) {
    console.log('PWA was installed');
    const promptDiv = document.getElementById('pwa-install-prompt');
    if (promptDiv) {
      promptDiv.style.transform = 'translateY(100%)';
      setTimeout(function () {
        promptDiv.style.display = 'none';
      }, 300);
    }
  });

  // Xử lý trạng thái mạng với kiểm tra thực tế
  let isActuallyOnline = navigator.onLine;
  let networkCheckTimeout = null;

  function checkNetworkConnectivity() {
    return new Promise((resolve) => {
      // Chỉ kiểm tra nếu navigator.onLine báo online
      if (!navigator.onLine) {
        resolve(false);
        return;
      }

      // Tạo một request nhỏ để kiểm tra kết nối thực tế
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      fetch('/manifest.json', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: controller.signal
      })
      .then(() => {
        clearTimeout(timeoutId);
        resolve(true);
      })
      .catch(() => {
        clearTimeout(timeoutId);
        resolve(false);
      });
    });
  }

  function updateNetworkStatus(skipConnectivityCheck = false) {
    if (skipConnectivityCheck) {
      // Chỉ sử dụng navigator.onLine cho các sự kiện online/offline
      const wasOnline = isActuallyOnline;
      isActuallyOnline = navigator.onLine;
      
      if (isActuallyOnline && !wasOnline) {
        // Khi chuyển từ offline sang online, kiểm tra thực tế
        checkNetworkConnectivity().then((actuallyOnline) => {
          updateNetworkStatusUI(actuallyOnline);
        });
      } else {
        updateNetworkStatusUI(isActuallyOnline);
      }
    } else {
      // Kiểm tra đầy đủ khi tải trang
      checkNetworkConnectivity().then((actuallyOnline) => {
        isActuallyOnline = actuallyOnline;
        updateNetworkStatusUI(actuallyOnline);
      });
    }
  }

  function updateNetworkStatusUI(online) {
    const wasOffline = document.body.classList.contains('offline');
    
    if (online) {
      document.body.classList.remove('offline');
      if (wasOffline) {
        showNotification('Đã kết nối internet', 'success');
        document.body.classList.remove('was-offline');
      }
    } else {
      if (!wasOffline) {
        document.body.classList.add('offline');
        document.body.classList.add('was-offline');
        showNotification('Mất kết nối internet - Đang sử dụng chế độ offline', 'warning');
      }
    }
  }

  // Định kỳ kiểm tra kết nối khi ở chế độ offline
  function scheduleNetworkCheck() {
    if (networkCheckTimeout) {
      clearTimeout(networkCheckTimeout);
    }
    
    if (!isActuallyOnline) {
      networkCheckTimeout = setTimeout(() => {
        updateNetworkStatus();
        scheduleNetworkCheck();
      }, 10000); // Kiểm tra mỗi 10 giây khi offline
    }
  }

  window.addEventListener('online', () => updateNetworkStatus(true));
  window.addEventListener('offline', () => updateNetworkStatus(true));
  
  // Kiểm tra ban đầu và bắt đầu lịch trình kiểm tra
  updateNetworkStatus();
  scheduleNetworkCheck();

  // Hiển thị thông báo
  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      color: white;
      z-index: 10000;
      font-size: 14px;
      max-width: 300px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transform: translateX(120%);
      transition: transform 0.3s ease;
      background: ${type === 'success' ? '#4CAF50' : type === 'warning' ? '#FF9800' : '#2196F3'};
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(function () {
      notification.style.transform = 'translateX(0)';
    }, 10);

    // Animate out and remove
    setTimeout(function () {
      notification.style.transform = 'translateX(120%)';
      setTimeout(function () {
        notification.remove();
      }, 300);
    }, 3000);
  }

  // Thêm CSS cho chế độ offline
  const offlineStyles = `
    .offline {
      filter: grayscale(0.3);
    }
    .offline::before {
      content: "Chế độ Offline";
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #f44336;
      color: white;
      text-align: center;
      padding: 8px;
      z-index: 9999;
      font-size: 14px;
      font-weight: bold;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    }
  `;

  const styleSheet = document.createElement('style');
  styleSheet.textContent = offlineStyles;
  document.head.appendChild(styleSheet);

  // Xử lý form submissions khi offline
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    document.addEventListener('submit', function (event) {
      const form = event.target;
      if (form.dataset.pwasync === 'true') {
        if (!isActuallyOnline) {
          event.preventDefault();

          // Lưu dữ liệu form để gửi sau
          const formData = new FormData(form);
          const formDataObj = {};
          formData.forEach(function (value, key) {
            formDataObj[key] = value;
          });

          // Lưu vào IndexedDB
          saveFormData(form.action, formDataObj, form.method);

          // Đăng ký sync
          navigator.serviceWorker.ready.then(function (registration) {
            registration.sync.register('form-submission');
          });

          showNotification('Form sẽ được gửi khi có kết nối internet', 'info');
        }
      }
    });
  }

  // Hàm lưu dữ liệu form vào IndexedDB
  function saveFormData(url, data, method) {
    // Đây là code mẫu, bạn cần thay đổi để phù hợp với cách lưu trữ của bạn
    console.log('Saving form data for later:', url, data, method);

    // Trong thực tế, bạn sẽ lưu vào IndexedDB
    // const dbPromise = indexedDB.open('pwa-forms', 1);
    // ...
  }

  // Xóa cache
  window.clearPWACache = function () {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        const messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = event => {
          if (event.data && event.data.success) {
            showNotification('Đã xóa cache thành công', 'success');
          } else {
            showNotification('Không thể xóa cache', 'warning');
          }
        };

        registration.active.postMessage({
          type: 'CLEAR_CACHE'
        }, [messageChannel.port2]);
      });
    }
  };

  // Kiểm tra người dùng quay lại sau thời gian dài
  function checkReturnVisit() {
    const lastVisit = localStorage.getItem('pwa-last-visit');
    const now = Date.now();
    localStorage.setItem('pwa-last-visit', now);

    if (lastVisit) {
      const minutesSinceLastVisit = (now - lastVisit) / (1000 * 60);
      if (minutesSinceLastVisit > 30) {
        showNotification('Chào mừng bạn quay trở lại!', 'info');
      }
    }
  }
  checkReturnVisit();

  // Đăng ký nhận push notifications
  function registerPushNotifications() {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(registration => {
        // Kiểm tra xem đã đăng ký chưa
        registration.pushManager.getSubscription()
          .then(subscription => {
            if (subscription) {
              return subscription;
            }

            // Nếu chưa đăng ký, yêu cầu quyền và đăng ký
            return registration.pushManager.subscribe({
              userVisibleOnly: true,
              // Thay thế bằng public key của bạn
              applicationServerKey: urlBase64ToUint8Array('YOUR_PUBLIC_VAPID_KEY')
            });
          })
          .then(subscription => {
            // Gửi subscription đến server
            console.log('Push subscription:', subscription);
            // sendSubscriptionToServer(subscription);
          })
          .catch(error => {
            console.error('Push notification error:', error);
          });
      });
    }
  }

  // Chuyển đổi base64 string sang Uint8Array
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Thêm nút đăng ký push notifications
  function addPushNotificationButton() {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      const button = document.createElement('button');
      button.id = 'pwa-push-button';
      button.textContent = 'Đăng ký thông báo';
      button.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 10px 15px;
        background: #4CAF50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        z-index: 9998;
        font-size: 14px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      `;

      button.addEventListener('click', function () {
        registerPushNotifications();
        this.textContent = 'Đã đăng ký';
        this.disabled = true;
        setTimeout(() => {
          this.style.display = 'none';
        }, 2000);
      });

      document.body.appendChild(button);
    }
  }

  // Bỏ comment dòng dưới nếu bạn muốn hiển thị nút đăng ký push notifications
  // addPushNotificationButton();
})();
