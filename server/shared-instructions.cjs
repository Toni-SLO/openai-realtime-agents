// Centralized access to shared instructions for server files (CommonJS)
const fs = require('fs');
const path = require('path');

// Import settings for dynamic variables
let settings = null;
try {
  // Import CommonJS settings
  const settingsModule = require('./settings.cjs');
  settings = settingsModule.settings || settingsModule.default;
  console.log('[shared-instructions] ✅ Settings loaded:', {
    maxGuests: settings?.guestLimits?.maxGuests,
    reservationHours: settings?.businessHours?.reservations ? 
      `${settings.businessHours.reservations.startHour}:00-${settings.businessHours.reservations.endHour}:00` : 'unknown'
  });
} catch (error) {
  console.error('[shared-instructions] ❌ Failed to load settings:', error.message);
  // Fallback settings
  settings = {
    guestLimits: { maxGuests: 10, minGuests: 1 },
    businessHours: {
      reservations: { startHour: 12, endHour: 23 },
      delivery: { startHour: 12, endHour: 22 }
    }
  };
  console.log('[shared-instructions] ⚠️ Using fallback settings');
}

// Read instructions from the centralized file
function readInstructionsFile() {
  const instructionsPath = path.join(__dirname, '..', 'src', 'app', 'agentConfigs', 'shared', 'instructions.ts');
  return fs.readFileSync(instructionsPath, 'utf8');
}

// Extract specific instruction constant from the TypeScript file
function extractInstruction(constantName) {
  const fileContent = readInstructionsFile();
  const regex = new RegExp(`export const ${constantName} = \`([\\s\\S]*?)\`;`, 'g');
  const match = regex.exec(fileContent);
  
  if (!match) {
    console.error(`❌ Could not find instruction constant: ${constantName}`);
    return null;
  }
  
  // Unescape backticks
  return match[1].replace(/\\`/g, '`');
}

// Helper function to replace ALL instruction variables (system + business)
async function replaceInstructionVariables(instructions, callerId, conversationId, sessionLanguage = 'hr') {
  if (!instructions) return '';
  
  let result = instructions;
  
  // 1. Replace system variables (existing functionality)
  result = result
    .replace(/\{\{system__caller_id\}\}/g, callerId)
    .replace(/\{\{system__conversation_id\}\}/g, conversationId)
    .replace(/\{\{session_language\}\}/g, sessionLanguage);
  
  // 2. Replace business variables from settings.js (NEW!)
  let reservationHours = 'N/A';
  let deliveryHours = 'N/A';
  
  if (settings) {
    // Guest limits
    result = result.replace(/\{\{MAX_GUESTS\}\}/g, settings.guestLimits.maxGuests.toString());
    result = result.replace(/\{\{MIN_GUESTS\}\}/g, settings.guestLimits.minGuests.toString());
    
    // Business hours - individual values
    result = result.replace(/\{\{RESERVATION_START\}\}/g, settings.businessHours.reservations.startHour.toString());
    result = result.replace(/\{\{RESERVATION_END\}\}/g, settings.businessHours.reservations.endHour.toString());
    result = result.replace(/\{\{DELIVERY_START\}\}/g, settings.businessHours.delivery.startHour.toString());
    result = result.replace(/\{\{DELIVERY_END\}\}/g, settings.businessHours.delivery.endHour.toString());
    
    // Business hours - formatted ranges
    reservationHours = `${settings.businessHours.reservations.startHour}:00-${settings.businessHours.reservations.endHour}:00`;
    deliveryHours = `${settings.businessHours.delivery.startHour}:00-${settings.businessHours.delivery.endHour}:00`;
    
    result = result.replace(/\{\{RESERVATION_HOURS\}\}/g, reservationHours);
    result = result.replace(/\{\{DELIVERY_HOURS\}\}/g, deliveryHours);

    // ETA rules (orders)
    if (settings.orders && settings.orders.eta) {
      const eta = settings.orders.eta;
      const pickup = eta.pickup || {};
      const delivery = eta.delivery || {};

      if (pickup.count_0_5_min != null) {
        result = result.replace(/\{\{ETA_PICKUP_0_5\}\}/g, String(pickup.count_0_5_min));
      }
      if (pickup.count_gt_5_min != null) {
        result = result.replace(/\{\{ETA_PICKUP_GT_5\}\}/g, String(pickup.count_gt_5_min));
      }
      if (delivery.count_0_min != null) {
        result = result.replace(/\{\{ETA_DELIVERY_0\}\}/g, String(delivery.count_0_min));
      }
      if (delivery.count_1_min != null) {
        result = result.replace(/\{\{ETA_DELIVERY_1\}\}/g, String(delivery.count_1_min));
      }
      if (delivery.range_2_3_min != null) {
        result = result.replace(/\{\{ETA_DELIVERY_2_3\}\}/g, String(delivery.range_2_3_min));
      }
      if (delivery.range_gt_3_min != null) {
        result = result.replace(/\{\{ETA_DELIVERY_GT_3\}\}/g, String(delivery.range_gt_3_min));
      }
    }
  }
  
  // 3. Replace language configuration variables from environment
  const supportedLanguages = process.env.SUPPORTED_LANGUAGES || 'hr,sl,en,de,it,nl';
  const languageNames = process.env.LANGUAGE_NAMES || 'hr:hrvaščina,sl:slovenščina,en:angleščina,de:nemščina,it:italijanščina,nl:nizozemščina';
  
  result = result.replace(/\{\{SUPPORTED_LANGUAGES\}\}/g, supportedLanguages);
  result = result.replace(/\{\{LANGUAGE_NAMES\}\}/g, languageNames);
  
  // 4. Remove full menu JSON - using search_menu tool for optimization
  result = result.replace(/\{\{FULL_MENU_JSON\}\}/g, '**MENI JE NA VOLJO PREKO search_menu TOOL-A**\n\nZa cene in jedi pokliči search_menu(query, language) ko potrebuješ:\n- search_menu("pizza", "hr") za vse pizze\n- search_menu("margherita", "hr") za specifično pizzo\n- search_menu("", "hr") za celoten meni');
  console.log(`[shared-instructions] ✅ Menu optimization: Using search_menu tool instead of full menu`);
  
  // Log dynamic variables (only if settings exist)
  if (settings) {
    console.log('[shared-instructions] 🔄 Dynamic variables replaced:', {
      maxGuests: settings.guestLimits.maxGuests,
      reservationHours,
      deliveryHours,
      supportedLanguages,
      languageNames,
      menuLanguage: sessionLanguage,
      menuIncluded: result.includes('FULL_MENU_JSON') ? 'NO' : 'YES'
    });
  }
  
  return result;
}

// Export functions - UNIFIED ONLY
module.exports = {
  FANCITA_UNIFIED_INSTRUCTIONS: () => extractInstruction('FANCITA_UNIFIED_INSTRUCTIONS'),
  replaceInstructionVariables
};
