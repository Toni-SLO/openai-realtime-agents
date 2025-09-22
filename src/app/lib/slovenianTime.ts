/**
 * SLOVENSKI ČASOVNI PAS - UTILITY FUNKCIJE
 * 
 * Te funkcije zagotavljajo pravilno obravnavanje časa v Sloveniji (Ljubljana)
 * ne glede na to, kje se nahaja strežnik.
 */

/**
 * Dobi trenutni datum in čas v Sloveniji (Ljubljana)
 */
export function getSlovenianDateTime(): Date {
  const now = new Date();
  // Pretvori v slovenski čas (Europe/Ljubljana)
  const slovenianTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Ljubljana"}));
  return slovenianTime;
}

/**
 * Dobi današnji datum v Sloveniji v YYYY-MM-DD formatu
 */
export function getSlovenianToday(): string {
  const slovenianTime = getSlovenianDateTime();
  return slovenianTime.toISOString().split('T')[0];
}

/**
 * Dobi jutrišnji datum v Sloveniji v YYYY-MM-DD formatu
 */
export function getSlovenianTomorrow(): string {
  const slovenianTime = getSlovenianDateTime();
  slovenianTime.setDate(slovenianTime.getDate() + 1);
  return slovenianTime.toISOString().split('T')[0];
}

/**
 * Dobi trenutni čas v Sloveniji v HH:MM formatu
 */
export function getSlovenianCurrentTime(): string {
  const slovenianTime = getSlovenianDateTime();
  return slovenianTime.toTimeString().slice(0, 5);
}

/**
 * Pretvori "danes", "jutri" itd. v pravilni datum glede na slovenski čas
 */
export function parseDateExpression(expression: string): string {
  const lowerExpression = expression.toLowerCase().trim();
  
  // Danes
  if (['danes', 'today', 'heute', 'oggi', 'hoy', "aujourd'hui"].includes(lowerExpression)) {
    return getSlovenianToday();
  }
  
  // Jutri
  if (['jutri', 'sutra', 'tomorrow', 'morgen', 'domani', 'mañana', 'demain'].includes(lowerExpression)) {
    return getSlovenianTomorrow();
  }
  
  // Če ni prepoznan izraz, vrni kot je
  return expression;
}

/**
 * Formatiran timestamp za logiranje v slovenskem času
 */
export function getSlovenianTimestamp(): string {
  const slovenianTime = getSlovenianDateTime();
  return slovenianTime.toLocaleString('sl-SI');
}

/**
 * Debug funkcija - prikaži razliko med sistemskim in slovenskim časom
 */
export function debugTimezones(): void {
  const systemTime = new Date();
  const slovenianTime = getSlovenianDateTime();
  
  console.log('[timezone-debug] Sistemski čas:', systemTime.toISOString());
  console.log('[timezone-debug] Slovenski čas:', slovenianTime.toISOString());
  console.log('[timezone-debug] Današnji datum (sistem):', systemTime.toISOString().split('T')[0]);
  console.log('[timezone-debug] Današnji datum (Slovenija):', getSlovenianToday());
  console.log('[timezone-debug] Razlika v urah:', (slovenianTime.getTime() - systemTime.getTime()) / (1000 * 60 * 60));
}
