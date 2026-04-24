# WSL Development Guide

## Syncing from Windows to WSL

The project lives on the Windows filesystem. Use rsync to mirror it into WSL.
**The trailing slash on the source is required** — without it rsync copies the
directory itself into the destination (creating `~/homegentic/homegentic/`)
instead of syncing the contents.

```bash
rsync -av /mnt/c/Users/demet/homegentic/ /home/mrwilliamson/homegentic/ --exclude node_modules --exclude .dfx
```

Run this every time you want to pick up changes made on the Windows side.

---

## First-time setup (after initial rsync)

`node_modules` are excluded from rsync, so install them separately in WSL:

```bash
cd ~/homegentic
npm install

cd ~/homegentic/frontend
npm install

cd ~/homegentic/agents/voice
npm install
```

---

## Deploying locally

```bash
cd ~/homegentic

# Pull Internet Identity canister (one-time, after dfx start --clean or make clean)
dfx deps pull
dfx deps deploy

# Deploy all canisters + frontend
bash scripts/deploy.sh
```

The deploy script header prints the current script version, e.g.:
```
HomeGentic — Deployment (local) v1.0.1
```
Use this to confirm you are running the expected version after a sync.

---

## Full reset (when you need a clean slate)

```bash
make clean          # stops dfx, wipes .dfx/local
bash scripts/deploy.sh   # starts fresh replica + deploys everything
```

`make clean` is the only path that rotates the replica root key. Avoid it
unless you need a true reset — key rotation invalidates the Internet Identity
service worker cache and causes a 503 in the II popup until the browser
service worker is unregistered (see below).

---

## Internet Identity 503 "Response Verification Error"

This happens when the browser's cached II service worker has a stale replica
root key (e.g. after `make clean`).

**Fix — unregister the stale service worker:**
1. Navigate to `http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:4943/`
2. Open DevTools → Application → Service Workers
3. Find the worker for `localhost:4943` → click **Unregister**
4. Hard-refresh (`Ctrl+Shift+R`)

---

## WSL vs Windows: key differences

| | Windows | WSL |
|---|---|---|
| Node / npm | Windows runtime | Separate Linux runtime |
| node_modules | `C:\Users\demet\homegentic\...` | `~/homegentic/...` (separate install) |
| dfx | Not used | Linux binary at `~/.local/share/dfx/` |
| Replica port | N/A | `localhost:4943` |
| Frontend dev server | `localhost:5173` (Vite) | same port, accessible from Windows browser |
