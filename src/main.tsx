import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register PWA Service Worker for offline mobile app experience
if ('serviceWorker' in navigator) {
  // sw.js uses skipWaiting + clients.claim: an updated worker takes over
  // immediately. If this page was already controlled, its JS/assets are the
  // previous version - reload once so the update actually applies. First
  // install (no prior controller) does not reload.
  const hadController = !!navigator.serviceWorker.controller;
  let reloadedForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloadedForUpdate) return;
    reloadedForUpdate = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[TenderAgent PWA] ServiceWorker registered successfully:', reg.scope);
      })
      .catch((err) => {
        console.warn('[TenderAgent PWA] ServiceWorker registration note:', err.message);
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
