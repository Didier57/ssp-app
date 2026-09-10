# Application SSP Openscape Business

Application web pour la gestion des clients et des licences **Openscape Business**.

## Fonctionnalités

- **Authentification** par login/mot de passe avec rôles : `admin` (lecture/écriture) et `lecteur` (lecture seule)
- **Tableau clients** : tri par colonne, recherche globale, filtre dédié par colonne, filtres (produit, contrat, expiration)
- **CRUD complet** : ajouter / modifier / supprimer des clients (admin uniquement)
- **Dashboard** : statistiques, graphiques par gamme de produit, expirations à venir
- **Alertes visuelles** : expiration de licence < 90 jours (orange), expirée (rouge)
- **Exports** : Excel, des données filtrées
- **Gestion des utilisateurs** : création, modification (rôle, mot de passe), email, suppression (admin)
- **Menu horizontal en haut** : Dashboard, Clients, Utilisateurs (admin)

## Architecture

| Couche | Technologie |
|---|---|
| Frontend | React 18 + Vite + Recharts |
| Backend | Node.js + Express |
| Base de données | SQLite (`backend/ssp.db`) via better-sqlite3 |
| Auth | JWT + bcrypt |

## Prérequis

- Node.js ≥ 18

## Installation

```bash
npm run install-all
```

## Import des données Excel

Place le fichier source à `c:\temp\Table SSPOSBIZ.xlsx` puis :

```bash
node backend/convert_excel.js     # génère scripts/data.json depuis l'Excel
```

Le premier démarrage du backend importe automatiquement `scripts/data.json` dans SQLite.

## Création du compte administrateur

```bash
node backend/seed-users.js admin votre-mot-de-passe admin
# syntaxe: seed-users.js <username> <password> <role: admin|lecteur>
```

## Authentification

Compte initial par défaut : `admin / admin123` (à changer immédiatement).

Gestion des comptes : menu **Utilisateurs** (réservé à l'admin) — création, modification, email, rôle, mot de passe, suppression.

## Lancement

```bash
npm run dev
```

- Frontend : http://localhost:5173
- Backend API : http://localhost:3001

## API (résumé)

| Méthode | Route | Accès | Description |
|---|---|---|---|
| POST | `/api/auth/login` | public | Connexion |
| GET | `/api/customers` | auth | Liste clients (filtres: search, product, contract, expiring) |
| GET | `/api/customers/:id` | auth | Détail client |
| POST | `/api/customers` | admin | Ajouter un client |
| PUT | `/api/customers/:id` | admin | Modifier un client |
| DELETE | `/api/customers/:id` | admin | Supprimer un client |
| GET | `/api/dashboard` | auth | Statistiques |
| GET | `/api/dashboard/expiring` | auth | Licences expirant < 90 jours |
| GET | `/api/export/csv` | auth | Export CSV complet |
| GET/POST/PUT/DELETE | `/api/users` | admin | Gestion des utilisateurs |

## Production

L'image Docker est construite et publiée par **GitHub Actions** (`.github/workflows/build.yml`)
sur le registre `ghcr.io/didier57/ssp-app:latest` à chaque `git push` sur `main`.

Installation sur le NAS (voir `README-deploy.md`) :

1. Stack Portainer avec le `docker-compose.yml` du dépôt (image GHCR).
2. À chaque mise à jour : `git push`, puis sur le NAS :
   ```
   docker compose pull
   docker compose up -d --force-recreate
   ```

Build local manuel (optionnel) :
```bash
npm run build --prefix frontend   # génère le build statique dans frontend/dist
```
