import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register PWA Service Worker for offline mobile app experience
if ('serviceWorker' in navigator) {
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
