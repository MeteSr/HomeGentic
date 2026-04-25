# WSL Development Guide

## Syncing from Windows to WSL

The project lives on the Windows filesystem. Use rsync to mirror it into WSL.
**The trailing slash on the source is required** — without it rsync copies the
directory itself into the destination (creating `~/homegentic/homegentic/`)
instead of syncing the contents.

```bash
rsync -av /mnt/c/Users/demet/homegentic/ /home/mrwilliamson/homegentic/ --exclude node_modules --exclude .dfx --exclude .icp/cache
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

Install icp-cli and mops:

```bash
npm install -g @icp-sdk/icp-cli
npm install -g ic-mops
mops install
```

---

## Deploying locally

```bash
cd ~/homegentic

# Deploy all canisters + frontend
bash scripts/deploy.sh
```

The deploy script starts the local ICP network automatically if it isn't already running.

---

## Full reset (when you need a clean slate)

```bash
make clean          # stops network, wipes .icp/cache
bash scripts/deploy.sh   # starts fresh network + deploys everything
```

`make clean` wipes local canister state. Use it when canisters are in a broken
state that a normal re-deploy can't fix.

---

## Internet Identity

The local managed network started by `icp network start -d` automatically provides
Internet Identity as a system canister at the well-known principal
`rdmx6-jaaaa-aaaaa-aaadq-cai`. No separate `deps pull` step is needed.

---

## WSL vs Windows: key differences

| | Windows | WSL |
|---|---|---|
| Node / npm | Windows runtime | Separate Linux runtime |
| node_modules | `C:\Users\demet\homegentic\...` | `~/homegentic/...` (separate install) |
| icp-cli | Not used | Linux binary installed via npm |
| Replica port | N/A | `localhost:4943` |
| Frontend dev server | `localhost:5173` (Vite) | same port, accessible from Windows browser |
