declare global {
  interface Window {
    acquireVsCodeApi?: <T = unknown>() => {
      postMessage(data: T): void;
      getState(): any;
      setState(data: any): void;
    };
  }
}

let vscodeApi: ReturnType<NonNullable<Window['acquireVsCodeApi']>> | undefined;

try {
  vscodeApi = window.acquireVsCodeApi?.();
} catch {
  // 已经获取过或不在 webview 环境中
}

export { vscodeApi };

const STORAGE_KEY = 'ywcoder.session-state';

export function getWebviewState(): any {
  if (vscodeApi) {
    return vscodeApi.getState();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return undefined;
}

export function setWebviewState(state: any): void {
  if (vscodeApi) {
    vscodeApi.setState(state);
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export interface WebviewRootState {
  sessionTabs?: {
    activeSessionId?: string | null;
    openSessionIds?: string[];
  };
  sessionState?: Record<string, { permissionMode?: string; modelSelection?: string }>;
}

export function loadRootState(): WebviewRootState {
  const state = getWebviewState();
  if (state && typeof state === 'object' && !Array.isArray(state)) {
    return state as WebviewRootState;
  }
  return {};
}

export function saveRootState(partial: WebviewRootState): void {
  const current = loadRootState();
  const next: WebviewRootState = {
    ...current,
    ...partial,
  };
  if (partial.sessionTabs) {
    next.sessionTabs = { ...current.sessionTabs, ...partial.sessionTabs };
  }
  if (partial.sessionState) {
    next.sessionState = { ...current.sessionState, ...partial.sessionState };
  }
  setWebviewState(next);
}
