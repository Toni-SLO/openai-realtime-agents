# 🔄 DINAMIČNE INSTRUKCIJE SISTEMA

Sistem za avtomatsko nadomestitev spremenljivk v instrukcijah na osnovi `server/settings.js`.

## 🎯 PROBLEM REŠEN

**PREJ (hardkodirano):**
```
- **MAKSIMALNO 10 OSEB**: Če gost želi več kot 10 oseb
- **DELOVNI ČAS**: Rezervacije SAMO od 12:00 do 23:00
```

**SEDAJ (dinamično):**
```
- **MAKSIMALNO {{MAX_GUESTS}} OSEB**: Če gost želi več kot {{MAX_GUESTS}} oseb
- **DELOVNI ČAS**: Rezervacije SAMO od {{RESERVATION_HOURS}}
```

## 📁 DATOTEKE

### `instructionVariables.ts`
- **Definira spremenljivke** (`{{MAX_GUESTS}}`, `{{DELIVERY_HOURS}}`)
- **Funkcija `replaceInstructionVariables()`** za nadomestitev
- **API integration** za pridobivanje settings

### `unified.ts`
```typescript
instructions: replaceInstructionVariables(FANCITA_UNIFIED_INSTRUCTIONS)
```

### `/api/settings/route.ts`
- **GET endpoint** za pridobivanje settings
- **Sync med server/settings.js in frontend**

## 🔄 KAKO DELUJE

### 1️⃣ SETTINGS DEFINICIJA
```javascript
// server/settings.js
guestLimits: {
  maxGuests: 10,  // ← Ta vrednost
  minGuests: 1
}
```

### 2️⃣ SPREMENLJIVKA V INSTRUKCIJAH
```typescript
// instructions.ts
"**MAKSIMALNO {{MAX_GUESTS}} OSEB**"
```

### 3️⃣ AVTOMATSKA NADOMESTITEV
```typescript
// instructionVariables.ts
result = result.replace(/\{\{MAX_GUESTS\}\}/g, settings.guestLimits.maxGuests.toString());
```

### 4️⃣ KONČNI REZULTAT
```
"**MAKSIMALNO 10 OSEB**"  // ← Dinamično generirano
```

## 🎛️ RAZPOLOŽLJIVE SPREMENLJIVKE

| Spremenljivka | Opis | Primer |
|---------------|------|--------|
| `{{MAX_GUESTS}}` | Maksimalno število gostov | `10` |
| `{{MIN_GUESTS}}` | Minimalno število gostov | `1` |
| `{{RESERVATION_START}}` | Začetek rezervacij | `12` |
| `{{RESERVATION_END}}` | Konec rezervacij | `23` |
| `{{DELIVERY_START}}` | Začetek dostave | `12` |
| `{{DELIVERY_END}}` | Konec dostave | `22` |
| `{{RESERVATION_HOURS}}` | Formatiran čas rezervacij | `12:00-23:00` |
| `{{DELIVERY_HOURS}}` | Formatiran čas dostave | `12:00-22:00` |

## ✏️ DODAJANJE NOVIH SPREMENLJIVK

### 1️⃣ Dodaj v `settings.js`
```javascript
newFeature: {
  maxItems: 5,
  timeout: 30
}
```

### 2️⃣ Definiraj spremenljivko
```typescript
// instructionVariables.ts
MAX_ITEMS: '{{MAX_ITEMS}}',
TIMEOUT: '{{TIMEOUT}}'
```

### 3️⃣ Dodaj nadomestitev
```typescript
result = result.replace(/\{\{MAX_ITEMS\}\}/g, settings.newFeature.maxItems.toString());
result = result.replace(/\{\{TIMEOUT\}\}/g, settings.newFeature.timeout.toString());
```

### 4️⃣ Uporabi v instrukcijah
```
"Maksimalno {{MAX_ITEMS}} izdelkov v {{TIMEOUT}} sekundah"
```

## 🔄 SPREMINJANJE VREDNOSTI

### Spremeni v `server/settings.js`
```javascript
guestLimits: {
  maxGuests: 15  // Prej: 10
}
```

### Avtomatski rezultat v instrukcijah
```
"**MAKSIMALNO 15 OSEB**"  // Prej: "**MAKSIMALNO 10 OSEB**"
```

## 🚀 PREDNOSTI

### ✅ CENTRALIZIRANE NASTAVITVE
- **En file** za vse omejitve
- **Ni več iskanja** po instrukcijah
- **Konsistentnost** po celotnem sistemu

### ✅ ENOSTAVNO VZDRŽEVANJE
- **Spremeni enkrat** v settings
- **Avtomatsko posodobi** vse instrukcije
- **Ni hardkodiranja**

### ✅ FLEKSIBILNOST
- **Hitro prilagajanje** poslovnim zahtevam
- **A/B testiranje** različnih omejitev
- **Sezonske spremembe**

## ⚠️ POMEMBNO

- **Restart potreben**: Po spremembah settings
- **Spremenljivke morajo obstajati**: Preveri `INSTRUCTION_VARIABLES`
- **Format**: Vedno `{{VARIABLE_NAME}}`
- **Case sensitive**: `{{MAX_GUESTS}}` ≠ `{{max_guests}}`

## 🔍 DEBUGGING

### Preveri nadomestitev
```typescript
console.log('Original:', FANCITA_UNIFIED_INSTRUCTIONS);
console.log('Processed:', replaceInstructionVariables(FANCITA_UNIFIED_INSTRUCTIONS));
```

### Preveri settings API
```bash
curl http://localhost:3000/api/settings
```

---

**💡 TIP**: Uporabi `{{VARIABLE_NAME}}` format za vse številske vrednosti in čase v instrukcijah!
