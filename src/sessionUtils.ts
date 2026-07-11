export interface SessionRecord {
  id: string;
  agent_type: string;
  cwd: string;
  remote_session_id?: string | null;
  status?: string;
}

export const dedupeSessions = <T extends SessionRecord>(sessions: T[]): T[] => {
  const canonical = new Map<string, T>();

  for (const session of sessions) {
    const remoteId = session.remote_session_id?.trim();
    const key = remoteId
      ? `${session.cwd}\u0000${session.agent_type}\u0000${remoteId}`
      : `local\u0000${session.id}`;
    const existing = canonical.get(key);

    if (!existing || (existing.status !== 'active' && session.status === 'active')) {
      canonical.set(key, session);
    }
  }

  return [...canonical.values()];
};
