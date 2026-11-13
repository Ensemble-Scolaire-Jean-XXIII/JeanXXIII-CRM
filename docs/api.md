# API — Jean XXIII CRM

Base : **`/api`**, plus `GET /healthz` (ping base, `503` si indisponible).
Middleware `authenticate` (JWT HS256) monté sur la plupart des préfixes ;
routes publiques : login, forgot/reset-password, `GET /api/settings/:key`,
`GET /api/formations`, `GET /api/countries`, webhook WordPress.

## Routes

### Utilisateurs

| Méthode | Chemin | Garde |
| --- | --- | --- |
| POST | `/api/users/login` | publique, **limitée IP + email** |
| POST | `/api/users/forgot-password` | publique, **limitée IP + email** (gated par `password_reset_enabled`) |
| POST | `/api/users/reset-password` | publique, **limitée IP** (token haché, expiration 1 h) |
| GET | `/api/users` | admin |
| POST | `/api/users` | admin (envoie les identifiants temporaires par email) |
| GET | `/api/users/me` | authentifié |
| PUT | `/api/users/me` | authentifié (changement de mot de passe : ancien mot de passe exigé) |
| PUT | `/api/users/:id` | admin |
| DELETE | `/api/users/:id` | admin |
| POST | `/api/users/reauthenticate` | authentifié (JWT 6 h, mode Salon) |
| POST | `/api/users/:id/reset-password` | admin |

### Prospects

| Méthode | Chemin | Garde |
| --- | --- | --- |
| GET | `/api/prospects` | authentifié (joints statut/pays) |
| GET | `/api/prospects/:id` | authentifié |
| POST | `/api/prospects` | authentifié |
| PUT | `/api/prospects/:id` | authentifié |
| DELETE | `/api/prospects/:id` | authentifié |
| POST | `/api/prospects/:id/send-email` | authentifié (template par id) |

### Statuts, templates, automatisations, formations

| Méthode | Chemin | Garde |
| --- | --- | --- |
| GET / POST | `/api/statuses` | authentifié (POST : admin pour statuts système) |
| GET / PUT / DELETE | `/api/statuses/:id` | authentifié (modif. système : admin ; suppression : personnalisés seulement) |
| GET / POST | `/api/email-templates` | authentifié (nom ≤ 100 car., unique) |
| GET / PUT / DELETE | `/api/email-templates/:id` | authentifié (suppression refusée si utilisé en automatisation) |
| GET / POST | `/api/automations` | authentifié |
| PUT / DELETE | `/api/automations/:id` | authentifié |
| GET | `/api/formations` | publique |
| POST / PUT / DELETE | `/api/formations(/:id)` | authentifié (suppression refusée si référencée) |
| GET | `/api/countries` | publique |

### Paramètres, audit, L'Express, webhook

| Méthode | Chemin | Garde |
| --- | --- | --- |
| GET | `/api/settings/:key` | publique (booléen uniquement — ne jamais y exposer de secret) |
| PUT | `/api/settings/:key` | admin |
| GET | `/api/audit-logs?page=&limit=` | admin |
| POST | `/api/lexpress/sync-latest` | authentifié |
| POST | `/api/lexpress/sync-full` | admin |
| GET | `/api/lexpress/last-sync` | authentifié |
| POST | `/api/webhooks/wordpress` | header `x-webhook-secret` (comparaison en temps constant), **limitée IP** |

## Corps et erreurs

- JSON uniquement, **1 Mio maximum** (`express.json({ limit: "1mb" })`).
- Erreurs : `400` validation, `401` token invalide/absent, `403` rôle
  insuffisant, `404` ressource inconnue, `429` rate limit, `500` générique
  (jamais de détail ni de stack côté client).
- Format : `{ "error": "..." }` ou `{ "message": "..." }` selon les routes.

## Modèle de données

Le schéma vit dans `dump.sql` (schéma initial, pas de système de migration
versionnée). Tables : `users`, `prospects`, `statuses`, `countries`,
`formations`, `email_templates`, `email_automation_rules`,
`email_automation_logs`, `audit_logs`, `settings`, `tokens` (reset de mot de
passe, **hash SHA-256**). Détail des colonnes : voir `TECHNICAL.md`.

## Bonnes pratiques serveur

- Requêtes **préparées** uniquement (`?` + paramètres), jamais de
  concaténation.
- Toute action sensible journalisée dans `audit_logs`
  (`services/auditLogService.ts`).
- Les clés `UPDATE ... SET ${fields}` sont construites depuis des listes
  internes (`userService.updateUser`), jamais depuis des clés client brutes.
