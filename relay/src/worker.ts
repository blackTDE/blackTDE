import { RelayRoom } from './room';

export { RelayRoom };

export interface Env {
  RELAY_ROOM: DurableObjectNamespace<RelayRoom>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/ws\/([^/]+)$/);
    if (!match) {
      return new Response('not found', { status: 404 });
    }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const stub = env.RELAY_ROOM.getByName(match[1]);
    return stub.fetch(request);
  },
};
