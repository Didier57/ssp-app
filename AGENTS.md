# Instructions projet SSP Openscape

## Stack
- Frontend: React 18 + Vite (port 5173) dans `frontend/`
- Backend: Node.js + Express (port 3001) dans `backend/`
- BDD: SQLite (`backend/ssp.db`) via better-sqlite3
- Auth: JWT + bcrypt (rôles: `admin`, `lecteur`)

## Commandes utiles

- Lancer les deux serveurs: `npm run dev` (à la racine)
- Backend seul: `node backend/server.js` (dans backend/)
- Frontend seul: `npm run dev` (dans frontend/)
- Build frontend: `npm run build --prefix frontend`
- Reconvertir l'Excel source: `node backend/convert_excel.js` (source: `c:\temp\Table SSPOSBIZ.xlsx`)
- Créer un utilisateur: `node backend/seed-users.js <user> <password> <admin|lecteur>`

## Notes
- PowerShell bloque les scripts .ps1 → toujours utiliser `npm.cmd` plutôt que `npm` en shell
- Le seed importe automatiquement `scripts/data.json` si la BDD est vide (au démarrage de server.js)
- Schéma customers: customer, customer_site, date_end_licence, product, mac_address, lic_35, siel_id, registered_company, number_user, contract, last_lac, date_last_lac, udl_contract, dlu_contract, info_divers, updated_at, updated_by
- Schéma users: id, username, password_hash, role (admin|lecteur), email, created_at
- Compte admin par défaut: `admin / admin123`

## Déploiement (flux actuel)
- **Pas de déploiement Sur Synology / copies Q: / watchdog** (supprimé).
- Après les tests locaux, déploiement = `git add -A && git commit -m "..." && git push` sur `main`.
- GitHub Actions construit l'image `ghcr.io/didier57/ssp-app:latest` (`.github/workflows/build.yml`).
- Le serveur tire l'image : `docker compose pull && docker compose up -d --force-recreate` (stack/repo avec `image: ghcr.io/didier57/ssp-app:latest`).