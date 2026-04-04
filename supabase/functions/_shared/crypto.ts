import { getEnv } from './env.ts'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const toBase64 = (value: Uint8Array) => btoa(String.fromCharCode(...value))

const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0))

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

const digestSha256 = async (value: string) => {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return toHex(hash)
}

const importAesKey = async (version: number) => {
  const raw = getEnv(`MEDICAL_ENC_KEY_V${version}`)
  if (!raw) {
    throw new Error(`missing_encryption_key_v${version}`)
  }
  const keyBytes = fromBase64(raw)
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

const getActiveVersion = () => {
  const raw = getEnv('MEDICAL_ACTIVE_KEY_VERSION') || '1'
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

const buildAad = (ctx: {
  userId: string
  patientId: string
  medicalRecordId: string
  resourceType: string
  resourceId?: string
}) => `${ctx.userId}:${ctx.patientId}:${ctx.medicalRecordId}:${ctx.resourceType}:${ctx.resourceId || ''}`

export const encryptPayload = async (
  payload: unknown,
  ctx: {
    userId: string
    patientId: string
    medicalRecordId: string
    resourceType: string
    resourceId?: string
  }
) => {
  const version = getActiveVersion()
  const key = await importAesKey(version)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const aad = encoder.encode(buildAad(ctx))
  const plaintext = JSON.stringify(payload)

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: aad,
      tagLength: 128
    },
    key,
    encoder.encode(plaintext)
  )

  const sha = await digestSha256(plaintext)

  return {
    enc: {
      alg: 'A256GCM',
      v: version,
      kid: `medical-v${version}`,
      iv: toBase64(iv),
      ct: toBase64(new Uint8Array(encrypted)),
      created_at: new Date().toISOString()
    },
    sha,
    version
  }
}

export const decryptPayload = async (
  encrypted: any,
  ctx: {
    userId: string
    patientId: string
    medicalRecordId: string
    resourceType: string
    resourceId?: string
  }
) => {
  const version = Number(encrypted?.v || 0)
  if (!version) {
    throw new Error('invalid_encrypted_payload_version')
  }

  const key = await importAesKey(version)
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64(String(encrypted.iv || '')),
      additionalData: encoder.encode(buildAad(ctx)),
      tagLength: 128
    },
    key,
    fromBase64(String(encrypted.ct || ''))
  )

  const raw = decoder.decode(new Uint8Array(decrypted))
  return JSON.parse(raw)
}

export const getActiveCryptoVersion = () => getActiveVersion()

