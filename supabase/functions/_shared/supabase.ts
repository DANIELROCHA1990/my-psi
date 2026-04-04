import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { getEnv } from './env.ts'

export const getSupabaseConfig = () => {
  const supabaseUrl = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL')
  const anonKey = getEnv('SUPABASE_ANON_KEY') || getEnv('VITE_SUPABASE_ANON_KEY')
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('SERVICE_ROLE_KEY')

  if (!supabaseUrl || !anonKey || !serviceKey) {
    throw new Error('supabase_secrets_not_configured')
  }

  return { supabaseUrl, anonKey, serviceKey }
}

export const getAuthClient = (token: string) => {
  const { supabaseUrl, anonKey } = getSupabaseConfig()
  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  })
}

export const getAdminClient = () => {
  const { supabaseUrl, serviceKey } = getSupabaseConfig()
  return createClient(supabaseUrl, serviceKey)
}

