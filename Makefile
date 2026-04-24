.PHONY: help start stop deploy deploy-one test clean status upgrade frontend init-data dev dev-full check-motoko

NETWORK ?= local

# Prefer icp-cli (new name for dfx); fall back to dfx if icp-cli isn't installed yet.
ICP := $(shell command -v icp-cli 2>/dev/null || command -v dfx 2>/dev/null || echo dfx)

help:
	@echo "HomeGentic — Available commands:"
	@echo "  make start               Start local replica"
	@echo "  make stop                Stop replica"
	@echo "  make deploy              Deploy all canisters in parallel (local)"
	@echo "  make deploy-one CANISTER=<name>  Deploy a single canister"
	@echo "  make test                Run backend tests"
	@echo "  make frontend            Start frontend dev server"
	@echo "  make status              Show canister status"
	@echo "  make upgrade             Upgrade all canisters"
	@echo "  make dev                 Start replica, deploy canisters, and run frontend"
	@echo "  make dev-full            Full local stack: replica + canisters + frontend + voice + dashboard"
	@echo "  make clean               Clean local replica state"
	@echo "  make check-motoko        Compile-check all Motoko canisters (no replica needed)"

dev:
	bash scripts/deploy.sh && cd frontend && npm run dev

dev-full:
	bash scripts/dev.sh

start:
	$(ICP) start --background

stop:
	$(ICP) stop

deploy:
	bash scripts/deploy.sh $(NETWORK)

deploy-one:
	@test -n "$(CANISTER)" || (echo "Usage: make deploy-one CANISTER=<canister_name>  e.g. make deploy-one CANISTER=payment" && exit 1)
	$(ICP) deploy $(CANISTER) --network $(NETWORK)

test:
	bash scripts/test-backend.sh

frontend:
	cd frontend && npm run dev

status:
	bash scripts/status.sh

upgrade:
	bash scripts/upgrade.sh

clean:
	bash scripts/cleanup.sh

init-data:
	bash scripts/init-test-data.sh

check-motoko:
	@jq -r '.canisters | to_entries[] | select(.value.type != "assets") | .key' dfx.json | \
	  while read -r c; do echo "=== $$c ==="; $(ICP) build "$$c" --check || exit 1; done
