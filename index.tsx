
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // Assuming you have this or similar for global styles
import { BlockStateProvider } from './context/BlockStateContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BlockStateProvider>
      <App />
    </BlockStateProvider>
  </React.StrictMode>
);