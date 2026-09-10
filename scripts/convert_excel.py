import pandas as pd
import json
import sys

src = r"c:\temp\SSP Openscape Business.xlsx"
out = "C:\\Users\\didie\\OneDrive\\Documents\\Default Project\\ssp-app\\scripts\\data.json"

def clean_date(v):
    if v is None or (isinstance(v, float) and v != v):  # NaN
        return None
    if pd.isna(v):
        return None
    if hasattr(v, 'strftime'):
        return v.strftime('%Y-%m-%d')
    return str(v)

def clean_str(v):
    if v is None:
        return None
    if isinstance(v, float) and v != v:
        return None
    if pd.isna(v):
        return None
    s = str(v).strip()
    return s if s else None

def to_int(v):
    if v is None:
        return None
    if isinstance(v, float) and v != v:
        return None
    if pd.isna(v):
        return None
    if isinstance(v, str):
        v = v.replace(',', '').strip()
        if v.upper() == 'PAYGO':
            return None
        try:
            return int(float(v))
        except:
            return None
    return int(v)

xl = pd.ExcelFile(src)

# --- Feuille principale ---
df = pd.read_excel(xl, sheet_name="SSP ALL CUSTOMER", header=0)
customers = []
for _, r in df.iterrows():
    customers.append({
        "customer": clean_str(r.get("Customer")),
        "customer_site": clean_str(r.get("Customer site")),
        "date_end_licence": clean_date(r.get("Date_end_licence")),
        "product": clean_str(r.get("Product")),
        "mac_address": clean_str(r.get("Mac_address")),
        "siel_id": clean_str(r.get("SIEL ID")),
        "registered_company": clean_str(r.get("Registered Compagny")),
        "number_user": to_int(r.get("Number User")),
        "contract": to_int(r.get("Contract")),
        "remote": to_int(r.get("Remote")),
        "last_lac": clean_str(r.get("LAST LAC")),
        "date_last_lac": clean_date(r.get("DATE LAST LAC")),
        "contrat_damovo": clean_str(r.get("Contrat Damovo")),
        "info_divers": clean_str(r.get("INFORMATION DIVERS"))
    })

# --- Feuille LAST SSP ---
df2 = pd.read_excel(xl, sheet_name="LAST SSP", header=0)
last_ssp = []
for _, r in df2.iterrows():
    last_ssp.append({
        "lac": clean_str(r.get("LAC")),
        "total_quantity": to_int(r.get("Total Quantity")),
        "available_quantity": to_int(r.get("Available Quantity")),
        "feature": clean_str(r.get("Feature")),
        "create_date": clean_date(r.get("Create Date")),
        "siel_id": clean_str(r.get("SIEL-ID"))
    })

# --- Feuille Par Mois ---
df3 = pd.read_excel(xl, sheet_name="Par Mois", header=None)
par_mois = df3.values.tolist()

data = {
    "customers": customers,
    "last_ssp": last_ssp,
    "par_mois": par_mois,
    "meta": {
        "source_file": src,
        "customer_count": len(customers)
    }
}

with open(out, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"OK: {len(customers)} customers, {len(last_ssp)} last_ssp, {len(par_mois)} par_mois lignes")
print(f"Fichier écrit: {out}")
