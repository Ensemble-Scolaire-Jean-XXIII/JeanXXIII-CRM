# Déploiement — Jean XXIII CRM

Le dépôt contient l'application (db + backend + frontend). Le reverse proxy
(nginx + certbot) et fail2ban vivent **hors dépôt**, sur le serveur
(`/home/jeanxxiii-apps/nginx`, `~/.`). Les commandes d'exploitation sont
résumées dans le [README](../../README.md).

## Démarrer

```sh
cp .env.example .env      # renseigner tous les secrets (JWT_SECRET ≥ 32 car.)
make prod-build           # images multistage (Dockerfile.prod)
make prod-up              # db → backend → frontend (healthchecks en chaîne)
```

Réponses : nginx (`proxy-net`) route vers `frontend-jeanxxiii-crm-prod:3000`
et `/api` vers `backend-jeanxxiii-crm-prod:5000`. Aucun port hôte n'est publié
par l'app.

Le backend **refuse de démarrer** si `JWT_SECRET` manque ou fait moins de
32 caractères ; le module mail exige `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`.

## Variables

| Variable | Rôle | Env |
| --- | --- | --- |
| `FRONTEND_PORT` / `BACKEND_PORT` / `DB_PORT` | ports hôtes exposés en **dev uniquement** | dev |
| `NEXT_PUBLIC_API_URL` | URL de l'API vue par le navigateur (dev) | dev |
| `MYSQL_ROOT_PASSWORD` | root MariaDB (sauvegardes) | dev + prod |
| `MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` | base applicative | dev + prod |
| `FRONTEND_URL` | origine publique : liens email + **CORS** | dev + prod |
| `JWT_SECRET` | **obligatoire**, ≥ 32 car. (`openssl rand -hex 32`) | dev + prod |
| `TRUST_PROXY` | `true` en prod (posé par le compose) : lire `X-Forwarded-For` (IP réelle pour les rate limits). Jamais en dev | prod |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | relais mail | dev + prod |
| `LEXPRESS_API_URL` / `LEXPRESS_USER` / `LEXPRESS_API_KEY` | API L'Express | dev + prod |
| `WEBHOOK_SECRET` | secret du webhook WordPress | dev + prod |

> Si une clé manque dans `.env`, compose utilise silencieusement un **défaut**.
> Comparer avec `.env.example` : c'est la référence.

## Services (prod)

| Service | Conteneur | Santé | Réseaux |
| --- | --- | --- | --- |
| `db-jeanxxiii-crm` | `db-jeanxxiii-crm-prod` | `healthcheck.sh --connect --innodb_initialized` | `internal` |
| `backend-jeanxxiii-crm` | `backend-jeanxxiii-crm-prod` | `GET /healthz` (ping DB) | `internal` + `proxy-net` |
| `frontend-jeanxxiii-crm` | `frontend-jeanxxiii-crm-prod` | `GET /` (Node fetch) | `internal` + `proxy-net` |

Durcissement : utilisateurs non-root, `cap_drop: ALL` (backend/frontend),
`no-new-privileges`, backend en `read_only` + `tmpfs /tmp`, `dump.sql` en
lecture seule, limites mémoire (`deploy.resources.limits`).

> **Données** : tout vit dans le volume `db_data_prod`. Un
> `docker compose -f docker-compose.prod.yml down -v` **détruit la base**.
> Le `down` simple conserve le volume.

## Commandes

```sh
make prod-up / prod-down / prod-build / prod-logs / prod-restart
make prod-ps          # état des conteneurs
make prod-health      # statut des healthchecks
make prod-pull        # mettre à jour l'image mariadb:10.11 (patchs)
make audit            # npm audit (prod) backend + frontend — doit rester à 0
```

## Mise à jour (déploiement)

Le workflow GitHub Actions `deploy.yml` (runner self-hosted) déclenche sur
push `main` : `git pull` → `make prod-down` → build `--no-cache` → `make
prod-up` → `docker image prune -f`. Manuellement :

```sh
cd /home/jeanxxiii-apps/jeanxxiii-crm
git pull origin main
make prod-down
docker compose -f docker-compose.prod.yml build --no-cache
make prod-up
docker image prune -f
```

Après un changement de `.env` : `make prod-restart` (les variables sont lues
au démarrage).

## Sauvegarde et restauration

```sh
# Dump complet (schéma + données), horodaté
docker exec db-jeanxxiii-crm-prod mariadb-dump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction "$MYSQL_DATABASE" | gzip > backups/crm-$(date +%F).sql.gz

# Restauration (sur un volume vide, ou après purge)
gunzip -c backups/crm-<date>.sql.gz | docker exec -i db-jeanxxiii-crm-prod mariadb -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"
```

Stocker les dumps **hors dépôt** (le dossier `backups/` est gitignoré, ne pas
le publier) et en vérifier régulièrement la restauration.

## Proxy, TLS, fail2ban (hors dépôt)

- nginx + certbot : `make proxy-up/down/restart/status` (depuis le dépôt
  nginx), `nginx -t` puis `nginx -s reload` après modification de `conf.d`.
  Les upstreams sont résolus dynamiquement (`resolver 127.0.0.11`), donc un
  redéploiement de l'application ne nécessite aucun reload.
- Certificats : `make cert-renew` (renew + reload), `make cert-renew-dry`.
- fail2ban : `make f2b-status` / `make f2b-banned` / `make f2b-unban IP=...`.
- Rotation des logs nginx : `/etc/logrotate.d/nginx-docker`.
- Détail complet : [security.md](security.md).

## CI/CD et dépendances

- `deploy.yml` : CD auto vers la prod (voir plus haut).
- `auto-pr.yml` : ouvre une PR `→ main` pour toute branche hors main.
- Dependabot : groupes hebdomadaires npm (backend, frontend) et
  github-actions (`open-pull-requests-limit`).
- Avant de merger une PR de dépendances : `make audit`, build local
  (`npm run build` front, `npx tsc --noEmit` back), puis vérifier
  `make prod-health` après le déploiement.
