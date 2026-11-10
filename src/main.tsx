import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register PWA Service Worker for offline mobile app experience
if ('serviceWorker' in navigator) {
  // sw.js uses skipWaiting + clients.claim: an updated worker takes over
  // immediately, leaving an already-controlled page on the previous version's
  // JS/assets. Never auto-reload: that would discard unsaved tender text,
  // uploads or profile drafts and could interrupt a running analysis. Tell
  // the UI instead - it offers Refresh/Later (see SwUpdatePrompt).
  const hadController = !!navigator.serviceWorker.controller;
  let announced = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || announced) return;
    announced = true;
    window.dispatchEvent(new CustomEvent('tenderagent:sw-update'));
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
