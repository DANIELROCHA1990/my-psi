declare module 'https://deno.land/std@0.203.0/http/server.ts' {
  export function serve(
    handler: (request: Request) => Response | Promise<Response>,
    options?: { port?: number; hostname?: string }
  ): void
}

declare module 'https://esm.sh/@supabase/supabase-js@2.45.4' {
  export * from '@supabase/supabase-js'
}

declare module 'npm:nodemailer@6.9.8' {
  const nodemailer: any
  export default nodemailer
}

declare module 'npm:firebase-admin/app' {
  export const cert: any
  export const getApps: any
  export const initializeApp: any
}

declare module 'npm:firebase-admin/messaging' {
  export const getMessaging: any
}

declare function atob(data: string): string
