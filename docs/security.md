# Sécurité — Jean XXIII CRM

État des protections **dans ce dépôt**, limites assumées, et procédures
d'investigation côté serveur.

## En place

### Comptes et sessions

| Mesure | Détail |
| --- | --- |
| Mots de passe | `bcryptjs` (12 facteurs par défaut via `genSalt(10)`), jamais stockés en clair |
| Politique de mot de passe | regex minimale appliquée à la création et à chaque changement (`passwordRegex` dans `utils/validators.ts`) |
| Session | JWT signé HS256, secret `JWT_SECRET` **obligatoire ≥ 32 caractères** — le backend refuse de démarrer sinon |
| Expiration | 2 h (login) / 6 h (ré-authentification mode Salon) |
| Anti-énumération | login : hash `bcrypt` factice quand l'email est inconnu, message identique ; « mot de passe oublié » répond toujours `200` sans révéler l'existence du compte |
| Réinitialisation | token UUID **stocké haché (SHA-256)** en base, expiration 1 h, supprimé après usage ; le lien n'est envoyé que si le paramètre `password_reset_enabled` est actif |
| Vérification d'algorithme | `jwt.verify(..., { algorithms: ["HS256"] })` — pas de confusion d'algorithme |
| Audit | toute action CRUD sensible journalisée dans `audit_logs` (`user_id`, action, ressource, détail) |

### Limitation de débit

- **Applicatif** (`express-rate-limit`, clés sur IP **réelle** grâce à
  `TRUST_PROXY=true` + `X-Forwarded-For` posé par nginx) :
  - `POST /api/users/login` : **60 req / 30 min par IP** + **10 req / 30 min par email** ;
  - `POST /api/users/forgot-password` : 30 / 30 min par IP + 10 / 30 min par email ;
  - `POST /api/users/reset-password` : 30 / 30 min par IP ;
  - `POST /api/webhooks/wordpress` : 60 / 15 min par IP (brute-force du secret).
- **Edge nginx** : fail2ban avec jail `nginx-limit-req` (voir README, section
  Fail2ban).

### Entrées et erreurs

- Corps JSON plafonné à **1 Mio** (`express.json({ limit: "1mb" })`).
- Les erreurs 500 renvoient un message **générique** ; le détail et la stack ne
  partent que dans les logs serveur (`console.error`).
- `x-powered-by` désactivé.
- 404 JSON uniforme sur les routes `/api` inconnues.

### Secrets et webhook

- Secrets injectés via `.env` (jamais versionné, `.dockerignore` l'exclut des
  images). `.env.example` sert de référence.
- Comparaison du `x-webhook-secret` **en temps constant** (SHA-256 +
  `crypto.timingSafeEqual`).
- `JWT_SECRET` validé au démarrage (longueur), échec immédiat sinon.

### CORS

Restreint à `FRONTEND_URL` (pas de `*`), méthodes et en-têtes limités.

### Conteneurs (prod)

| Mesure | Backend | Frontend | DB |
| --- | --- | --- | --- |
| Utilisateur non-root | `USER node` | `USER node` | utilisateur `mysql` |
| `cap_drop: ALL` | ✅ | ✅ | — |
| `no-new-privileges` | ✅ | ✅ | ✅ |
| Système de fichiers | `read_only` + `tmpfs /tmp` | écriture limitée (cache Next) | volume dédié |
| Ports hôte | aucun | aucun | aucun |
| Réseau | `internal` + `proxy-net` | `internal` + `proxy-net` | `internal` uniquement |
| Healthcheck | `/healthz` (ping DB) | `GET /` | `healthcheck.sh` |
| `dump.sql` | — | — | monté en lecture seule |

Les services ne sont joignables que via le proxy nginx (réseau `proxy-net`),
jamais depuis l'hôte ou Internet.

### Limitation de dépendances

- `npm audit --omit=dev` doit rester à **0 vulnérabilité** (`make audit`).
- Dependabot : mises à jour groupées hebdomadaires backend / frontend /
  GitHub Actions (`.github/dependabot.yml`).
- Images Docker multistage : les dépendances de dev sont purgées
  (`npm prune --omit=dev`) ou absentes (sortie standalone Next).

## Limites assumées

| Sujet | État |
| --- | --- |
| Stockage du JWT | `localStorage` côté client : un XSS réussi vole le token. Atténué par l'absence d'injection de HTML utilisateur et par la durée courte (2 h). La migration vers un cookie `httpOnly` est le chantier recommandé |
| CSRF | pas de jeton CSRF — le JWT voyage dans l'en-tête `Authorization`, pas en cookie : les requêtes cross-site ne portent pas le token |
| CSP | pas de `Content-Security-Policy` stricte au niveau applicatif ; à poser côté nginx (voir ci-dessous) après test |
| Révocation de JWT | un token volé reste valide jusqu'à expiration ; pas de liste noire |
| HTTPS | terminé par nginx (certbot) ; HSTS à activer côté nginx |
| `/api/settings/:key` | lecture publique (booléen) — assumé, ne jamais y stocker de secret |
| Dump initial | `dump.sql` sert à initialiser un volume vide ; ne contient que le schéma, jamais de données |

## Recommandations nginx (hors dépôt, à poser dans `conf.d`)

```nginx
# snippets/security-headers.conf
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options DENY always;
add_header Referrer-Policy same-origin always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
# CSP : à tester en amont, puis ajouter :
# add_header Content-Security-Policy "default-src 'self'; frame-ancestors 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'" always;
```

## À ne pas faire

- Ne jamais renvoyer de stack, de message d'erreur interne ou de détail de
  schéma au client (le handler global s'en charge).
- Ne jamais concaténer du SQL depuis une entrée utilisateur : requêtes
  préparées uniquement.
- Ne jamais logger un mot de passe, un token de reset ou un secret.
- Ne jamais committer `.env`, `dump.sql` avec données, ni aucun secret.
- Ne pas rouvrir `cors()` sans restriction d'origine.
- Ne pas retirer `USER node` des Dockerfiles de prod.

## Maintenance courante (serveur)

Commandes d'exploitation (à usage interne, pas dans le README public).

### Proxy (nginx + certbot)

```sh
make proxy-up / proxy-down / proxy-restart / proxy-status    # cycle de vie
make proxy-logs / proxy-logs-error                           # logs des 2 conteneurs
docker exec nginx-proxy-prod nginx -t                        # test config
docker exec nginx-proxy-prod nginx -s reload                 # reload conf
```

> **Recharger nginx après chaque déploiement de l'app** : `docker compose
> build` recrée les conteneurs et leurs IP sur `proxy-net` changent. La conf
> `proxy_pass http://frontend-jeanxxiii-crm-prod:3000` résout le nom **une
> seule fois** au chargement — sans reload, nginx pointe sur une IP morte et
> renvoie des 502 malgré des healthchecks verts. Solution durable : déclarer
> `resolver 127.0.0.11 valid=30s;` et passer par une variable
> (`set $upstream http://...; proxy_pass $upstream;`) pour une résolution
> dynamique. Le workflow `deploy.yml` fait le reload automatiquement.

### Fail2ban

```sh
sudo fail2ban-client status                          # tous les jails
sudo fail2ban-client status nginx-limit-req          # jail + bans
make f2b-status / f2b-banned                         # raccourcis
make f2b-unban IP=x.x.x.x                            # débannir
sudo fail2ban-client set nginx-limit-req addignoreip x.x.x.x   # whitelist runtime
# whitelist persistante : /etc/fail2ban/jail.local → ignoreip puis
# sudo systemctl restart fail2ban
```

### Certificats et logs

```sh
make cert-renew / cert-renew-dry                     # renew + reload nginx / dry-run
sudo logrotate -d /etc/logrotate.d/nginx-docker      # dry-run rotation
sudo logrotate -f /etc/logrotate.d/nginx-docker      # forcer la rotation
```

## Surveillance et investigation du serveur

Commandes à exécuter **sur le serveur** (en tant que `jeanxxiii-apps`, avec
`sudo` pour l'audit système).

### 1. Conteneurs et réseau Docker

```sh
# État global, redémarrages, santé
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker inspect --format '{{.Name}} → {{if .State.Health}}{{.State.Health.Status}}{{else}}pas de healthcheck{{end}}' $(docker ps -aq)

# Qui a accès à quoi : réseaux et IP de chaque conteneur
docker inspect --format '{{.Name}} - {{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $(docker ps -q)
docker network ls && docker network inspect proxy-net internal

# Événements récents (créations/suppressions de conteneurs, attaches)
docker events --since 72h

# Images présentes et dates
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.CreatedSince}}\t{{.Size}}"

# Processus visibles dans chaque conteneur (binaires inattendus ?)
for c in $(docker ps -q); do echo "== $(docker inspect -f '{{.Name}}' $c)"; docker top $c; done
```

### 2. Logs

```sh
# Logs app (erreurs incluses)
docker compose -f docker-compose.prod.yml logs --tail 200 backend-jeanxxiii-crm frontend-jeanxxiii-crm

# Tentatives de connexion : 401 = mauvais identifiants, 429 = rate limit atteint
docker compose -f docker-compose.prod.yml logs backend-jeanxxiii-crm | grep -E "401|429" | tail -50

# Accès nginx : classement des IP les plus actives (botnets, scans)
sudo awk '{print $1}' /home/jeanxxiii-apps/nginx/logs/access.log | sort | uniq -c | sort -rn | head -20

# Requêtes suspectes (admin, env, shell, etc.)
sudo grep -Ei "wp-admin|\.env|shell_exec|/etc/passwd|\.php|union select" /home/jeanxxiii-apps/nginx/logs/access.log | tail -30
```

### 3. Connexions et processus

```sh
# Connexions réseau établies/écoutes, avec le process associé
sudo ss -tulpn
sudo ss -tanp | grep ESTAB

# Processus hors conteneurs (un mineur/backdoor tourne en root ?)
ps auxf --sort=-%cpu | head -30
sudo lsof -i -P -n | grep -vE "docker|sshd|nginx"

# Crons système et utilisateur (tâche parasite ?)
sudo crontab -l; sudo ls -la /etc/cron.* ; crontab -l
sudo ls -la /var/spool/cron/crontabs
```

### 4. Comptes, connexions, authentification

```sh
# Connexions récentes et échecs (SSH)
last -a -20
sudo lastb -a -20

# Sessions en cours
who && w

# Utilisateurs avec un shell (un nouveau compte ?
sudo grep -E "sh$" /etc/passwd
sudo getent shadow | awk -F: '$2 != "*" && $2 !~ /^!/ {print $1}'   # comptes avec mot de passe

# Groupes sensibles
sudo getent group sudo docker

# Historique des sudo
sudo grep -E "COMMAND" /var/log/auth.log 2>/dev/null | tail -30 || sudo journalctl _COMM=sudo --since "3 days ago"
```

### 5. Fail2ban et pare-feu

```sh
sudo fail2ban-client status
sudo fail2ban-client status nginx-limit-req
sudo fail2ban-client status sshd
sudo zgrep "Ban " /var/log/fail2ban.log* 2>/dev/null | tail -30

# Règles iptables appliquées par fail2ban
sudo iptables -L -n | grep -A5 f2b
```

### 6. Base de données

```sh
# Connexions actives et requêtes en cours
docker exec db-jeanxxiii-crm-prod mariadb -u root -p"$MYSQL_ROOT_PASSWORD" -e "SHOW PROCESSLIST;"

# Utilisateurs déclarés en base (un compte inconnu ?)
docker exec db-jeanxxiii-crm-prod mariadb -u root -p"$MYSQL_ROOT_PASSWORD" -e "SELECT id, email, role, created_at FROM ${MYSQL_DATABASE:-crm}.users ORDER BY created_at DESC LIMIT 20;"

# Dernières actions d'audit (le CRM journalise les CRUD)
docker exec db-jeanxxiii-crm-prod mariadb -u root -p"$MYSQL_ROOT_PASSWORD" -e "SELECT a.created_at, u.email, a.action, a.resource FROM ${MYSQL_DATABASE:-crm}.audit_logs a LEFT JOIN ${MYSQL_DATABASE:-crm}.users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 30;"

# Taille des tables (prospects ajoutés en masse ?)
docker exec db-jeanxxiii-crm-prod mariadb -u root -p"$MYSQL_ROOT_PASSWORD" -e "SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema='${MYSQL_DATABASE:-crm}' ORDER BY table_rows DESC;"
```

### 7. Fichiers modifiés récemment

```sh
# Modifications hors volumes Docker dans les 7 derniers jours
sudo find /etc /home /tmp /var/tmp /usr/local/bin -type f -mtime -7 2>/dev/null | grep -vE "/var/log|/var/lib|/var/cache" | head -50

# Binaires exécutables dans /tmp et /var/tmp (drop classique)
sudo find /tmp /var/tmp /dev/shm -type f -perm -u+x 2>/dev/null

# Binaires setuid inhabituels
sudo find / -xdev -type f -perm -4000 2>/dev/null
```

### 8. Surfaces exposées

```sh
# Ports ouverts sur toutes les interfaces
sudo ss -tulpn | grep -E "0.0.0.0|:::" 
# En prod, seuls 80/443 (nginx) et 22 (SSH) devraient être en 0.0.0.0.
# Si 3306 ou 5000 apparaissent, c'est anormal.

# Vérifier que les ports Docker sont bien liés à 127.0.0.1 (pas 0.0.0.0)
docker port $(docker ps -q) 2>/dev/null
```

### Que faire si quelque chose est confirmé

1. **Isoler** : `docker compose -f docker-compose.prod.yml stop` (l'app),
   garder les volumes et images pour l'analyse.
2. **Figer les preuves** : `sudo tar czf /tmp/forensics-$(date +%s).tgz
   /home/jeanxxiii-apps/nginx/logs` et un dump des logs Docker.
3. **Bannir** : `sudo fail2ban-client set nginx-limit-req banip <IP>`.
4. **Changer les secrets** : `JWT_SECRET`, mots de passe DB, `WEBHOOK_SECRET`,
   SMTP, L'Express (`.env` puis `make prod-restart`).
5. **Ne pas supprimer** de volume (`db_data_prod`) avant d'avoir identifié la
   cause.
