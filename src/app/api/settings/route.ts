import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * API endpoint za pridobivanje settings iz server/settings.js
 * 
 * GET /api/settings - vrne trenutne nastavitve
 */

export async function GET(request: NextRequest) {
  try {
    // Dinamično importaj settings iz server/settings.js
    const settingsPath = join(process.cwd(), 'server', 'settings.js');
    
    // Uporabi dynamic import za ES modules
    const settingsModule = await import(settingsPath);
    const settings = settingsModule.default || settingsModule.settings;
    
    return NextResponse.json({
      success: true,
      data: settings,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Failed to read settings:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to load settings',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// POST endpoint za posodabljanje settings (opcijsko)
export async function POST(request: NextRequest) {
  return NextResponse.json({
    success: false,
    error: 'Settings update not implemented yet'
  }, { status: 501 });
}
