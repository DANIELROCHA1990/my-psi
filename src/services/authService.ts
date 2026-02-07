import { supabase } from '../lib/supabase'

const clearSupabaseAuthStorage = () => {
  if (typeof window === 'undefined') return
  const storages = [window.localStorage, window.sessionStorage]

  storages.forEach((storage) => {
    const keys = Object.keys(storage)
    keys.forEach((key) => {
      if (!key) return
      const lowerKey = key.toLowerCase()
      if (lowerKey.startsWith('sb-') && lowerKey.includes('auth-token')) {
        storage.removeItem(key)
      }
      if (lowerKey.includes('supabase.auth')) {
        storage.removeItem(key)
      }
    })
  })
}


export const authService = {
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  },

  async signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    return { data, error }
  },

  async signOut() {
    await supabase.auth.signOut({ scope: 'global' })
    await supabase.auth.signOut({ scope: 'local' })
    clearSupabaseAuthStorage()
    return { error: null }
  },

  async resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    return { error }
  },

  async updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password })
    return { error }
  }
}
