import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    if (import.meta.env.DEV) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(
          cacheKeys
            .filter((key) => key.startsWith('mypsi-app-cache'))
            .map((key) => caches.delete(key))
        );
      }
      return;
    }

    navigator.serviceWorker.register('/firebase-messaging-sw.js').catch((error) => {
      console.error('Falha ao registrar Service Worker:', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
