/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js')

const firebaseConfig = {
  apiKey: "AIzaSyBmc1jr8EYCTwoMzliNJTD3YC89Rm9VpDU",
  authDomain: "my-psi-push.firebaseapp.com",
  projectId: "my-psi-push",
  storageBucket: "my-psi-push.firebasestorage.app",
  messagingSenderId: "332582414718",
  appId: "1:332582414718:web:a2a8a343887d73a8912b2f",
};

const hasConfig = Object.values(firebaseConfig).every((value) => Boolean(value) && value !== 'REPLACE_ME')

if (hasConfig && self.firebase && !self.firebase.apps.length) {
  self.firebase.initializeApp(firebaseConfig)
}

if (hasConfig && self.firebase) {
  const messaging = self.firebase.messaging()

  messaging.onBackgroundMessage((payload) => {
    const title = payload?.notification?.title || 'Lembrete de consulta'
    const options = {
      body: payload?.notification?.body || '',
      data: payload?.data || {},
      icon: '/favicon.ico',
      badge: '/favicon.ico'
    }

    self.registration.showNotification(title, options)
  })
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
