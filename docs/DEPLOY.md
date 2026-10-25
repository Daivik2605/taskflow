# TaskFlow — deploy to `https://taskflow.jarvisjr.daivik.dev` and install it

Hosting: **Vercel**, a **new, separate project** for TaskFlow. Never touch the `daivik-portfolio` project or repo.
DNS: `daivik.dev` is managed at **Hostinger** (nameservers `athena.dns-parking.com` / `apollo.dns-parking.com`), not at Vercel. So the DNS record is added in Hostinger, not in Vercel.

You will: (A) push the repo, (B) create the Vercel project, (C) add the domain, (D) tell Supabase about the URL, (E) turn off sign-ups, (F) install on both devices, (G) check everything. About 30 minutes, most of it waiting for DNS.

## A. Put the repo on GitHub (you run git)
1. github.com → **New repository** → name `taskflow` → **Private** → no README/.gitignore/licence → Create.
2. In a terminal: `cd ~/Desktop/Daivik/PersonalOS/taskflow`, then `git remote add origin git@github.com:<you>/taskflow.git` (or the https URL GitHub shows), `git add -A && git commit -m "Phase 3: PWA + deploy"`, `git push -u origin main`.
3. `.env.local` is git-ignored, so your keys are not pushed. Check on GitHub that there is no `.env.local`.

## B. Create the Vercel project
1. vercel.com → **Add New… → Project** → **Import** the `taskflow` repo (install the Vercel GitHub app for just that repo if asked).
2. **Project Name:** `taskflow`. **Framework Preset:** Vite (auto-detected). **Root Directory:** leave as is. Build command `npm run build`, output `dist` (already in `vercel.json`).
3. **Environment Variables** (before the first deploy), for **Production, Preview and Development**:
   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://<your-project-ref>.supabase.co` (Supabase → Project Settings → API) |
   | `VITE_SUPABASE_ANON_KEY` | the **anon / publishable** key. Never the `service_role` key or the DB password. |

   These are read at **build** time. If you ever change them, **redeploy** (Deployments → ⋯ → Redeploy) or the old values stay baked in.
4. **Deploy.** When it finishes you get `https://taskflow-<something>.vercel.app`. Open it: you should see the sign-in screen. (Sign-in won't work until step D.)

*CLI alternative:* `npx vercel` in the `taskflow` folder → link to a **new** project named `taskflow` (answer "No" to linking an existing project) → `npx vercel env add VITE_SUPABASE_URL production` (and the anon key) → `npx vercel --prod`.

## C. Add the domain
1. Vercel → project `taskflow` → **Settings → Domains → Add** → `taskflow.jarvisjr.daivik.dev` → Add. Vercel says "Invalid configuration" and shows the record it wants. Use **its** value; it is either `cname.vercel-dns.com` or a project-specific `<random>.vercel-dns-0xx.com`.
2. Hostinger → **hPanel → Domains → `daivik.dev` → DNS / Nameservers → DNS Records → Add Record**:
   | Type | Name | Target / Points to | TTL |
   |---|---|---|---|
   | `CNAME` | `taskflow.jarvisjr` | the value Vercel showed (`cname.vercel-dns.com`) | default (or 3600) |

   Hostinger's Name field is relative to `daivik.dev`, so type `taskflow.jarvisjr`, **not** the full hostname. If a record with that name already exists, edit it instead of adding a second.
3. Check from a terminal: `dig +short CNAME taskflow.jarvisjr.daivik.dev` → should print the Vercel target. Back in Vercel the domain turns green and an HTTPS certificate is issued automatically (usually under 10 minutes; up to an hour if DNS is slow).
4. Open `https://taskflow.jarvisjr.daivik.dev` → sign-in screen with a lock icon.

`jarvisjr.daivik.dev` itself (PersonalOS Home) is a different record for later; this one doesn't affect it.

## D. Supabase: allow the new address
Supabase → your project → **Authentication → URL Configuration**:
- **Redirect URLs → Add URL:** `https://taskflow.jarvisjr.daivik.dev/**`
- **Leave Site URL alone.** The project is shared: Chart Journal and InteractiveDSA use it for their email links. Keep any `http://localhost:…` entries.

Then sign in at the production URL with your normal PersonalOS email and password. The first load also saves the address into `taskflow_settings.taskflow_url` (the app does this itself, only from a real https address, never from localhost, your Mac's LAN address or a preview URL).

## E. Turn off sign-ups (do this after your account exists, which it does)
Supabase → **Authentication → Sign In / Providers** → **User Signups → "Allow new users to sign up" → off** → Save.
- This is project-wide: nobody new can create an account in any PersonalOS app. Existing accounts, including yours, still sign in everywhere.
- The TaskFlow sign-in screen has no sign-up option anyway (a test guards that). This closes the API door too.

## F. Install
**iPhone (Safari only; Chrome on iOS can't install web apps):**
1. Open `https://taskflow.jarvisjr.daivik.dev` in **Safari**, sign in.
2. **Share** (square with arrow) → **Add to Home Screen** → name "TaskFlow" → **Add**.
3. Open it from the home screen: no browser bar, indigo check-mark icon. The session stays signed in.

**Mac:**
- **Safari 17+:** open the URL → **File → Add to Dock…** → Add.
- **Chrome / Edge:** open the URL → the install icon at the right of the address bar (or ⋮ → **Install TaskFlow**).

**Updates:** after a new deploy a banner "A new version of TaskFlow is ready" appears with **Reload**. It never reloads by itself, so it won't interrupt an edit. The installed app also checks hourly.

## G. Check it (the "done when")
1. **Mobile data:** on the iPhone turn **Wi-Fi off**, open the home-screen app: it loads and you're signed in. (HTTPS, public URL.)
2. **Sign-up is refused.** In a terminal (use your real URL and anon key; the email is a throwaway that must not exist):
   ```
   curl -s -X POST "https://<ref>.supabase.co/auth/v1/signup" \
     -H "apikey: <anon key>" -H "Content-Type: application/json" \
     -d '{"email":"nobody-test-123@example.com","password":"Throwaway-123456"}'
   ```
   Expect an error such as `"error_code":"signup_disabled"` / "Signups not allowed". If it returns a user, step E isn't saved.
3. **Sync:** add a task on the phone; it appears on the Mac within a few seconds (and the other way round).
4. **Noindex:** `curl -sI https://taskflow.jarvisjr.daivik.dev | grep -i x-robots-tag` → `noindex, nofollow`; `https://taskflow.jarvisjr.daivik.dev/robots.txt` shows `Disallow: /`.
5. **Settings URL:** Supabase → Table Editor → `taskflow_settings` → `taskflow_url` = `https://taskflow.jarvisjr.daivik.dev`.

## H. Make sure branch previews are not public (Deployment Protection)
Every push to a non-production branch makes a preview URL. It runs your real build against the same Supabase project, so it should not be reachable by strangers.
1. Vercel → project `taskflow` → **Settings → Deployment Protection**.
2. **Vercel Authentication** must be **Enabled**, set to **Standard Protection** (protects Preview deployments and the project's `*.vercel.app` URLs; only your custom domain stays public). *Not* "Only Preview Deployments" turned off, and not disabled.
3. Check it: open a preview URL (Deployments → a non-Production row → Visit) in a **private window**. You should get a Vercel login page, not TaskFlow.
4. Leave **Password Protection** and **Trusted IPs** alone (paid features); Vercel Authentication is enough.
5. Production domain stays public on purpose: that's what the iPhone opens. It's protected by the Supabase sign-in.

## Notes
- **No Content-Security-Policy header** on purpose: a wrong one silently breaks Supabase (https and wss realtime). The other basic headers (nosniff, frame deny, referrer, permissions policy) are in `vercel.json`. If one is added later it must allow `https://<ref>.supabase.co` and `wss://<ref>.supabase.co` in `connect-src`, and be tested on a real build.
- **Service worker** caches only the app shell, never Supabase data. Phase 3.5 adds offline logging.
- **Rollback:** Vercel → Deployments → pick an older Production deployment → ⋯ → **Promote to Production**.
- **Change the icon:** edit `scripts/make-icons.mjs`, run `node scripts/make-icons.mjs`, commit the PNGs in `public/`.
