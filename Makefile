.PHONY: help start stop deploy test clean status upgrade frontend init-data dev

help:
	@echo "HomeFax — Available commands:"
	@echo "  make start      Start local dfx replica"
	@echo "  make stop       Stop dfx replica"
	@echo "  make deploy     Deploy all canisters locally"
	@echo "  make test       Run backend tests"
	@echo "  make frontend   Start frontend dev server"
	@echo "  make status     Show canister status"
	@echo "  make upgrade    Upgrade all canisters"
	@echo "  make dev        Start replica, deploy canisters, and run frontend"
	@echo "  make clean      Clean local dfx state"

dev:
	dfx start --background && bash scripts/deploy.sh && cd frontend && npm run dev

start:
	dfx start --background

stop:
	dfx stop

deploy:
	bash scripts/deploy.sh

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
