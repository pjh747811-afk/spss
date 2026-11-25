import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { StatsErrorBoundary } from './components/StatsErrorBoundary';
import { ToastProvider } from './components/ToastCenter';
import './index.css';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    <StatsErrorBoundary stage="upload" onReset={() => window.location.reload()}>
      <App />
    </StatsErrorBoundary>
  </ToastProvider>
);
