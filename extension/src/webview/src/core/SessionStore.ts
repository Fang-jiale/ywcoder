import { signal, computed, effect } from 'alien-signals';
import { EventEmitter } from '../utils/events';
import type { ConnectionManager } from './ConnectionManager';
import { Session, type SessionContext, type SessionOptions } from './Session';
import type { PermissionRequest } from './PermissionRequest';
import type { SessionSummary } from './types';

export interface PermissionEvent {
  session: Session;
  permissionRequest: PermissionRequest;
}

export class SessionStore {
  // 已打开的对话标签页
  readonly sessions = signal<Session[]>([]);
  // 当前激活标签
  readonly activeSession = signal<Session | undefined>(undefined);
  // 所有历史会话（供历史记录页使用）
  readonly allSessions = signal<Session[]>([]);
  readonly permissionRequested = new EventEmitter<PermissionEvent>();

  readonly sessionsByLastModified = computed(() =>
    [...this.allSessions()].sort((a, b) => b.lastModifiedTime() - a.lastModifiedTime())
  );

  readonly connectionState = computed(() => this.connectionManager.state());

  private currentConnectionPromise?: Promise<void>;
  private effectCleanups: Array<() => void> = [];

  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly context: SessionContext
  ) {
    this.effectCleanups.push(
      effect(() => {
        if (this.connectionManager.connection()) {
          void this.listSessions();
        }
      })
    );

    this.effectCleanups.push(
      effect(() => {
        const session = this.activeSession();
        const defaultTitle = 'YW Coder';

        if (!session) {
          this.context.renameTab?.(defaultTitle);
          return;
        }

        if (session.isOffline()) {
          session.loadFromServer();
        } else {
          session.preloadConnection();
        }

        const url = new URL(window.location.toString());
        if (session.sessionId()) {
          url.searchParams.set('session', session.sessionId()!);
        } else {
          url.searchParams.delete('session');
        }
        window.history.replaceState({}, '', url.toString());

        const summary = session.summary();
        const title = summary && summary.length > 25 ? `${summary.slice(0, 24)}…` : summary;
        this.context.renameTab?.(title || defaultTitle);
      })
    );

    this.effectCleanups.push(
      effect(() => {
        const sessions = this.sessions();
        const seen = new Map<string, Session>();
        const deduped: Session[] = [];
        let changed = false;

        for (const session of sessions) {
          const id = session.sessionId();
          if (!id) {
            deduped.push(session);
            continue;
          }

          const duplicate = seen.get(id);
          if (duplicate && duplicate !== session) {
            this.mergeSessionMetadata(duplicate, session);
            if (this.activeSession() === session) {
              this.activeSession(duplicate);
            }
            changed = true;
            continue;
          }

          seen.set(id, session);
          deduped.push(session);
        }

        if (changed) {
          deduped.sort((a, b) => b.lastModifiedTime() - a.lastModifiedTime());
          this.sessions(deduped);
        }
      })
    );
  }

  onPermissionRequested(callback: (event: PermissionEvent) => void): () => void {
    return this.permissionRequested.add(callback);
  }

  async getConnection() {
    return this.connectionManager.get();
  }

  async createSession(options: SessionOptions = {}): Promise<Session> {
    const session = new Session(() => this.getConnection(), this.context, options);

    this.sessions([session, ...this.sessions()]);
    this.allSessions([session, ...this.allSessions().filter((s) => s !== session)]);
    this.activeSession(session);

    this.attachPermissionListener(session);
    this.persistTabs();

    return session;
  }

  async listSessions(): Promise<void> {
    if (this.currentConnectionPromise) {
      return this.currentConnectionPromise;
    }

    this.currentConnectionPromise = (async () => {
      try {
        const connection = await this.getConnection();
        const response = await connection.listSessions();

        const existing = new Map(
          this.allSessions()
            .filter((session) => !!session.sessionId())
            .map((session) => [session.sessionId() as string, session])
        );

        for (const summary of response.sessions ?? []) {
          if (!summary.isCurrentWorkspace) {
            continue;
          }

          const existingSession = existing.get(summary.id);
          if (existingSession) {
            existingSession.lastModifiedTime(summary.lastModified);
            existingSession.summary(summary.summary);
            existingSession.worktree(summary.worktree);
            existingSession.messageCount(summary.messageCount ?? 0);
            continue;
          }

          const session = Session.fromServer(
            summary as SessionSummary,
            () => this.getConnection(),
            this.context
          );

          this.attachPermissionListener(session);
          this.allSessions([...this.allSessions(), session]);
        }

        this.allSessions(
          [...this.allSessions()].sort((a, b) => b.lastModifiedTime() - a.lastModifiedTime())
        );

        // 历史记录加载完成后，恢复上次打开的标签页
        this.restoreTabs();
      } finally {
        this.currentConnectionPromise = undefined;
      }
    })();

    await this.currentConnectionPromise;
  }

  setActiveSession(session: Session | undefined): void {
    this.activeSession(session);
    this.persistTabs();
  }

  openSession(session: Session | undefined): void {
    if (!session) return;

    const tabs = this.sessions();
    if (!tabs.includes(session)) {
      this.sessions([session, ...tabs]);
    }
    this.activeSession(session);
    this.persistTabs();
  }

  closeSession(session: Session | undefined): void {
    if (!session) return;

    const tabs = this.sessions().filter((s) => s !== session);
    this.sessions(tabs);

    // 未保存的新会话直接销毁；有 sessionId 的保留在历史记录中
    if (!session.sessionId()) {
      session.dispose();
    }

    if (this.activeSession() === session) {
      if (tabs.length > 0) {
        this.activeSession(tabs[0]);
      } else {
        void this.createSession({ isExplicit: false });
      }
    }

    this.persistTabs();
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const connection = await this.getConnection();
    const response = await connection.deleteSession(sessionId);

    const all = this.allSessions();
    const allIndex = all.findIndex((s) => s.sessionId() === sessionId);
    if (allIndex !== -1) {
      const [removed] = all.splice(allIndex, 1);
      removed.dispose();
      this.allSessions([...all]);
    }

    const tabs = this.sessions();
    const index = tabs.findIndex((s) => s.sessionId() === sessionId);
    if (index !== -1) {
      const [removed] = tabs.splice(index, 1);
      if (!all.find((s) => s === removed)) {
        removed.dispose();
      }
      this.sessions([...tabs]);
    }

    if (this.activeSession()?.sessionId() === sessionId) {
      if (tabs.length > 0) {
        this.activeSession(tabs[0]);
        this.persistTabs();
      } else {
        void this.createSession({ isExplicit: false });
      }
    } else {
      this.persistTabs();
    }

    return !!response?.success;
  }

  private persistTabs(): void {
    try {
      const data = {
        activeSessionId: this.activeSession()?.sessionId() ?? null,
        openSessionIds: this.sessions()
          .map((s) => s.sessionId())
          .filter((id): id is string => !!id),
      };
      localStorage.setItem('ywcoder.session-tabs', JSON.stringify(data));
    } catch {
      // ignore storage errors
    }
  }

  private restoreTabs(): void {
    if (this.sessions().length > 0) {
      // 已经恢复过，避免覆盖
      return;
    }

    let data: { activeSessionId?: string | null; openSessionIds?: string[] } = {};
    try {
      const raw = localStorage.getItem('ywcoder.session-tabs');
      if (raw) {
        data = JSON.parse(raw);
      }
    } catch {
      // ignore
    }

    const all = this.allSessions();
    const byId = new Map(all.filter((s) => !!s.sessionId()).map((s) => [s.sessionId() as string, s]));

    const restoredTabs: Session[] = [];
    for (const id of data.openSessionIds ?? []) {
      const session = byId.get(id);
      if (session) {
        restoredTabs.push(session);
      }
    }

    this.sessions(restoredTabs);

    const activeId = data.activeSessionId;
    const activeSession = activeId ? byId.get(activeId) : undefined;
    this.activeSession(activeSession ?? restoredTabs[0] ?? all[0] ?? undefined);

    // 没有任何标签时自动创建一个空会话
    if (this.sessions().length === 0) {
      void this.createSession({ isExplicit: false });
    }
  }

  dispose(): void {
    // 清理所有 effects
    for (const cleanup of this.effectCleanups) {
      cleanup();
    }
    this.effectCleanups = [];

    // 清理所有 sessions
    for (const session of this.sessions()) {
      session.dispose();
    }
  }

  private attachPermissionListener(session: Session): void {
    session.onPermissionRequested((request) => {
      this.permissionRequested.emit({
        session,
        permissionRequest: request
      });
      if (this.activeSession() !== session) {
        this.activeSession(session);
      }
    });
  }

  private mergeSessionMetadata(target: Session, source: Session): void {
    if (source.summary() && source.summary() !== target.summary()) {
      target.summary(source.summary());
    }

    if (source.lastModifiedTime() > target.lastModifiedTime()) {
      target.lastModifiedTime(source.lastModifiedTime());
    }

    if (!target.worktree() && source.worktree()) {
      target.worktree(source.worktree());
    }
  }
}
