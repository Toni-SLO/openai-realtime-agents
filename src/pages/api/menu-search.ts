import { NextApiRequest, NextApiResponse } from 'next';
import { getMenuForAgent, findMenuItem } from '../../app/agentConfigs/shared/menu';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query, language = 'hr', get_full_menu = false } = req.body;

    console.log('[menu-search] Request:', { query, language, get_full_menu });

    if (get_full_menu) {
      // Return complete menu
      const fullMenu = getMenuForAgent(language);
      console.log('[menu-search] Returning full menu for language:', language);
      return res.status(200).json({ 
        success: true, 
        data: fullMenu 
      });
    } else if (query) {
      // Search for specific items
      const searchResults = findMenuItem(query, language);
      
      if (searchResults.length === 0) {
        const errorMessage = `Ni najdenih rezultatov za "${query}". Poskusite z drugimi izrazi.`;
        console.log('[menu-search] No results for query:', query);
        return res.status(200).json({ 
          success: true, 
          data: errorMessage 
        });
      }
      
      let resultText = `Rezultati iskanja za "${query}":\n\n`;
      searchResults.forEach(item => {
        const translation = item.translations[language as keyof typeof item.translations];
        resultText += `• ${translation} - ${item.price.toFixed(2)} €\n`;
      });
      
      console.log('[menu-search] Found', searchResults.length, 'results for query:', query);
      return res.status(200).json({ 
        success: true, 
        data: resultText 
      });
    } else {
      // No query provided, return basic menu
      const basicMenu = getMenuForAgent(language);
      console.log('[menu-search] Returning basic menu for language:', language);
      return res.status(200).json({ 
        success: true, 
        data: basicMenu 
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
