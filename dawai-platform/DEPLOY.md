# Deploying Dawai — the full platform

This is the whole product: the patient portal, the pharmacy portal and the
admin portal, on one server with one database.

It is **not** a static site. It runs a Hono server, stores data in Postgres,
hashes passwords with argon2 and processes images with sharp. A static host —
Netlify, Vercel's static output, GitHub Pages — can serve the screens but
cannot run the product. That is why the target here is a container host.

Pick **one** of the two paths below. They are equivalent; Fly is fewer clicks,
Render has a friendlier dashboard.

---

## Before either path: three secrets

The server refuses to start in production without these. That is deliberate —
`server/config.ts` fails closed rather than booting with a default that looks
like security and is not.

Generate them on your own machine and keep them somewhere private. **Do not
paste them into a chat, an issue, or a commit.**

```bash
# SESSION_PEPPER — at least 32 characters
openssl rand -base64 48

# STORAGE_ENCRYPTION_KEY — exactly 32 bytes, base64 encoded
openssl rand -base64 32

# ADMIN_PASSWORD — at least 16 characters
openssl rand -base64 24
```

You will also choose:

- `WEB_ORIGIN` and `PUBLIC_APP_URL` — the address the site will answer on,
  e.g. `https://dawai.fly.dev`. Cookies and CORS are bound to it, so it must
  match the real address exactly, including `https://` and no trailing slash.
- `ADMIN_EMAIL` — the first administrator account, created on boot.

---

## Path A — Fly.io

```bash
cd dawai-platform

fly auth login
fly launch --no-deploy --copy-config      # reads fly.toml; keep the app name

# The database. Fly creates it and sets DATABASE_URL for you.
fly postgres create --name dawai-db --region fra
fly postgres attach dawai-db

# The secrets, from the section above.
fly secrets set \
  SESSION_PEPPER='...' \
  STORAGE_ENCRYPTION_KEY='...' \
  WEB_ORIGIN='https://dawai.fly.dev' \
  PUBLIC_APP_URL='https://dawai.fly.dev' \
  ADMIN_EMAIL='you@example.com' \
  ADMIN_PASSWORD='...'

fly deploy
```

`fly.toml` runs `node dist-server/db/migrate.js` as the release command, so the
seven migrations apply before the new version takes traffic. If a migration
fails the deploy aborts and the previous version keeps serving.

### Storage for prescription images — do this second, on purpose

Deploy **without** a volume first and confirm the app works. Everything runs
except uploading a prescription image, which is the one feature that needs a
writable directory.

Then add it:

```bash
fly volumes create dawai_storage --region fra --size 5
```

and add to `fly.toml`:

```toml
[[mounts]]
  source = "dawai_storage"
  destination = "/var/lib/dawai"
```

**Then check one thing.** The container runs as the unprivileged `dawai` user
(see the Dockerfile), and a freshly mounted volume belongs to `root`. If image
upload fails with a permission error after mounting, fix it once:

```bash
fly ssh console -C "chown -R dawai:dawai /var/lib/dawai"
```

This is flagged rather than pre-solved because it depends on how your Fly
version initialises volumes, and guessing here would be guessing about your
data directory.

---

## Path B — Render

1. Push this branch to GitHub.
2. Render → **New → Blueprint** → pick this repository.
3. Set the blueprint's root directory to `dawai-platform`. It reads
   `render.yaml`.
4. Render will ask for the values marked `sync: false` —
   `STORAGE_ENCRYPTION_KEY`, `WEB_ORIGIN`, `PUBLIC_APP_URL`, `ADMIN_EMAIL`,
   `ADMIN_PASSWORD`. Paste the ones you generated above.
5. Apply.

`render.yaml` creates the Postgres database, attaches `DATABASE_URL`, mounts a
5 GB disk at `/var/lib/dawai`, and runs the migrations as `preDeployCommand`.

---

## Verifying the deploy — walk it, do not trust a green tick

A green build only proves the container started. Open the site and do this:

1. **The landing page** shows two doors: «أنا مريض» and «أنا صيدلية».
2. **Register a patient.** You should land on the patient home, and the nav
   should show الرئيسية · أدويتي · طلب جديد · طلباتي · حسابي.
3. **Register a pharmacy.** You should land on the onboarding form, and it
   should refuse to accept requests until the licence is reviewed. That gate
   is correct behaviour, not a bug.
4. **Sign in as the admin** with `ADMIN_EMAIL`. Approve the pharmacy from
   التحقق (the verification queue).
5. **Send a request as the patient**, answer it as the pharmacy, reserve it,
   and read the pickup code.

If step 2 or 3 fails with `relation "..." does not exist`, the migrations did
not run — check the release command's output. That is the exact failure the
first local run hit, and it is always this.

## Once you can sign in

Remove `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the environment. They exist to
create the first account and have no reason to stay.

---

## What is not here

- **A domain.** Both paths give you a `*.fly.dev` / `*.onrender.com` address.
  Pointing a real domain at it is a DNS change on your side, after which
  `WEB_ORIGIN` and `PUBLIC_APP_URL` must be updated to match or sign-in breaks.
- **Backups.** `ops/backup-restore.md` documents the procedure; neither host
  configures it for you.
- **Object storage.** `STORAGE_BACKEND=s3` is supported by the code if you
  outgrow a local disk.
