/**
 * FANČITA RESTAURANT SETTINGS (CommonJS loader)
 * 
 * SINGLE SOURCE OF TRUTH: Prebere settings iz settings.json
 * 
 * OPOMBA: Spreminjaj samo settings.json - ta datoteka avtomatsko prebere!
 */

const fs = require('fs');
const path = require('path');

// Preberi settings iz JSON datoteke
let settings = null;
try {
  const settingsPath = path.join(__dirname, 'settings.json');
  const settingsContent = fs.readFileSync(settingsPath, 'utf8');
  settings = JSON.parse(settingsContent);
  
  // Pretvori regex string nazaj v RegExp objekt
  if (settings.validation && settings.validation.timeFormatRegex) {
    settings.validation.timeFormatRegex = new RegExp(settings.validation.timeFormatRegex);
  }
  
  console.log('[settings.cjs] ✅ Settings loaded from JSON:', {
    maxGuests: settings.guestLimits?.maxGuests,
    source: 'settings.json'
  });
} catch (error) {
  console.error('[settings.cjs] ❌ Failed to load settings.json:', error.message);
  
  // Fallback settings
  settings = {
    guestLimits: { maxGuests: 10, minGuests: 1 },
    businessHours: {
      reservations: { startHour: 12, endHour: 23 },
      delivery: { startHour: 12, endHour: 22 }
    }
  };
  console.log('[settings.cjs] ⚠️ Using fallback settings');
}

module.exports = { settings };
module.exports.default = settings;
