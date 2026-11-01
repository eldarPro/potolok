import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { seedCatalog } from './lib/storage';
import { initKeyboardInset } from './lib/keyboard';

seedCatalog();
initKeyboardInset();

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);