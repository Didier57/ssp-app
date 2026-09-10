#!/bin/bash
# ============================================================
# Watchdog de déploiement SSP Openscape
# ------------------------------------------------------------
# Surveille /volume1/docker/ssp-app (dossier monté en Q:\ sur le PC).
# Dès qu'un fichier source change (copie depuis Windows terminée) :
#   1. docker build -t ssp-app:latest .   (dans /volume1/docker/ssp-app)
#   2. recréation du conteneur avec la config compose EXACTE de
#      Portainer, détectée en priorité par les labels du conteneur,
#      sinon en dur : /volume1/docker/portainer/compose/353/v1/docker-compose.yml
# Tout est journalisé dans deploy.log.
#
# IMPORTANT : la stack de référence est celle de Portainer. La compose
# /volume1/docker/ssp-app/docker-compose.yml ne doit PAS être utilisée pour
# `up` (sinon conflit de port avec la stack Portainer).
#
# Éléments exclus de la surveillance (évite les boucles) :
#   data/, .env, Running, deploy.log, .deploy-*
#
# Démarrage au boot du NAS (Planificateur DSM, déclencheur Boot-up) :
#   bash /volume1/docker/ssp-app/deploy-watchdog.sh >/dev/null 2>&1 &
# ============================================================

APP_DIR="/volume1/docker/ssp-app"
LOG="$APP_DIR/deploy.log"
LOCK="$APP_DIR/.deploy-lock"
MARKER="$APP_DIR/.deploy-marker"
INTERVAL=15

# Chemin de repli (stack Portainer 353)
DEFAULT_CFG="/volume1/docker/portainer/compose/353/v1/docker-compose.yml"
DEFAULT_PROJ="ssp-app"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

# Commande compose (v2 puis v1)
COMPOSE_CMD=""
compose() {
  if command -v docker >/dev/null 2>&1; then
    if docker compose version >/dev/null 2>&1; then COMPOSE_CMD="docker compose"; return; fi
    if command -v docker-compose >/dev/null 2>&1; then COMPOSE_CMD="docker-compose"; return; fi
  fi
  COMPOSE_CMD=""
}

# Détecte la config compose de la stack Portainer.
# 1) labels du conteneur ssp-app ; 2) repli sur le chemin en dur.
CTN=""
PROJ=""
CFG=""
detect() {
  CTN=""
  PROJ=""
  CFG=""
  if docker inspect ssp-app >/dev/null 2>&1; then
    CTN="ssp-app"
    CFG="$(docker inspect ssp-app --format '{{ index .Config.Labels "com.docker.compose.project.config_files" }}' 2>/dev/null)"
    PROJ="$(docker inspect ssp-app --format '{{ index .Config.Labels "com.docker.compose.project" }}' 2>/dev/null)"
  fi
  if [ -z "$CFG" ] || [ ! -f "$CFG" ]; then
    CFG="$DEFAULT_CFG"
    [ -z "$PROJ" ] && PROJ="$DEFAULT_PROJ"
  fi
  if [ -f "$CFG" ]; then
    log "Stack ciblée : $CTN — $CFG (projet $PROJ)"
  else
    log "ATTENTION : config compose introuvable ($CFG)"
  fi
}

recreate() {
  if [ -z "$COMPOSE_CMD" ]; then log "docker compose introuvable : recréez le conteneur manuellement"; return 1; fi
  if [ -z "$CFG" ] || [ ! -f "$CFG" ]; then log "Aucune config compose valide pour la recréation"; return 1; fi
  $COMPOSE_CMD --project-name "$PROJ" -f "$CFG" up -d --force-recreate >> "$LOG" 2>&1
}

has_changes() {
  find "$APP_DIR" -type f \
    ! -path "$APP_DIR/data/*" \
    ! -name 'deploy.log' \
    ! -name '.deploy-*' \
    ! -name '.env' \
    ! -name 'Running' \
    ! -name '9da6b4e352d0' \
    ! -name 'cae2aabbb2fa' \
    -newer "$MARKER" \
    | grep -q .
}

deploy() {
  if [ -f "$LOCK" ]; then log "Déploiement déjà en cours, ignoré."; return; fi
  touch "$LOCK"
  log "Changement détecté -> build de l'image"
  if (cd "$APP_DIR" && docker build -t ssp-app:latest . >> "$LOG" 2>&1); then
    if recreate; then
      log "Build OK et conteneur recréé"
    else
      log "BUILD OK mais ERREUR lors de la recréation du conteneur"
    fi
  else
    log "ERREUR lors du build (fichiers peut-être encore en cours de copie) — nouvel essai au prochain changement"
  fi
  touch "$MARKER"
  rm -f "$LOCK"
}

compose
detect
# Au démarrage : s'assure que la stack Portainer tourne (sans rebuild, sans recréation forcée)
if [ -n "$COMPOSE_CMD" ] && [ -n "$CFG" ] && [ -f "$CFG" ]; then
  $COMPOSE_CMD --project-name "$PROJ" -f "$CFG" up -d >> "$LOG" 2>&1 || log "Avertissement démarrage : stack non relancée"
fi
log "Watchdog démarré (intervalle ${INTERVAL}s, dossier $APP_DIR)"

while :; do
  sleep "$INTERVAL"
  if has_changes; then
    deploy
  fi
done