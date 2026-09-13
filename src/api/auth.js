const PBKDF2_ITERATIONS = 120000;
const HASH_ALGORITHM = 'SHA-256';
const KEY_LENGTH = 256;

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function randomSalt() {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return bytesToBase64(salt);
}

async function deriveHash(value, saltBase64) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(value),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: base64ToBytes(saltBase64),
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALGORITHM
    },
    material,
    KEY_LENGTH
  );

  return bytesToBase64(new Uint8Array(bits));
}

export async function hashSecret(value) {
  const salt = randomSalt();
  const hash = await deriveHash(value, salt);
  return { hash, salt };
}

export async function verifySecret(value, expectedHash, salt) {
  const actualHash = await deriveHash(value, salt);
  const actual = base64ToBytes(actualHash);
  const expected = base64ToBytes(expectedHash);

  if (actual.length !== expected.length) return false;

  let difference = 0;
  for (let i = 0; i < actual.length; i += 1) {
    difference |= actual[i] ^ expected[i];
  }
  return difference === 0;
}

export function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

export function normalizeUsername(value) {
  return value.trim().toLowerCase();
}

export function validateSignupInput(input) {
  const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';
  const username = typeof input.username === 'string' ? input.username.trim() : '';
  const email = typeof input.email === 'string' ? normalizeEmail(input.email) : '';
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const confirmPassword = typeof input.confirmPassword === 'string' ? input.confirmPassword : '';
  const recoveryPin = typeof input.recoveryPin === 'string' ? input.recoveryPin.trim() : '';
  const termsAccepted = input.termsAccepted === true;

  if (fullName.length < 2 || fullName.length > 100) return 'Invalid full name';
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) return 'Username must be 3-30 characters using letters, numbers, or underscore';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return 'Invalid email address';
  if (phone.length < 7 || phone.length > 30) return 'Invalid phone number';
  if (password.length < 8 || password.length > 128) return 'Password must be 8-128 characters';
  if (password !== confirmPassword) return 'Passwords do not match';
  if (!/^\d{4,12}$/.test(recoveryPin)) return 'Recovery PIN must be 4-12 digits';
  if (!termsAccepted) return 'Terms and Conditions must be accepted';

  return null;
}

export { PBKDF2_ITERATIONS };
