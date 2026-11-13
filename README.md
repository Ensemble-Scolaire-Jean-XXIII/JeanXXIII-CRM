# Jean XXIII Apps — Ops

CRM pour l'Ensemble Scolaire Jean XXIII : prospects, templates email,
automatisations, mode Salon, synchronisation L'Express, webhook WordPress.

- Documentation détaillée : [`docs/`](docs/) — architecture, API, déploiement,
  sécurité, workflow, standards.
- Environnements : `make dev-*` (ports hôtes, hot reload) et `make prod-*`
  (réseau interne + `proxy-net`, aucun port hôte).

## Containers

### Voir les IP de tous les containers
docker inspect --format '{{.Name}} - {{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $(docker ps -q)

### Voir les containers en cours
docker ps
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

## App (jeanxxiii-crm : db/backend/frontend)

### Depuis /home/jeanxxiii-apps/jeanxxiii-crm
make prod-up / prod-down / prod-build / prod-logs / prod-restart
make prod-ps              # état des conteneurs
make prod-health          # statut des healthchecks (db → backend → frontend)
make prod-pull            # met à jour l'image mariadb:10.11 (patchs sécurité)
make audit                # npm audit (deps de prod) — doit rester à 0

make dev-up / dev-down / dev-build / dev-logs

### Mise à jour manuelle (équivalent du déploiement CI)
git pull origin main
make prod-down
docker compose -f docker-compose.prod.yml build --no-cache
make prod-up
docker image prune -f

## Proxy (nginx + certbot)

### Cycle de vie
make proxy-up           # start
make proxy-down         # stop
make proxy-restart      # restart
make proxy-status       # ps
make proxy-net-create   # créer le réseau proxy-net s'il n'existe pas

### Logs
make proxy-logs            # logs les 2 containers
make proxy-logs-error      # grep error/warn
make proxy-logs-nginx      # tail -f error.log (hôte)

### Reload nginx (après modif conf.d)
docker exec nginx-proxy-prod nginx -t           # test config
docker exec nginx-proxy-prod nginx -s reload    # reload

## Fail2ban

sudo fail2ban-client status                     # tous les jails
sudo fail2ban-client status nginx-limit-req     # jail + bans
make f2b-status                                 # raccourci
make f2b-banned                                 # liste des IP bannies
make f2b-unban IP=x.x.x.x                       # débannir
make f2b-unban IP=77.135.208.90                 # débannir réseau Jean23
make f2b-test                                   # 30 requêtes (DEPUIS TON PC, pas le serveur)

### Whitelist une IP (persistant)
# /etc/fail2ban/jail.local → ignoreip = ... puis:
sudo systemctl restart fail2ban
sudo fail2ban-client get nginx-limit-req ignoreip   # vérifier

### Add sans redémarrage (runtime)
sudo fail2ban-client set nginx-limit-req addignoreip x.x.x.x

## Certbot

make cert-renew          # renew + reload nginx
make cert-renew-dry      # dry-run

## Log rotation (nginx)

sudo logrotate -d /etc/logrotate.d/nginx-docker   # dry-run
sudo logrotate -f /etc/logrotate.d/nginx-docker   # force
ls -la /home/jeanxxiii-apps/nginx/logs/

## Sécurité — investigation serveur

Si « des choses étranges » apparaissent, dérouler dans l'ordre
(guide complet dans [`docs/security.md`](docs/security.md#surveillance-et-investigation-du-serveur)) :

```sh
# 1. Conteneurs et santé
docker ps -a --format "table {{.Names}}\t{{.Status}}"
docker events --since 72h

# 2. Qui tape sur l'app et le proxy
docker compose -f docker-compose.prod.yml logs backend-jeanxxiii-crm | grep -E "401|429" | tail -50
sudo awk '{print $1}' /home/jeanxxiii-apps/nginx/logs/access.log | sort | uniq -c | sort -rn | head -20

# 3. Connexions et processus
sudo ss -tulpn | grep -E "0.0.0.0|:::"
sudo ss -tanp | grep ESTAB
ps auxf --sort=-%cpu | head -30
sudo crontab -l; sudo ls -la /etc/cron.*

# 4. Connexions SSH et comptes
last -a -20
sudo lastb -a -20
sudo grep -E "sh$" /etc/passwd
sudo grep -E "COMMAND" /var/log/auth.log | tail -30

# 5. Fail2ban
sudo fail2ban-client status
sudo zgrep "Ban " /var/log/fail2ban.log* | tail -30

# 6. Base : processus, utilisateurs, derniers audits
docker exec db-jeanxxiii-crm-prod mariadb -u root -p"$MYSQL_ROOT_PASSWORD" -e "SHOW PROCESSLIST;"

# 7. Fichiers récents et binaires suspects
sudo find /etc /home /tmp /var/tmp /usr/local/bin -type f -mtime -7 2>/dev/null | grep -vE "/var/log|/var/lib|/var/cache" | head -50
sudo find /tmp /var/tmp /dev/shm -type f -perm -u+x 2>/dev/null
```

### Si une compromission est confirmée

1. `docker compose -f docker-compose.prod.yml stop` (isoler sans détruire)
2. Figer les logs : `sudo tar czf /tmp/forensics-$(date +%s).tgz /home/jeanxxiii-apps/nginx/logs`
3. Bannir : `sudo fail2ban-client set nginx-limit-req banip <IP>`
4. **Changer tous les secrets** (`JWT_SECRET`, mots de passe DB, `WEBHOOK_SECRET`, SMTP, L'Express) puis `make prod-restart`
5. Ne **jamais** `down -v` avant d'avoir compris ce qui s'est passé
