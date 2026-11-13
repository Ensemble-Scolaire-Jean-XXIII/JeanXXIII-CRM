COMPOSE_DEV=docker compose -f docker-compose.yml
COMPOSE_PROD=docker compose -f docker-compose.prod.yml

.PHONY: dev-up dev-down dev-build dev-logs
.PHONY: prod-up prod-down prod-build prod-logs prod-restart
.PHONY: prod-ps prod-pull prod-health audit

# --- Dev ---
dev-up:
	$(COMPOSE_DEV) up -d

dev-down:
	$(COMPOSE_DEV) down

dev-build:
	$(COMPOSE_DEV) build

dev-logs:
	$(COMPOSE_DEV) logs -f

# --- Prod (app only, no proxy) ---
prod-up:
	$(COMPOSE_PROD) up -d

prod-down:
	$(COMPOSE_PROD) down

prod-build:
	$(COMPOSE_PROD) build

prod-logs:
	$(COMPOSE_PROD) logs -f

prod-restart:
	$(COMPOSE_PROD) restart

prod-ps:
	$(COMPOSE_PROD) ps

# Met à jour l'image de base MariaDB (patchs de sécurité)
prod-pull:
	$(COMPOSE_PROD) pull

# État des healthchecks des 3 services
prod-health:
	@docker inspect --format '{{.Name}} → {{if .State.Health}}{{.State.Health.Status}}{{else}}no healthcheck{{end}}' \
		db-jeanxxiii-crm-prod backend-jeanxxiii-crm-prod frontend-jeanxxiii-crm-prod

# Audit des dépendances (0 vulnérabilité attendue en production)
audit:
	cd backend && npm audit --omit=dev
	cd frontend && npm audit --omit=dev
