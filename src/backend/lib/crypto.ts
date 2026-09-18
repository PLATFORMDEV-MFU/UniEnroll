/**
 * UniEnroll Password Hashing Utilities using Web Crypto API (PBKDF2)
 * Compatible with Cloudflare Workers runtime and modern edge environments.
 */

const ITERATIONS = 100000;
const KEY_LENGTH = 32; // 256 bits
const DIGEST = 'SHA-256';

function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Hash a plain text password using PBKDF2-HMAC-SHA256 with a random 16-byte salt.
 * Returns format: `${saltHex}:${hashHex}`
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: ITERATIONS,
      hash: DIGEST,
    },
    passwordKey,
    KEY_LENGTH * 8
  );

  const saltHex = bufferToHex(salt);
  const hashHex = bufferToHex(derivedBits);

  return `${saltHex}:${hashHex}`;
}

/**
 * Verify a plain text password against a stored `${saltHex}:${hashHex}`.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !storedHash.includes(':')) {
    return false;
  }

  const [saltHex, expectedHashHex] = storedHash.split(':');
  if (!saltHex || !expectedHashHex) {
    return false;
  }

  const salt = hexToBuffer(saltHex);
  const encoder = new TextEncoder();

  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: ITERATIONS,
      hash: DIGEST,
    },
    passwordKey,
    KEY_LENGTH * 8
  );

  const actualHashHex = bufferToHex(derivedBits);

  // Constant-time comparison
  if (actualHashHex.length !== expectedHashHex.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < actualHashHex.length; i++) {
    result |= actualHashHex.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
  }

  return result === 0;
}
