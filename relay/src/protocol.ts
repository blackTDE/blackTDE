export {
  authorizeHello,
  buildPairingUrl,
  parsePairingUrl,
  toWebSocketUrl,
  type HelloDecision,
  type RelayRole,
  type RoomAuthState,
} from '../../src/relayProtocol';

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
