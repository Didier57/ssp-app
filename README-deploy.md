# Déploiement Docker (GitHub Actions + Portainer sur Synology)

L'image Docker est construite **automatiquement par GitHub Actions** à chaque `git push`
sur `main`, puis publiée sur le **GitHub Container Registry (GHCR)**
(`ghcr.io/didier57/ssp-app:latest`). Le dépôt doit être **public** : l'image est alors
tirable sans authentification depuis le NAS.

## À chaque modification

1. Sur le PC : `git add . && git commit -m "..."` puis `git push`
2. GitHub Actions build l'image (~2-3 min) : onglet **Actions** du dépôt.
3. Sur le NAS (SSH), une fois le workflow vert :
   ```
   docker compose pull
   docker compose up -d --force-recreate
   ```
   La BDD (dans `data/`, volume `/data`) n'est **jamais écrasée**.

## Stack Portainer

Dans Portainer : **Stacks → (stack ssp-app) → Éditeur**, remplacez le compose par le
contenu de `docker-compose.yml` du dépôt, puis **Update the stack** (+ cocher « Pull image »).
Alternative en SSH : mettre ce `docker-compose.yml` dans `/volume1/docker/ssp-app` et faire
`docker compose pull && docker compose up -d`.

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `APP_PORT` | `3001` | Port exposé sur le NAS |
| `JWT_SECRET` | à changer ! | Secret des jetons JWT |
| `DATA_DIR` | `/volume1/docker/ssp-app/data` | Dossier NAS de la BDD |

## Base de données

- Dans le conteneur : `/data/ssp.db` (`DB_PATH`), montée depuis `data/` → `/data`.
  **La BDD de production est dans `data/`, pas dans `backend/`.**
- Au **premier démarrage** d'une BDD vide, l'import du seed `scripts/data.json`
  crée les données et le compte `admin / admin123` (à changer immédiatement).
- Mode WAL : sauvegarder à chaud avec `sqlite3 /data/ssp.db ".backup /volume1/backup/ssp.db"`.

## Accès

API **et** frontend sur le même port : `http://IP_DU_NAS:3001`.
Exposition propre : Reverse Proxy DSM → `localhost:3001` + certificat Let's Encrypt.