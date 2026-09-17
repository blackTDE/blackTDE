import { DurableObject } from 'cloudflare:workers';
import { authorizeHello, type RelayRole } from './protocol';
import { sha256Hex } from './protocol';

type SocketAttachment = {
  role: RelayRole | 'unknown';
  ok: boolean;
};

interface RoomEnv {}

export class RelayRoom extends DurableObject<RoomEnv> {
  constructor(ctx: DurableObjectState, env: RoomEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS room (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          token_hash TEXT,
          revoked INTEGER NOT NULL DEFAULT 0
        )
      `);
      this.ctx.storage.sql.exec('INSERT OR IGNORE INTO room (id, revoked) VALUES (1, 0)');
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ role: 'unknown', ok: false } satisfies SocketAttachment);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(text) as Record<string, unknown>;
    } catch {
      ws.close(4000, 'bad json');
      return;
    }

    const attachment = (ws.deserializeAttachment() as SocketAttachment | null) ?? {
      role: 'unknown',
      ok: false,
    };

    if (!attachment.ok) {
      if (frame.type !== 'hello') {
        ws.send(JSON.stringify({ type: 'hello_err', error: 'hello required' }));
        ws.close(4001, 'hello required');
        return;
      }
      await this.handleHello(ws, frame);
      return;
    }

    if (frame.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    if (frame.type === 'revoke' && attachment.role === 'desktop') {
      this.ctx.storage.sql.exec('UPDATE room SET revoked = 1, token_hash = NULL WHERE id = 1');
      for (const peer of this.ctx.getWebSockets()) {
        try {
          peer.send(JSON.stringify({ type: 'revoke' }));
        } catch {
          // ignore
        }
        peer.close(4003, 'revoked');
      }
      return;
    }

    if (attachment.role === 'desktop') {
      this.broadcast(text, 'browser');
      return;
    }
    if (!this.hasDesktop()) {
      ws.send(JSON.stringify({
        type: 'rpc_err',
        id: typeof frame.id === 'string' ? frame.id : '',
        error: 'desktop offline',
        code: 'desktop_offline',
      }));
      return;
    }
    this.broadcast(text, 'desktop');
  }

  async webSocketClose(): Promise<void> {
    this.broadcastPresence();
  }

  async webSocketError(): Promise<void> {
    this.broadcastPresence();
  }

  private async handleHello(ws: WebSocket, frame: Record<string, unknown>): Promise<void> {
    const role = frame.role === 'desktop' || frame.role === 'browser' ? frame.role : null;
    const token = typeof frame.token === 'string' ? frame.token : '';
    if (!role) {
      ws.send(JSON.stringify({ type: 'hello_err', error: 'invalid role' }));
      ws.close(4001, 'invalid role');
      return;
    }

    const row = this.ctx.storage.sql.exec<{ token_hash: string | null; revoked: number }>(
      'SELECT token_hash, revoked FROM room WHERE id = 1',
    ).one();
    const incomingHash = await sha256Hex(token);
    const decision = authorizeHello(
      { tokenHash: row.token_hash, revoked: row.revoked === 1 },
      role,
      incomingHash,
    );
    if (!decision.ok) {
      ws.send(JSON.stringify({ type: 'hello_err', error: decision.error }));
      ws.close(4002, decision.error);
      return;
    }
    if (decision.storeHash) {
      this.ctx.storage.sql.exec('UPDATE room SET token_hash = ? WHERE id = 1', decision.storeHash);
    }
    if (role === 'desktop') {
      for (const peer of this.ctx.getWebSockets()) {
        if (peer === ws) {
          continue;
        }
        const peerAttachment = peer.deserializeAttachment() as SocketAttachment | null;
        if (peerAttachment?.role === 'desktop') {
          peer.close(4004, 'replaced');
        }
      }
    }

    ws.serializeAttachment({ role, ok: true } satisfies SocketAttachment);
    ws.send(JSON.stringify({
      type: 'hello_ok',
      role,
      desktopOnline: this.hasDesktop(),
    }));
    this.broadcastPresence();
  }

  private hasDesktop(): boolean {
    return this.ctx.getWebSockets().some((peer) => {
      const attachment = peer.deserializeAttachment() as SocketAttachment | null;
      return attachment?.ok && attachment.role === 'desktop';
    });
  }

  private broadcast(text: string, role: RelayRole): void {
    for (const peer of this.ctx.getWebSockets()) {
      const attachment = peer.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.ok && attachment.role === role) {
        try {
          peer.send(text);
        } catch {
          // ignore
        }
      }
    }
  }

  private broadcastPresence(): void {
    const desktopOnline = this.hasDesktop();
    const payload = JSON.stringify({ type: 'presence', desktopOnline });
    for (const peer of this.ctx.getWebSockets()) {
      const attachment = peer.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.ok && attachment.role === 'browser') {
        try {
          peer.send(payload);
        } catch {
          // ignore
        }
      }
    }
  }
}
