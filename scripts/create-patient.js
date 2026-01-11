#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'

const parseArgs = (argv) => {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      continue
    }
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      args[key] = true
      continue
    }
    args[key] = next
    i += 1
  }
  return args
}

const parseBool = (value) => {
  if (value === undefined) {
    return undefined
  }
  const normalized = String(value).toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

const printUsage = () => {
  console.log(`Usage:
  node scripts/create-patient.js --full-name "Patient Name" [options]

Options:
  --data '{"full_name":"Patient Name","session_price":180}'
  --full-name "Patient Name"
  --email "email@example.com"
  --phone "11999999999"
  --birth-date "1990-01-01"
  --cpf "00000000000"
  --city "Sao Paulo"
  --state "SP"
  --zip-code "00000-000"
  --session-frequency "weekly"
  --session-price "180"
  --active true|false
  --user-id "<auth.users uuid>" (required when using service role key)

Env:
  VITE_SUPABASE_URL or SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY (optional)
  If no service role key:
    VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY
    SUPABASE_EMAIL and SUPABASE_PASSWORD
`)
}

const run = async () => {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || args.h) {
    printUsage()
    process.exit(0)
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  if (!supabaseUrl) {
    console.error('Missing SUPABASE_URL')
    process.exit(1)
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!serviceRoleKey && !anonKey) {
    console.error('Missing SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey || anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  if (!serviceRoleKey) {
    const email = process.env.SUPABASE_EMAIL
    const password = process.env.SUPABASE_PASSWORD
    if (!email || !password) {
      console.error('Missing SUPABASE_EMAIL or SUPABASE_PASSWORD for sign-in')
      process.exit(1)
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      console.error('Sign-in failed:', error.message)
      process.exit(1)
    }
  }

  let patientData = {}
  if (args.data) {
    try {
      patientData = JSON.parse(args.data)
    } catch (error) {
      console.error('Invalid JSON for --data')
      process.exit(1)
    }
  } else {
    const fullName = args['full-name'] || args.fullName
    if (!fullName) {
      printUsage()
      process.exit(1)
    }

    patientData = {
      full_name: fullName,
      email: args.email,
      phone: args.phone,
      address: args.address,
      birth_date: args['birth-date'],
      cpf: args.cpf,
      city: args.city,
      state: args.state,
      zip_code: args['zip-code'],
      emergency_contact: args['emergency-contact'],
      emergency_phone: args['emergency-phone'],
      medical_history: args['medical-history'],
      current_medications: args['current-medications'],
      therapy_goals: args['therapy-goals'],
      session_frequency: args['session-frequency'],
      session_price: args['session-price'] ? Number(args['session-price']) : undefined,
      active: parseBool(args.active)
    }
  }

  if (serviceRoleKey) {
    const userId = args['user-id'] || process.env.SUPABASE_USER_ID
    if (!userId) {
      console.error('Missing --user-id (or SUPABASE_USER_ID) for service role insert')
      process.exit(1)
    }
    patientData.user_id = userId
  }

  const { data, error } = await supabase
    .from('patients')
    .insert([patientData])
    .select()
    .single()

  if (error) {
    console.error('Failed to create patient:', error.message)
    process.exit(1)
  }

  console.log('Patient created:', data.id)
}

run()
