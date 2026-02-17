/* eslint-disable no-undef */
// Ensure Firebase compat bundle can resolve "window" in a Worker context.
self.window = self
// eslint-disable-next-line no-var
var window = self

const loadFirebaseScripts = () => {
  try {
    importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js')
    importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js')
    return true
  } catch (error) {
    self.console.error('Falha ao carregar Firebase no Service Worker (CDN):', error)
  }

  try {
    importScripts('/firebase-app-compat.js')
    importScripts('/firebase-messaging-compat.js')
    return true
  } catch (error) {
    self.console.error('Falha ao carregar Firebase no Service Worker (local):', error)
  }

  return false
}

const firebaseLoaded = loadFirebaseScripts()
const APP_CACHE = 'mypsi-app-cache-v1'
const APP_SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
]

const firebaseConfig = {
  apiKey: "AIzaSyBmc1jr8EYCTwoMzliNJTD3YC89Rm9VpDU",
  authDomain: "my-psi-push.firebaseapp.com",
  projectId: "my-psi-push",
  storageBucket: "my-psi-push.firebasestorage.app",
  messagingSenderId: "332582414718",
  appId: "1:332582414718:web:a2a8a343887d73a8912b2f",
};

const hasConfig = Object.values(firebaseConfig).every((value) => Boolean(value) && value !== 'REPLACE_ME')

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL_FILES)).catch(() => undefined)
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== APP_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return
  }

  const requestUrl = new URL(event.request.url)
  if (requestUrl.origin !== self.location.origin) {
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached
      }

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response
          }

          const copy = response.clone()
          caches.open(APP_CACHE).then((cache) => cache.put(event.request, copy)).catch(() => undefined)
          return response
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html')
          }
          return undefined
        })
    })
  )
})

if (firebaseLoaded && hasConfig && self.firebase && Array.isArray(self.firebase.apps) && !self.firebase.apps.length) {
  try {
    self.firebase.initializeApp(firebaseConfig)
  } catch (error) {
    self.console.error('Falha ao inicializar Firebase no Service Worker:', error)
  }
}

if (firebaseLoaded && hasConfig && self.firebase && typeof self.firebase.messaging === 'function') {
  let messaging
  try {
    messaging = self.firebase.messaging()
  } catch (error) {
    self.console.error('Falha ao iniciar Firebase Messaging no Service Worker:', error)
    messaging = null
  }

  if (messaging) {
    messaging.onBackgroundMessage((payload) => {
      if (payload?.notification?.title || payload?.notification?.body) {
        return
      }
      const data = payload?.data || {}
      const title = data.title || payload?.notification?.title || 'Lembrete de sessão'
      const options = {
        body: data.body || payload?.notification?.body || '',
        data,
        icon: '/favicon.ico',
        badge: '/favicon.ico'
      }

      self.registration.showNotification(title, options)
    })
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const route = event.notification?.data?.route || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(route) && 'focus' in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(route)
      }
      return undefined
    })
  )
})
