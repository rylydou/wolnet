# Deployment Configuration for Dockge on TrueNAS
STACK_NAME ?= wolnet
REMOTE_HOST ?= root@truenas
REMOTE_STACKS_DIR ?= /mnt/ssd-z1/app/dockge/stacks
REMOTE_DIR ?= $(REMOTE_STACKS_DIR)/$(STACK_NAME)

# Dockge's files belong to the TrueNAS `apps` user. The container itself runs as uid 1000 against a
# named volume (see the Dockerfile and compose.yaml), so this only affects Dockge's own access.
REMOTE_UID_GID ?= 568:568

SSH ?= ssh

# `sync` runs rsync --delete. An empty STACK_NAME would aim it at the stacks root and delete every
# other stack on the server, so refuse to run at all in that case.
ifeq ($(strip $(STACK_NAME)),)
$(error STACK_NAME is empty - refusing to run rsync --delete against $(REMOTE_STACKS_DIR))
endif
ifeq ($(patsubst %/,%,$(strip $(REMOTE_DIR))),$(patsubst %/,%,$(strip $(REMOTE_STACKS_DIR))))
$(error REMOTE_DIR must name a single stack directory, not the stacks root)
endif

# Every remote target is `docker compose` run in the stack directory. ssh joins its command
# arguments with spaces, so each target just appends its subcommand to this.
COMPOSE = $(SSH) $(REMOTE_HOST) "cd '$(REMOTE_DIR)' && docker compose"
COMPOSE_TTY = $(SSH) -t $(REMOTE_HOST) "cd '$(REMOTE_DIR)' && docker compose"

.DEFAULT_GOAL := help
.PHONY: help build sync deploy logs status restart down prune clean distclean

help: ## Show this help menu
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

build: ## Build the image locally as a smoke test (deploy builds on the remote)
	docker build -t $(STACK_NAME):latest .

# compose.yaml is deliberately excluded: Dockge owns the deployed copy (it holds the bind mount and
# the x-dockge block), and the copy in this repo is for local use only. Edit the live one in Dockge.
sync: ## Sync stack files to the remote Dockge stack directory (compose.yaml excluded)
	@echo "Syncing to $(REMOTE_HOST):$(REMOTE_DIR)..."
	$(SSH) $(REMOTE_HOST) "mkdir -p '$(REMOTE_DIR)'; if [ ! -f '$(REMOTE_DIR)/compose.yaml' ]; then echo 'ERROR: compose.yaml is missing on the server - create it in Dockge first, it is no longer synced from this repo' >&2; exit 1; fi"
	rsync -avz --delete --chown=$(REMOTE_UID_GID) \
		--exclude='compose.yaml' \
		--exclude='.git' \
		--exclude='.claude' \
		--exclude='.vscode' \
		--exclude='node_modules' \
		--exclude='.svelte-kit' \
		--exclude='build' \
		--exclude='data' \
		--exclude='.env*' \
		--exclude='.npmrc' \
		--exclude='.DS_Store' \
		--exclude='*.log' \
		./ $(REMOTE_HOST):$(REMOTE_DIR)/

deploy: sync ## Sync stack files, then rebuild and restart the stack on the remote server
	@echo "Deploying $(STACK_NAME) on $(REMOTE_HOST)..."
	$(COMPOSE) up -d --build --remove-orphans --wait --wait-timeout 60

logs: ## Follow logs from the remote container
	$(COMPOSE_TTY) logs -f --tail=100

status: ## Show container status on the remote server
	$(COMPOSE) ps

restart: ## Restart the container on the remote server
	$(COMPOSE) restart

down: ## Stop and remove the stack on the remote server (asks first)
	@printf 'Stop and remove "%s" on %s? [y/N] ' '$(STACK_NAME)' '$(REMOTE_HOST)'; \
	read -r reply; \
	case "$$reply" in [yY]) ;; *) echo "Aborted."; exit 1 ;; esac; \
	$(COMPOSE) down

prune: ## Remove dangling images left behind by rebuilds on the remote server
	$(SSH) $(REMOTE_HOST) "docker image prune -f"

clean: ## Remove local build artifacts
	rm -rf build .svelte-kit

distclean: clean ## Remove local build artifacts and node_modules
	rm -rf node_modules
