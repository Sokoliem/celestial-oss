export interface SessionPreview {
  title: string;
  panes: number;
}

export interface SessionRestorePolicy {
  restoreFocus: boolean;
  restoreWorkspace: boolean;
}

export interface WorkspaceSession {
  name: string;
  workspace: {
    layout: unknown;
    activeIndex: number;
  };
  preview: SessionPreview;
  restore: SessionRestorePolicy;
  savedAt: number;
}

export interface SessionStore {
  sessions: Record<string, WorkspaceSession>;
}

export const DEFAULT_RESTORE_POLICY: SessionRestorePolicy = {
  restoreFocus: true,
  restoreWorkspace: true,
};

export function createSessionStore(): SessionStore {
  return { sessions: {} };
}

export function saveSession(
  store: SessionStore,
  session: Omit<WorkspaceSession, 'restore' | 'savedAt'> & Partial<Pick<WorkspaceSession, 'restore' | 'savedAt'>>,
): SessionStore {
  return {
    sessions: {
      ...store.sessions,
      [session.name]: {
        ...session,
        restore: session.restore ?? DEFAULT_RESTORE_POLICY,
        savedAt: session.savedAt ?? Date.now(),
      },
    },
  };
}

export function loadSession(store: SessionStore, name: string): WorkspaceSession | null {
  return store.sessions[name] ?? null;
}

export function listSessions(store: SessionStore): string[] {
  return Object.keys(store.sessions);
}
