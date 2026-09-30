# AI-Powered Smart Email Assistant

A full-stack, AI-powered email workspace automation web application that secure connects to Google Gmail using OAuth 2.0 and processes inbox management using NLP and the Gemini Generative AI API.

This application classifies incoming messages, determines action items, extracts meetings or calendar deadlines, performs OCR text extraction from PDF attachments, schedules queue replies, and renders visual analytics.

---

## Technical Stack

Deployed target is **Supabase**, which is also what Lovable uses natively:

- **Backend:** Supabase Edge Functions (Deno, TypeScript, `Deno.serve`).
- **Database:** Supabase Postgres, with RLS enabled and no policies so only the
  service role can read or write.
- **Frontend:** React (Vite SPA), Tailwind CSS, Framer Motion, Recharts, Axios.
  Served from any static host: Vercel, Netlify, Cloudflare Pages.

No credit card is required at any point. The previous Python/FastAPI backend is
still in `backend/` and still runs locally, but it is not part of the deploy
path. See [docs/DEPLOY_SUPABASE.md](docs/DEPLOY_SUPABASE.md).

---

## Highlight Features

1. **Zero-Config Demo Mode (Fallback sandbox):** Runs out-of-the-box. If Gmail/Google credentials are not set, it simulates a highly realistic email account, sync activities, ML classifications, OCR text extracts, and interactive chats.
2. **AI Email Summarizer:** Extracts key points, deadlines, meeting slots, and urgency.
3. **Smart Priority badge routing:** High (Red), Medium (Orange), Low (Green) urgency indicators.
4. **Interactive OCR Scanner:** Scans PDF file attachments and outputs summaries.
5. **Smart Auto-Repliers:** Draft responses matching tones (Friendly, Professional, Formal) and queue scheduled replies.
6. **Smart Natural Search:** Type plain English searches like "Emails from HR" or "amazon orders".
7. **Analytics widgets:** Pie charts for category shares, bar/line charts for weekly sync load, top senders.

---

## Directory Architecture

```
smart-email-assistant/
  ├── supabase/
  │   ├── migrations/         # Postgres schema + RLS deny-all
  │   ├── config.toml         # function config (verify_jwt = false)
  │   └── functions/api/
  │       ├── index.js        # Deno.serve + router, all 33 endpoints
  │       ├── _shared/        # store, auth, crypto, gemini, gmail, ocr, rules
  │       └── *_test.js       # 37 tests, run with `deno test`
  ├── frontend/               # React SPA, served by Vercel/Netlify/Pages
  ├── backend/                # superseded Python backend, local runs only
  ├── contract/openapi.json   # frozen HTTP contract from the Python backend
  └── docs/DEPLOY_SUPABASE.md
```

<details>
<summary>Superseded Python backend (<code>backend/</code>)</summary>

```
backend/
  ├── app/
  │   ├── auth/          # JWT and User profile middleware resolvers
  │   ├── database/      # in-memory dict store + dead Supabase shim
  │   ├── models/        # Pydantic schemas
  │   ├── routes/        # Auth, Emails, Analytics, OCR, Settings
  │   ├── services/      # Gmail, Gemini, OCR, style learner
  │   ├── config.py
  │   └── main.py
  ├── requirements.txt
  └── Dockerfile
```

Not deployed. Kept because it is the reference the port was written against,
and because it still runs locally for comparison.

</details>

---

## Quick Start

```bash
# 1. Install the CLI and sign in (browser, no key needed)
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# 2. Create the schema, set secrets, deploy
supabase db push
supabase secrets set JWT_SECRET=... CREDENTIAL_ENCRYPTION_KEY=...
supabase functions deploy api --no-verify-jwt

# 3. Point the frontend at the function
cd frontend && cp .env.example .env   # fill in the three values
npm run build
```

Full steps, including the OAuth redirect URI, are in
[docs/DEPLOY_SUPABASE.md](docs/DEPLOY_SUPABASE.md).

The app works without a Gemini key: `localRules.ts` covers summarise, classify
and extract deterministically, so the free tier is genuinely usable.

### Tests

```bash
cd supabase/functions && deno task test     # 37 tests
cd supabase/functions && deno task lint
cd frontend && npm test                     # 23 tests
```

The backend is plain JavaScript, not TypeScript. `deno check` therefore does
not type-check it, so `deno task lint` and the test suite are the only
automated guards.

### Running the old Python backend

Still works, and is the reference the port was checked against:

```bash
cd backend
./venv/bin/python run.py     # API + built UI on http://127.0.0.1:8000
```

<details>
<summary>Legacy instructions (Python backend, MongoDB)</summary>

## Legacy Quick Start (Python backend)

### 1. Configure backend environment

In `backend/.env`, set `DEMO_MODE=True` for sandbox evaluation:

```env
MONGO_URI=mongodb://localhost:27017/smart_email_db
JWT_SECRET=super_secret_jwt_key_123_change_me
ACCESS_TOKEN_EXPIRE_MINUTES=1440
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/callback
GEMINI_API_KEY=your-gemini-api-key
DEMO_MODE=True
```

### 2. Run backend FastAPI server

```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- API Docs URL: [http://localhost:8000/docs](http://localhost:8000/docs).

### 3. Run frontend Vite server

From `/frontend`, download dependencies and start Vite dev server:

```bash
cd frontend
npm install
npm run dev
```
- Dashboard URL: [http://localhost:5173](http://localhost:5173)

## Quick Start Setup (With Docker)

To spin up Frontend, Backend, and a local MongoDB instance in unified network bridge mode, run in workspace root directory:

```bash
docker-compose up --build
```
This serves the application globally:
- Frontend Client: [http://localhost:5173](http://localhost:5173)
- Backend REST API: [http://localhost:8000](http://localhost:8000)
- API OpenAPI Swagger Docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Local MongoDB Instance: `mongodb://localhost:27017/`

</details>
