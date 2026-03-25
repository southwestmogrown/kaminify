import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

/**
 * EncryptedApiKey stores the encrypted representation of a user's API key.
 * All three fields are required to recover the plaintext.
 */
export interface EncryptedApiKey {
  ciphertext: string // hex-encoded AES-256-GCM ciphertext
  iv: string          // hex-encoded 12-byte random IV
  authTag: string     // hex-encoded GCM authentication tag
}

/**
 * Derives a 32-byte key encryption key (KEK) from API_KEY_KEK env var.
 * Supports both raw hex (64 chars) and base64-encoded values.
 */
function getKek(): Buffer {
  const kek = process.env.API_KEY_KEK
  if (!kek) {
    throw new Error('API_KEY_KEK environment variable is not set')
  }
  if (/^[a-f0-9]{64}$/i.test(kek)) {
    return Buffer.from(kek, 'hex')
  }
  // Treat as base64 → derive a 32-byte key via SHA-256
  return createHash('sha256').update(kek).digest()
}

/**
 * Encrypts an API key using AES-256-GCM.
 * A fresh random IV is generated for every encryption.
 *
 * @returns EncryptedApiKey — store all three fields in your DB
 */
export function encryptApiKey(plaintext: string): EncryptedApiKey {
  const kek = getKek()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, kek, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])

  return {
    ciphertext: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  }
}

/**
 * Decrypts an AES-256-GCM encrypted API key.
 * Uses constant-time comparison for the auth tag to prevent timing attacks.
 */
export function decryptApiKey(encrypted: EncryptedApiKey): string {
  const kek = getKek()
  const iv = Buffer.from(encrypted.iv, 'hex')
  const authTag = Buffer.from(encrypted.authTag, 'hex')
  const ciphertext = Buffer.from(encrypted.ciphertext, 'hex')

  const decipher = createDecipheriv(ALGORITHM, kek, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}

/**
 * Verifies a plaintext API key against a stored encrypted value.
 * Returns true if they match, false otherwise.
 */
export function verifyApiKey(plaintext: string, encrypted: EncryptedApiKey): boolean {
  try {
    const decrypted = decryptApiKey(encrypted)
    return timingSafeEqual(Buffer.from(plaintext), Buffer.from(decrypted))
  } catch {
    return false
  }
}

/**
 * Serialises an EncryptedApiKey to a JSON string suitable for DB storage
 * in a TEXT column.
 */
export function serialiseEncryptedKey(encrypted: EncryptedApiKey): string {
  return JSON.stringify(encrypted)
}

/**
 * Deserialises a JSON string from the DB back into an EncryptedApiKey object.
 */
export function deserialiseEncryptedKey(raw: string): EncryptedApiKey {
  const parsed = JSON.parse(raw) as unknown
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as EncryptedApiKey).ciphertext !== 'string' ||
    typeof (parsed as EncryptedApiKey).iv !== 'string' ||
    typeof (parsed as EncryptedApiKey).authTag !== 'string'
  ) {
    throw new Error('Invalid encrypted API key format')
  }
  return parsed as EncryptedApiKey
}
