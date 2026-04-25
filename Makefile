.PHONY: help start stop deploy deploy-one test clean status upgrade frontend init-data dev dev-full check-motoko

NETWORK ?= local

help:
	@echo "HomeGentic — Available commands:"
	@echo "  make start               Start local ICP network"
	@echo "  make stop                Stop local ICP network"
	@echo "  make deploy              Deploy all canisters (local)"
	@echo "  make deploy-one CANISTER=<name>  Deploy a single canister"
	@echo "  make test                Run backend tests"
	@echo "  make frontend            Start frontend dev server"
	@echo "  make status              Show canister status"
	@echo "  make upgrade             Upgrade all canisters"
	@echo "  make dev                 Start network, deploy canisters, and run frontend"
	@echo "  make dev-full            Full local stack: network + canisters + frontend + voice + dashboard"
	@echo "  make clean               Clean local ICP state"
	@echo "  make check-motoko        Compile-check all Motoko canisters (no network needed)"

dev:
	icp network start -d && bash scripts/deploy.sh && cd frontend && npm run dev

dev-full:
	bash scripts/dev.sh

start:
	icp network start -d

stop:
	icp network stop

deploy:
	bash scripts/deploy.sh $(NETWORK)

deploy-one:
	@test -n "$(CANISTER)" || (echo "Usage: make deploy-one CANISTER=<canister_name>  e.g. make deploy-one CANISTER=payment" && exit 1)
	icp deploy $(CANISTER) -e $(NETWORK)

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
	@grep "^  - name:" icp.yaml | awk '{print $$3}' | grep -v "^frontend$$" | \
	  while read -r c; do echo "=== $$c ==="; icp build "$$c" || exit 1; done
