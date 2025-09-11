/**
 * DINAMIČNE SPREMENLJIVKE ZA INSTRUKCIJE
 * 
 * Te spremenljivke se avtomatsko nadomestijo v instrukcijah
 * na osnovi vrednosti iz server/settings.js
 */

// PRAVI IMPORT SETTINGS IZ SERVER/SETTINGS.JS
let cachedSettings: any = null;

// Funkcija za pridobivanje settings iz server/settings.js
const getSettingsFromServer = async () => {
  if (cachedSettings) {
    return cachedSettings;
  }
  
  try {
    // V Node.js okolju (server-side) direktno importaj
    if (typeof window === 'undefined') {
      // Uporabi relativno pot do server/settings.js
      const settingsPath = require('path').join(process.cwd(), 'server', 'settings.js');
      const settingsModule = await import(settingsPath);
      const settings = settingsModule.default || settingsModule.settings;
      cachedSettings = settings;
      return settings;
    } else {
      // V browser okolju (client-side) uporabi API
      const response = await fetch('/api/settings');
      const result = await response.json();
      if (result.success) {
        cachedSettings = result.data;
        return result.data;
      }
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  
  // Fallback - samo v skrajni sili
  console.warn('Using fallback settings - this should not happen in production!');
  return {
    guestLimits: { maxGuests: 10, minGuests: 1 },
    businessHours: {
      reservations: { startHour: 12, endHour: 23 },
      delivery: { startHour: 12, endHour: 22 }
    }
  };
};

// Dinamične spremenljivke za instrukcije
export const INSTRUCTION_VARIABLES = {
  // Omejitve gostov
  MAX_GUESTS: '{{MAX_GUESTS}}',           // Nadomesti z settings.guestLimits.maxGuests
  MIN_GUESTS: '{{MIN_GUESTS}}',           // Nadomesti z settings.guestLimits.minGuests
  
  // Delovni časi
  RESERVATION_START: '{{RESERVATION_START}}',  // settings.businessHours.reservations.startHour
  RESERVATION_END: '{{RESERVATION_END}}',      // settings.businessHours.reservations.endHour
  DELIVERY_START: '{{DELIVERY_START}}',        // settings.businessHours.delivery.startHour
  DELIVERY_END: '{{DELIVERY_END}}',            // settings.businessHours.delivery.endHour
  
  // Formatiran čas
  RESERVATION_HOURS: '{{RESERVATION_HOURS}}',  // "12:00-23:00"
  DELIVERY_HOURS: '{{DELIVERY_HOURS}}',        // "12:00-22:00"
};

// Funkcija za nadomestitev spremenljivk v instrukcijah
export async function replaceInstructionVariables(instructionText: string): Promise<string> {
  const settings = await getSettingsFromServer();
  
  let result = instructionText;
  
  // Nadomesti številske vrednosti
  result = result.replace(/\{\{MAX_GUESTS\}\}/g, settings.guestLimits.maxGuests.toString());
  result = result.replace(/\{\{MIN_GUESTS\}\}/g, settings.guestLimits.minGuests.toString());
  result = result.replace(/\{\{RESERVATION_START\}\}/g, settings.businessHours.reservations.startHour.toString());
  result = result.replace(/\{\{RESERVATION_END\}\}/g, settings.businessHours.reservations.endHour.toString());
  result = result.replace(/\{\{DELIVERY_START\}\}/g, settings.businessHours.delivery.startHour.toString());
  result = result.replace(/\{\{DELIVERY_END\}\}/g, settings.businessHours.delivery.endHour.toString());
  
  // Nadomesti formatirane čase
  const reservationHours = `${settings.businessHours.reservations.startHour}:00-${settings.businessHours.reservations.endHour}:00`;
  const deliveryHours = `${settings.businessHours.delivery.startHour}:00-${settings.businessHours.delivery.endHour}:00`;
  
  result = result.replace(/\{\{RESERVATION_HOURS\}\}/g, reservationHours);
  result = result.replace(/\{\{DELIVERY_HOURS\}\}/g, deliveryHours);
  
  return result;
}

// Sinhronska verzija za backward compatibility (uporablja cache)
export function replaceInstructionVariablesSync(instructionText: string): string {
  if (!cachedSettings) {
    console.warn('Settings not cached yet, using fallback values');
    // Uporabi fallback vrednosti
    const fallbackSettings = {
      guestLimits: { maxGuests: 10, minGuests: 1 },
      businessHours: {
        reservations: { startHour: 12, endHour: 23 },
        delivery: { startHour: 12, endHour: 22 }
      }
    };
    
    let result = instructionText;
    result = result.replace(/\{\{MAX_GUESTS\}\}/g, fallbackSettings.guestLimits.maxGuests.toString());
    result = result.replace(/\{\{MIN_GUESTS\}\}/g, fallbackSettings.guestLimits.minGuests.toString());
    result = result.replace(/\{\{RESERVATION_START\}\}/g, fallbackSettings.businessHours.reservations.startHour.toString());
    result = result.replace(/\{\{RESERVATION_END\}\}/g, fallbackSettings.businessHours.reservations.endHour.toString());
    result = result.replace(/\{\{DELIVERY_START\}\}/g, fallbackSettings.businessHours.delivery.startHour.toString());
    result = result.replace(/\{\{DELIVERY_END\}\}/g, fallbackSettings.businessHours.delivery.endHour.toString());
    
    const reservationHours = `${fallbackSettings.businessHours.reservations.startHour}:00-${fallbackSettings.businessHours.reservations.endHour}:00`;
    const deliveryHours = `${fallbackSettings.businessHours.delivery.startHour}:00-${fallbackSettings.businessHours.delivery.endHour}:00`;
    
    result = result.replace(/\{\{RESERVATION_HOURS\}\}/g, reservationHours);
    result = result.replace(/\{\{DELIVERY_HOURS\}\}/g, deliveryHours);
    
    return result;
  }
  
  // Uporabi cached settings
  let result = instructionText;
  result = result.replace(/\{\{MAX_GUESTS\}\}/g, cachedSettings.guestLimits.maxGuests.toString());
  result = result.replace(/\{\{MIN_GUESTS\}\}/g, cachedSettings.guestLimits.minGuests.toString());
  result = result.replace(/\{\{RESERVATION_START\}\}/g, cachedSettings.businessHours.reservations.startHour.toString());
  result = result.replace(/\{\{RESERVATION_END\}\}/g, cachedSettings.businessHours.reservations.endHour.toString());
  result = result.replace(/\{\{DELIVERY_START\}\}/g, cachedSettings.businessHours.delivery.startHour.toString());
  result = result.replace(/\{\{DELIVERY_END\}\}/g, cachedSettings.businessHours.delivery.endHour.toString());
  
  const reservationHours = `${cachedSettings.businessHours.reservations.startHour}:00-${cachedSettings.businessHours.reservations.endHour}:00`;
  const deliveryHours = `${cachedSettings.businessHours.delivery.startHour}:00-${cachedSettings.businessHours.delivery.endHour}:00`;
  
  result = result.replace(/\{\{RESERVATION_HOURS\}\}/g, reservationHours);
  result = result.replace(/\{\{DELIVERY_HOURS\}\}/g, deliveryHours);
  
  return result;
}

// API endpoint za pridobivanje settings (za produkcijo)
export async function getSettingsFromAPI(): Promise<any> {
  try {
    const response = await fetch('/api/settings');
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    // Fallback na default vrednosti
    return getSettingsFromServer();
  }
}

// Inicializiraj cache ob zagonu (samo v server okolju)
if (typeof window === 'undefined') {
  getSettingsFromServer()
    .then(() => console.log('✅ Settings cache initialized'))
    .catch(error => console.error('❌ Failed to initialize settings cache:', error));
}
