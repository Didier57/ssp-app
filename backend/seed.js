const db = require('./db');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DATA_PATH = path.join(__dirname, '..', 'scripts', 'data.json');

// Crée le compte admin par défaut si aucun utilisateur n'existe
function ensureDefaultAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return false;
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const role = process.env.ADMIN_ROLE || 'admin';
  const email = process.env.ADMIN_EMAIL || null;
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password_hash, role, email) VALUES (?, ?, ?, ?)')
    .run(username, hash, role, email);
  console.log(`[seed] Utilisateur "${username}" créé par défaut (rôle: ${role}) — pensez à changer le mot de passe !`);
  return true;
}

function seed() {
  if (!fs.existsSync(DATA_PATH)) {
    console.log('[seed] data.json introuvable, import ignoré.');
    return false;
  }

  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

  const count = db.prepare('SELECT COUNT(*) AS c FROM customers').get().c;
  if (count > 0) {
    console.log(`[seed] BDD déjà alimentée (${count} clients), import ignoré.`);
    return false;
  }

  const insertCustomer = db.prepare(`
    INSERT INTO customers (
      customer, customer_site, date_end_licence, product, mac_address, lic_35, siel_id,
      registered_company, number_user, contract, last_lac, date_last_lac,
      udl_contract, dlu_contract, info_divers
    ) VALUES (
      @customer, @customer_site, @date_end_licence, @product, @mac_address, @lic_35, @siel_id,
      @registered_company, @number_user, @contract, @last_lac, @date_last_lac,
      @udl_contract, @dlu_contract, @info_divers
    )
  `);

  const insertLastSsp = db.prepare(`
    INSERT INTO last_ssp (lac, total_quantity, available_quantity, feature, create_date, siel_id)
    VALUES (@lac, @total_quantity, @available_quantity, @feature, @create_date, @siel_id)
  `);

  const insertParMois = db.prepare(`INSERT INTO par_mois (data_json) VALUES (?)`);

  const tx = db.transaction(() => {
    for (const c of data.customers) insertCustomer.run(c);
    if (Array.isArray(data.last_ssp)) for (const l of data.last_ssp) insertLastSsp.run(l);
    if (Array.isArray(data.par_mois)) for (const row of data.par_mois) insertParMois.run(JSON.stringify(row));
  });

  tx();

  console.log(`[seed] Import terminé: ${data.customers.length} clients.`);
  return true;
}

module.exports = { seed, ensureDefaultAdmin };
