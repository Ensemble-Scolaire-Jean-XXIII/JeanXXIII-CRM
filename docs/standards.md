# Standards — Jean XXIII CRM

Conventions appliquées dans ce dépôt.

## Formatage

`.editorconfig` : UTF-8, LF, indentation 2 espaces, ligne finale vide.
Pas de Prettier installé ; TypeScript en mode `strict`.

## Nommage et structure

- Backend : un fichier de route par ressource (`routes/<x>Routes.ts`), la
  logique dans `services/<x>Service.ts`, les helpers dans `utils/`.
- Frontend : pages sous `app/<route>/page.tsx`, composants partagés dans
  `app/components/`, état partagé dans `app/contexts/`, appels API dans
  `app/services/`.
- Noms de tables et de colonnes en `snake_case`, champs API en `snake_case`
  (alignés sur MariaDB).

## Côté serveur

- Requêtes SQL **préparées** uniquement ; jamais de concaténation d'entrée
  utilisateur.
- Les erreurs 500 renvoient un message générique ; le détail part dans les
  logs serveur.
- Actions sensibles journalisées dans `audit_logs`.
- Secrets : uniquement via variables d'environnement ; `.env` jamais
  versionné, `.env.example` tenu à jour à chaque nouvelle clé.

## Côté client

- Un seul client HTTP (`frontend/app/lib/api.ts`) ; le token JWT est attaché
  là, pas dans chaque page.
- Pas de HTML utilisateur injecté sans échappement (React échappe par
  défaut ; pour du contenu email contrôlé, utiliser les templates serveur).
- Couleurs et thèmes : uniquement via `globals.css` + `ThemeContext`, pas de
  couleur codée en dur dans les composants.

## Git et exploitation

| Élément | Attendu |
| --- | --- |
| Secrets | jamais committés (`gitleaks` recommandé en pré-commit si outillé) |
| `.env` | local uniquement ; `.env.example` = référence |
| Volumes prod | jamais `down -v` sans sauvegarde explicite |
| Dépendances | `make audit` à 0 avant merge de PR de dépendances |
| Images | `node:20-alpine` multistage, `USER node`, purges dev |
