import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Poppins ships as a static family with per-weight, per-subset files, so only the
// two weights actually used are imported. DM Sans is variable — one file covers
// the whole range. Note the naming split: the static family registers as plain
// 'Poppins', the variable one as 'DM Sans Variable'.
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource-variable/dm-sans';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
