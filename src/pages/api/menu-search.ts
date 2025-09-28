import { NextApiRequest, NextApiResponse } from 'next';
import { getMenuForAgent, findMenuItem } from '../../app/agentConfigs/shared/menu';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query, language = 'hr', get_full_menu = false } = req.body;

    console.log('[menu-search] Request:', { query, language, get_full_menu });

    // ALWAYS return complete menu - optimized strategy
    const fullMenu = getMenuForAgent(language);
    
    if (query) {
      console.log('[menu-search] Returning full menu with query context:', query, 'for language:', language);
      return res.status(200).json({ 
        success: true, 
        data: `CELOTEN MENI ZA JEZIK: ${language.toUpperCase()}\n(Kontekst vprašanja: "${query}")\n\n${fullMenu}`
      });
    } else {
      console.log('[menu-search] Returning full menu for language:', language);
      return res.status(200).json({ 
        success: true, 
        data: `CELOTEN MENI ZA JEZIK: ${language.toUpperCase()}\n\n${fullMenu}`
      });
    }
  } catch (error) {
    console.error('[menu-search] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}
