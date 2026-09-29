# Production Cloud Deployment Guide

This guide describes how to deploy the **AI-Powered Smart Email Assistant** stack to the cloud using **Vercel** for the React frontend, **Render** for the FastAPI backend, and **Supabase** for the database.

---

## Step 1: Create a GitHub Repository and Push Code

Initialize a Git repository in the project root directory and push it to GitHub:

1. Create a `.gitignore` file in the root directory if not present:
   ```text
   # Environments
   venv/
   .env
   .env.local

   # Dependencies
   node_modules/
   dist/

   # Python cache
   __pycache__/
   *.pyc
   .pytest_cache/
   ```
2. Run these commands in your project root terminal:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for cloud deployment"
   # Create a new repository on github.com, then run:
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```

---

## Step 2: Deploy the FastAPI Backend to Render

1. Go to [Render](https://render.com/) and log in.
2. Click **New +** and select **Web Service**.
3. Connect your GitHub repository.
4. Set the following settings:
   * **Name:** `smart-email-backend`
   * **Runtime:** `Python`
   * **Root Directory:** `backend` (This is important! It ensures Render runs inside the `/backend` folder).
   * **Build Command:** `pip install -r requirements.txt`
   * **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Click **Advanced** and add the following **Environment Variables**:

| Key | Value | Description |
|---|---|---|
| `JWT_SECRET` | *[Generate a long random secret key]* | Used to sign JWT session tokens. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Token expiration limit. |
| `GOOGLE_CLIENT_ID` | *[Your Google OAuth client ID]* | From Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | *[Your Google OAuth client secret]* | From Google Cloud Console. |
| `GOOGLE_REDIRECT_URI` | `https://YOUR_BACKEND_URL.onrender.com/api/auth/callback` | Render URL + callback path. |
| `GEMINI_API_KEY` | *[Your Google Gemini API key]* | Used for generative AI summaries and replies. |
| `SUPABASE_URL` | `https://ocjtrlioqnbpccjjcizr.supabase.co/rest/v1/` | Copy from local `.env` |
| `SUPABASE_KEY` | `<YOUR_SUPABASE_KEY>` | Copy from local `.env` |
| `DEMO_MODE` | `False` | Run with live email integrations. |
| `FRONTEND_URL` | `https://YOUR_FRONTEND_URL.vercel.app` | Vercel frontend app URL. |

6. Click **Deploy Web Service**.

---

## Step 3: Deploy the React Frontend to Vercel

1. Go to [Vercel](https://vercel.com/) and log in.
2. Click **Add New** -> **Project**.
3. Import your GitHub repository.
4. Configure the Project:
   * **Framework Preset:** `Vite` (automatically detected).
   * **Root Directory:** Click **Edit** and select the `frontend` folder.
5. Add the following **Environment Variable** in Vercel:
   * **Key:** `VITE_API_URL`
   * **Value:** `https://YOUR_BACKEND_URL.onrender.com` (Your Render Web Service URL).
6. Click **Deploy**.

---

## Step 4: Update Google Cloud Console Credentials

To make Google Login work in production:

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Navigate to **APIs & Services** -> **Credentials**.
3. Select your OAuth 2.0 Client ID.
4. Under **Authorized JavaScript origins**, add:
   * `https://YOUR_FRONTEND_URL.vercel.app`
5. Under **Authorized redirect URIs**, add:
   * `https://YOUR_BACKEND_URL.onrender.com/api/auth/callback`
6. Click **Save**.
