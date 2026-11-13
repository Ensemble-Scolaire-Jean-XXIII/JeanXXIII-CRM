# Agents — Jean XXIII CRM

Conventions pour reprendre ce dépôt seul. Démarrage rapide : `README.md`.
Détails : `architecture.md`, `api.md`, `deployment.md`, `security.md`,
`workflow.md`. Règles globales : `agents.md` à la racine (elles priment).

## Commandes

| Action | Commande |
| --- | --- |
| Lever le dev | `make dev-up` |
| Logs dev | `make dev-logs` |
| Vérifier | `make audit` + `cd backend && npx tsc --noEmit` + `cd frontend && npm run build` |
| Build prod | `make prod-build` |
| État prod | `make prod-ps` / `make prod-health` |
| Mettre à jour l'image DB | `make prod-pull` |

## Règles du dépôt

1. **Ne pas lire `.env`** : secrets de production. `.env.example` est la
   référence des clés, sans valeurs.
2. **Ne pas committer ni pousser** sans demande explicite (voir `agents.md`
   racine).
3. **Pas de `down -v`** : `db_data_prod` contient toutes les données. Ne
   jamais supprimer le volume sans sauvegarde et accord explicite.
4. **Schéma** : pas de migration versionnée. Toute évolution de schéma doit
   toucher `dump.sql` **et** être appliquée manuellement sur l'existant —
   documenter les deux.
5. **SQL** : requêtes préparées uniquement ; toute action sensible passe par
   `logAction(...)`.
6. **Erreurs** : jamais de stack ni de détail de schéma dans une réponse
   client (le handler global de `index.ts` s'en charge).
7. **Docker prod** : ne pas retirer `USER node`, `cap_drop`, `read_only`, ni
   `HOSTNAME=0.0.0.0` (frontend).
8. **Nouvelle variable d'environnement** : la déclarer dans `.env.example`,
   `docker-compose.prod.yml` (+ dev si nécessaire) et la documenter dans
   `docs/deployment.md`.

## Conventions

- TypeScript strict ; 2 espaces, LF (`.editorconfig`).
- Express 5 : routes fines, logique dans `services/`, validation dans
  `utils/validators.ts`.
- Front : App Router Next 16 ; un seul client HTTP (`app/lib/api.ts`) ;
  états partagés dans `app/contexts/` ; pas de couleur en dur (thèmes).
- Documentation : tout changement de comportement doit être reflété dans
  `docs/` (un fichier par sujet).

## Pièges

- **`.env` ≠ `.env.example`** : comparer avant de conclure à un bug de
  configuration.
- **`TRUST_PROXY`** : sans `true` en prod, les rate limits comptent l'IP du
  proxy, pas celle du client.
- **`dump.sql`** : ne se rejoue jamais sur une base existante.
- **Rate limits** : en dev comme en prod, une rafale peut renvoyer
  `429`/`401` — ce n'est pas un bug.
- **`proxy-net`** : réseau externe créé par le compose nginx ; absent ⇒
  `make prod-up` échoue.
- Après `make prod-up`, vérifier l'ordre : `db` healthy avant `backend`,
  `backend` healthy avant `frontend` (`make prod-health`).
