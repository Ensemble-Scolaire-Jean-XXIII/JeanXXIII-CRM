# Workflow — Jean XXIII CRM

## Boucle de développement

```sh
make dev-up        # db (healthcheck) → backend (hot reload) → frontend
make dev-logs
make dev-down
```

Tout tourne sous Docker avec volumes montés (`./backend:/app`,
`./frontend:/app`) : pas de Node local. Le front est sur
`http://localhost:FRONTEND_PORT`, l'API sur `http://localhost:BACKEND_PORT` ;
`NEXT_PUBLIC_API_URL` doit pointer l'API (CORS restreint à `FRONTEND_URL`).

## Vérification

```sh
make audit                      # npm audit (prod) : doit rester à 0
cd backend && npx tsc --noEmit  # types
cd frontend && npm run build    # build Next (standalone)
make dev-build                  # images dev
```

Il n'y a **ni linter ni framework de test** : typecheck + build + audit sont
les seules garanties automatiques.

## Modifier une route

1. Route dans `backend/routes/<entity>Routes.ts`, logique dans
   `backend/services/<entity>Service.ts`.
2. Toute entrée validée (regex email/mot de passe dans `utils/validators.ts`,
   plafond JSON 1 Mio global).
3. SQL : requêtes **préparées** uniquement.
4. Action sensible (CREATE/UPDATE/DELETE) : journaliser via
   `logAction(actorId, action, resource, details)`.
5. Garde : `authenticate` (middleware) + contrôle `req.user.role` là où
   c'est nécessaire.
6. Vérifier : `npx tsc --noEmit`, puis redémarrage (`make dev-restart` n'existe
   pas : `docker compose restart backend-jeanxxiii-crm` en dev).

## Modifier le schéma

Pas de système de migration : le schéma initial est `dump.sql` (root), monté
dans l'image DB et joué **uniquement** sur volume vide.

- Pour un **nouveau déploiement** : modifier `dump.sql` avant la première
  initialisation.
- Pour une **base existante** : appliquer les `ALTER` manuellement
  (`docker exec db-jeanxxiii-crm-prod mariadb ...`) **et** reporter le
  changement dans `dump.sql` pour les prochains volumes neufs.
- Ne jamais faire `down -v` sans sauvegarde : le volume `db_data_prod`
  contient toutes les données.

## Où changer quoi

| Besoin | Fichier |
| --- | --- |
| CORS / origine autorisée | `FRONTEND_URL` (`.env`) + `backend/index.ts` |
| Durée des JWT | `routes/userRoutes.ts` (2 h / 6 h) |
| Rate limits login/reset | `routes/userRoutes.ts` (limiteurs) |
| Variables SMTP | `backend/config/mail.ts` |
| Schéma initial | `dump.sql` |
| Ports et services | `docker-compose.yml` (dev), `docker-compose.prod.yml` (prod) |
| Images prod / utilisateur | `backend/Dockerfile.prod`, `frontend/Dockerfile.prod` |
| Thèmes (couleurs) | `frontend/app/contexts/ThemeContext.tsx` + `globals.css` |
| Garde de routes côté front | `frontend/app/lib/api.ts` + `DashboardWrapper` |

## Git

- Branche `main`, déploiement auto au push (self-hosted runner).
- Toute branche hors `main` ouvre automatiquement une PR (`auto-pr.yml`).
- `.gitignore` exclut `.env`, `node_modules/`, `dist/`, `.next/`, `dump.sql`,
  `nginx/`, `certbot/`, `backups/`.
- **Pas de commit ni de push sans demande explicite** (voir `agents.md`).

## Pièges connus

1. **`HOSTNAME=0.0.0.0`** dans `frontend/Dockerfile.prod` : sans lui, Next
   standalone écoute sur le premier réseau (internal) et nginx reçoit des 502
   via `proxy-net`. Ne pas le retirer.
2. **`proxy-net` externe** : il est créé par le compose nginx ; si absent,
   `make prod-up` échoue (`network proxy-net declared as external`).
3. **CORS** : si le front passe par nginx (même origine) le CORS est inutile ;
   s'il appelle l'API en direct (dev), `FRONTEND_URL` doit matcher l'origine
   du navigateur.
4. **Rate limits** : derrière nginx, `TRUST_PROXY=true` est obligatoire, sinon
   toutes les requêtes partagent l'IP du proxy et le limiteur compte en
   commun.
5. **`dump.sql` ne se rejoue pas** sur une base existante : les changements de
   schéma doivent être appliqués à la main.
6. **README de paquet périmés** — se fier à ce dossier `docs/`.
