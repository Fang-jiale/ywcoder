import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import '@vscode/codicons/dist/codicon.css';
import '@mdi/font/css/materialdesignicons.min.css';

// Load SVG icon sprite asynchronously so the initial bundle stays smaller.
// The <Icon> component will fall back to the MDI font until the sprite is ready.
import('./icons');

declare global {
  interface Window {
    acquireVsCodeApi?: <T = unknown>() => {
      postMessage(data: T): void;
      getState(): any;
      setState(data: any): void;
    };
    YWCODE_BOOTSTRAP?: {
      host?: 'sidebar' | 'editor';
      page?: string;
    };
  }
}

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.mount('#app');
