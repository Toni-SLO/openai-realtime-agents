# 🎯 SINGLE SOURCE OF TRUTH SETTINGS

## 📁 NOVA ARHITEKTURA - EN VIR RESNICE

### `server/settings.json` (EDINI VIR)
- **Uporaba**: Vse nastavitve v JSON formatu
- **Format**: Standardni JSON
- **Dostop**: Avtomatsko prebrano v oba formata

### `server/settings.js` (ES Module Loader)
- **Uporaba**: Frontend TypeScript koda
- **Format**: ES6 modules - **PREBERE IZ JSON**
- **Dostop**: API endpoint `/api/settings`

### `server/settings.cjs` (CommonJS Loader)
- **Uporaba**: Backend Node.js server (`sip-webhook.mjs`)
- **Format**: CommonJS - **PREBERE IZ JSON**
- **Dostop**: `require('./settings.cjs')`

## ✅ ENOSTAVNO SPREMINJANJE

**Spreminjaj SAMO settings.json!**

### 🔧 POSTOPEK SPREMINJANJA:

#### 1️⃣ Spremeni `server/settings.json`
```json
{
  "guestLimits": {
    "maxGuests": 15
  }
}
```

#### 2️⃣ Restart sistem
```bash
# Restart SIP webhook
# Restart Next.js dev server
```

#### 3️⃣ Avtomatski rezultat ✅
- **CommonJS**: Prebere iz JSON
- **ES Module**: Prebere iz JSON
- **Agent**: Uporablja novo vrednost

## 🎯 ZAKAJ DVE LOADER DATOTEKI?

### **Problem**: Module Compatibility
- **SIP Webhook** (`sip-webhook.mjs`) potrebuje **CommonJS**
- **Frontend** (`unified.ts`) potrebuje **ES Modules**
- **Node.js** ne more mešati formatov

### **Rešitev**: JSON + Dual Loaders
- **JSON** kot single source of truth
- **CommonJS loader** za server-side
- **ES Module loader** za client-side
- **Avtomatska sinhronizacija** ✅

## 🚨 OPOZORILA

### ❌ NE SPREMINJAJ LOADER DATOTEK
```javascript
// NAPAČNO - spreminjanje settings.js ali settings.cjs:
maxGuests: 15  // ❌ Bo prepisano ob naslednjem zagonu!

// PRAVILNO - spreminjanje settings.json:
"maxGuests": 15  // ✅ Edini vir resnice
```

### ❌ NE POZABI JSON SINTAKSE
```json
// NAPAČNO:
{
  maxGuests: 15,  // ❌ Brez narekovajev
  // komentar     // ❌ Komentarji niso dovoljeni
}

// PRAVILNO:
{
  "maxGuests": 15  // ✅ Narekovaji obvezni
}
```

### ❌ NE POZABI RESTART
```
Spremembe v settings.json → restart potreben!
```

## 🔍 PREVERJANJE SINHRONIZACIJE

### Test JSON + CommonJS:
```bash
node -e "
const { settings } = require('./server/settings.cjs');
console.log('JSON → CommonJS maxGuests:', settings.guestLimits.maxGuests);
"
```

### Test JSON + ES Module:
```bash
node --input-type=module -e "
import settings from './server/settings.js';
console.log('JSON → ES Module maxGuests:', settings.guestLimits.maxGuests);
"
```

### **Obe vrednosti morajo biti enaki!** ✅

---

## 🎯 PREDNOSTI NOVE ARHITEKTURE

### ✅ **Single Source of Truth**
- **En file** za vse nastavitve
- **Ni več podvajanja**
- **Ni možnosti za razhajanja**

### ✅ **Enostavno Vzdrževanje**
- **Spremeni samo JSON**
- **Avtomatska sinhronizacija**
- **Ni več ročnega kopiranja**

### ✅ **JSON Format**
- **Standardni format**
- **Enostavno urejanje**
- **Validacija sintakse**

---

**💡 TIP**: Spreminjaj samo `settings.json` - ostalo se avtomatsko posodobi!
