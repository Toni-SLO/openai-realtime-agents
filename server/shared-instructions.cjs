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
function replaceInstructionVariables(instructions, callerId, conversationId, sessionLanguage = 'hr') {
  if (!instructions) return '';
  
  let result = instructions;
  
  // 1. Replace system variables (existing functionality)
  result = result
    .replace(/\{\{system__caller_id\}\}/g, callerId)
    .replace(/\{\{system__conversation_id\}\}/g, conversationId)
    .replace(/\{\{session_language\}\}/g, sessionLanguage);
  
  // 2. Replace business variables from settings.js (NEW!)
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
    const reservationHours = `${settings.businessHours.reservations.startHour}:00-${settings.businessHours.reservations.endHour}:00`;
    const deliveryHours = `${settings.businessHours.delivery.startHour}:00-${settings.businessHours.delivery.endHour}:00`;
    
    result = result.replace(/\{\{RESERVATION_HOURS\}\}/g, reservationHours);
    result = result.replace(/\{\{DELIVERY_HOURS\}\}/g, deliveryHours);
    
    console.log('[shared-instructions] 🔄 Dynamic variables replaced:', {
      maxGuests: settings.guestLimits.maxGuests,
      reservationHours,
      deliveryHours
    });
  }
  
  return result;
}

// Export functions - UNIFIED ONLY
module.exports = {
  FANCITA_UNIFIED_INSTRUCTIONS: () => extractInstruction('FANCITA_UNIFIED_INSTRUCTIONS'),
  replaceInstructionVariables
};
