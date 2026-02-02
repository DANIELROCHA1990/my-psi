import { createClient } from '@supabase/supabase-js'

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const normalizeSupabaseUrl = (value: string) =>
  value.replace(/\/(rest|functions)\/v1\/?$/i, '').replace(/\/+$/, '')

const supabaseUrl = rawSupabaseUrl ? normalizeSupabaseUrl(rawSupabaseUrl) : ''

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
