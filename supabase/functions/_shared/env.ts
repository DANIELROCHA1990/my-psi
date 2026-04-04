declare const Deno: {
  env: { get: (key: string) => string | undefined }
}

export const getEnv = (key: string) => (Deno.env.get(key) || '').trim()

export const requireEnv = (key: string) => {
  const value = getEnv(key)
  if (!value) {
    throw new Error(`missing_env_${key}`)
  }
  return value
}

