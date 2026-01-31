# MyPsi

## Web Push (FCM) - Configuracao rapida

### 1) Variaveis de ambiente (frontend)
Adicionar ao `.env`:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_VAPID_KEY=...
```

### 2) Variaveis de ambiente (Supabase Edge Functions)
Configurar no Supabase (secrets das functions):

```
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
APP_TIMEZONE=-03:00
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

> Importante: mantenha o `\n` na `FIREBASE_PRIVATE_KEY`.

### 3) Service Worker do FCM
Edite `public/firebase-messaging-sw.js` e substitua `REPLACE_ME` pelos mesmos valores do Firebase.

### 4) Migracoes
Aplique a migration `supabase/migrations/20260131120000_add_push_notifications.sql`.

### 5) Gerar link de consentimento (paciente)
Execute no SQL editor do Supabase:

```
select create_push_consent_token('<patient_id>') as consent_token;
```

Compartilhe o link com o paciente:

```
https://SEU_DOMINIO/notificacoes?consent=CONSENT_TOKEN
```

## Como testar

1. Abra o link `/notificacoes` no navegador do paciente e clique em **Ativar lembretes**.
2. No painel interno, abra **Agenda** e clique em **Preparar agenda**.
3. Escolha a data e envie. O modal mostra contagem de pacientes, tokens, envios OK e falhas.
4. Logs ficam em `push_notifications_log`.

## Observacoes
- A inscricao e desinscricao usam RPCs seguras (`register_push_subscription`, `disable_push_subscription`).
- Tokens invalidos sao desativados automaticamente.
- O envio consolida horarios: apenas 1 push por paciente por dia.
