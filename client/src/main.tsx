import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/playfair-display';
import '@fontsource-variable/source-sans-3';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
