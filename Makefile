.PHONY: help start stop deploy deploy-one test clean status upgrade frontend init-data dev dev-full check-motoko

NETWORK ?= local

help:
	@echo "HomeGentic — Available commands:"
	@echo "  make start               Start local icp-cli replica"
	@echo "  make stop                Stop icp-cli replica"
	@echo "  make deploy              Deploy all canisters in parallel (local)"
	@echo "  make deploy-one CANISTER=<name>  Deploy a single canister"
	@echo "  make test                Run backend tests"
	@echo "  make frontend            Start frontend dev server"
	@echo "  make status              Show canister status"
	@echo "  make upgrade             Upgrade all canisters"
	@echo "  make dev                 Start replica, deploy canisters, and run frontend"
	@echo "  make dev-full            Full local stack: replica + canisters + frontend + voice + dashboard"
	@echo "  make clean               Clean local icp-cli state"
	@echo "  make check-motoko        Compile-check all Motoko canisters (no replica needed)"

dev:
	icp-cli start --background && bash scripts/deploy.sh && cd frontend && npm run dev

dev-full:
	bash scripts/dev.sh

start:
	icp-cli start --background

stop:
	icp-cli stop

deploy:
	bash scripts/deploy.sh $(NETWORK)

deploy-one:
	@test -n "$(CANISTER)" || (echo "Usage: make deploy-one CANISTER=<canister_name>  e.g. make deploy-one CANISTER=payment" && exit 1)
	icp-cli deploy $(CANISTER) --network $(NETWORK)

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
	@jq -r '.canisters | to_entries[] | select(.value.type != "assets") | .key' icp-cli.json | \
	  while read -r c; do echo "=== $$c ==="; icp-cli build "$$c" --check || exit 1; done
