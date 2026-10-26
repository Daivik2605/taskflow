# Logging without opening the app: iPhone Shortcuts, Back Tap, Siri, Action button

What this gives you: **double-tap the back of the iPhone = +1 cigarette**, triple-tap = +1 weed, "Hey Siri, log a cigarette", the Action button, and home-screen icons. Each one calls the `taskflow-api` Edge Function with a personal token. The open app updates within a few seconds (realtime).

`<ref>` below is your Supabase project reference: the part before `.supabase.co` in your `VITE_SUPABASE_URL`.

---

## Part 1: Deploy the function (once, on the Mac)

1. Install the Supabase CLI: `brew install supabase/tap/supabase`
2. Log in (opens a browser): `supabase login`
3. Go to the app folder: `cd /Users/daivik/Desktop/Daivik/PersonalOS/taskflow`
4. Link it to your project (press Enter when it asks for the database password; you do not need it): `supabase link --project-ref <ref>`
5. Run the phase 3.6 SQL: Supabase → SQL Editor → New query → paste the whole of `supabase/taskflow_schema.sql` → Run. (Adds `taskflow_api_tokens` and `taskflow_api_log`.)
6. Deploy: `supabase functions deploy taskflow-api --no-verify-jwt`

   `--no-verify-jwt` is required: your personal token is not a Supabase login token, and the function checks the token itself. (`supabase/config.toml` also says so.)
7. Nothing to set: Supabase gives the function `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` itself. **Never** put the service-role key in the app, `.env.local`, a Shortcut or the repo.

Redeploy after any change to `supabase/functions/taskflow-api/` with the same command. Run its tests first: `npm run test:functions`.

## Part 2: Make a token

1. Open TaskFlow → **Settings → Shortcuts**.
2. Type a name (for example `iPhone`) → **Create token**.
3. A green box shows the token (`tfk_…`). **Tap Copy token now.** It is shown once and never again (only a fingerprint is stored).
4. Send it to the iPhone another way than a public link (AirDrop to yourself, or Universal Clipboard: copy on the Mac, paste on the iPhone).
5. To stop a token working: Settings → Shortcuts → **Revoke** → confirm. It is rejected from the next call.

## Part 3: Test it from the Mac

```bash
curl -s -X POST "https://<ref>.supabase.co/functions/v1/taskflow-api/counter" \
  -H "Authorization: Bearer tfk_YOUR_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"cigarette"}'
```
Expected: `{"ok":true,"say":"Cigarette 1 today","counter":"Cigarette","count":1}` and the Cig pill in the open app goes up. After revoking the token, the same command returns HTTP 401 with `"That token isn't valid or was revoked."`.

## What you can call

All are `POST` with a JSON body. The reply is always JSON with `ok` and a short `say` sentence to speak or show.

| Address ends with | Body | Spoken reply |
|---|---|---|
| `/counter` | `{"name":"cigarette"}` (also `"cig"`, `"weed"`; optional `"qty":2`, `"id":"<uuid>"` so a repeat can't double-count) | "Cigarette 4 today" |
| `/capture` | `{"text":"look into pgvector"}` | "Saved to your inbox" (saved as an idea note; the Inbox screen arrives in phase 9) |
| `/timer/start` | `{"preset":"Kriya"}` or `{"tag":"DSA"}` or `{"task":"week 3"}` (optional `"comment"`) | "Timer started on DSA" |
| `/timer/stop` | `{}` or `{"comment":"chapter 3 done"}` | "Stopped DSA, 1 hour 20 minutes" |
| `/activity/log` | `{"name":"Kriya"}` (optional `"minutes":45`) | "Kriya logged, 35 minutes" |

Names are matched loosely (case and a trailing "s" don't matter; a short start like `we` works if it is unique). Limit: 30 calls a minute per token. Your last calls show under Settings → Shortcuts → Recent calls.

---

## Part 4: Build the Shortcuts (on the iPhone)

### 4a. "Log cigarette"
1. Open the **Shortcuts** app → tap **+** (top right) → tap the name at the top → rename to `Log cigarette`.
2. Tap **Add Action** → in the search box type `Get Contents of URL` → tap it.
3. Tap the blue **URL** word → type or paste `https://<ref>.supabase.co/functions/v1/taskflow-api/counter`.
4. Tap the small **>** (Show More) on the action. Set **Method** to **POST**.
5. Tap **Add new header**: Key = `Authorization`, Text = `Bearer tfk_YOUR_TOKEN` (the word Bearer, a space, then the token).
6. Tap **Request Body** → **JSON**. Tap **Add new field** → **Text**: Key = `name`, Text = `cigarette`.
7. Tap the **+** under the action → search `Get Dictionary Value` → tap it. It reads: *Get Value for Key in Dictionary*. Set **Key** to `say` (leave the dictionary as *Contents of URL*).
8. Tap **+** again → search `Show Notification` (quiet; good for Back Tap) → tap it → set the text to the *Dictionary Value* variable. For Siri, use **Speak Text** instead so it talks back.
9. Tap **Done**. Run it once with the play button: a notification says "Cigarette 1 today".

### 4b. "Log weed"
In the Shortcuts list, touch and hold **Log cigarette** → **Duplicate** → rename `Log weed` → open it → change the JSON field `name` to `weed`.

### 4c. More Shortcuts, same shape (Duplicate and change)
- **Start studying:** address ends `/timer/start`, JSON field `tag` = `Study`  (or `preset` = `Kriya`).
- **Stop timer:** address ends `/timer/stop`, no JSON fields (or one field `comment`).
- **Log Kriya:** address ends `/activity/log`, field `name` = `Kriya`.
- **Capture an idea:** address ends `/capture`. Put **Dictate Text** (or **Ask for Input**, type Text) as the first action; in the JSON field `text`, tap the value and choose the *Dictated Text* variable.

If a Shortcut shows an error, add a final action **Show Result** and read the `say` text: it explains (for example "A timer is already running on DSA. Stop it first.").

## Part 5: Back Tap (double = cigarette, triple = weed)

1. iPhone **Settings** → **Accessibility** → **Touch**.
2. Scroll to the bottom → **Back Tap**.
3. Tap **Double Tap** → scroll down to the **Shortcuts** section → tap **Log cigarette**.
4. Tap **< Back Tap** (top left) → **Triple Tap** → **Shortcuts** → **Log weed**.
5. Try it: two quick taps on the back of the phone, near the camera. A notification appears; the Cig pill in the open app rises within a few seconds.

Back Tap needs iPhone 8 or later. A thick case can hide the taps: tap harder, or take the case off to test.

## Part 6: Siri

The phrase is the Shortcut's name. Rename Shortcuts to what you will say:
- "Hey Siri, **log a cigarette**": rename `Log cigarette` to `Log a cigarette` (and `Log weed` to `Log a weed`).
- "Hey Siri, **start studying**", "Hey Siri, **stop timer**", "Hey Siri, **log Kriya**", "Hey Siri, **capture an idea**".
Siri speaks the reply if the last action is **Speak Text**. The first time, Siri asks permission to run it: say or tap **Always Allow**.

## Part 7: Action button (iPhone 15 Pro and later)

1. **Settings** → **Action Button**.
2. Swipe sideways to **Shortcut**.
3. Tap **Choose a Shortcut** → pick `Log cigarette` (or `Start studying`, whatever you want on the button).
4. Press and hold the Action button to run it.

## Part 8: Home-screen icons

1. In **Shortcuts**, open the Shortcut → tap its name at the top → **Add to Home Screen**.
2. Tap the icon to change its colour or glyph → **Add** (top right).
3. One tap on the icon runs it.

---

## Safety

- A token inside a Shortcut is a password to your logging. **Do not share a Shortcut by iCloud link** (the token goes with it).
- Lost phone, or sharing by mistake: Settings → Shortcuts → **Revoke**, then make a new token and paste it into each Shortcut's header.
- A token can only log things and start/stop the timer. It cannot read your tasks, delete anything or see other accounts, and it only ever touches your own rows.
