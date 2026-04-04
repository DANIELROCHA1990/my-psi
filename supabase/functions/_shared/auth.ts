import { getAdminClient } from './supabase.ts'

export type AuthContext = {
  userId: string
  token: string
}

export const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || ''
  return authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : ''
}

export const requireAuth = async (token: string): Promise<AuthContext> => {
  if (!token) {
    throw new Error('missing_auth_token')
  }

  const adminClient = getAdminClient()
  const { data, error } = await adminClient.auth.getUser(token)

  if (error || !data?.user?.id) {
    throw new Error('unauthorized')
  }

  return { userId: data.user.id, token }
}

export const requireAuthFromRequest = async (req: Request): Promise<AuthContext> => {
  const token = getBearerToken(req)
  return requireAuth(token)
}
