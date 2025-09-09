import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const INSTRUCTION_FILE_PATH = path.join(process.cwd(), 'src/app/agentConfigs/shared/instructions.ts');

// Map of category IDs to export names - UNIFIED ONLY
const CATEGORY_EXPORT_MAP: Record<string, string> = {
  'unified': 'FANCITA_UNIFIED_INSTRUCTIONS',
};

export async function POST(request: NextRequest) {
  try {
    const { category, content } = await request.json();

    if (!category || !content) {
      return NextResponse.json(
        { error: 'Kategorija in vsebina sta obvezna' },
        { status: 400 }
      );
    }

    const exportName = CATEGORY_EXPORT_MAP[category];
    if (!exportName) {
      return NextResponse.json(
        { error: 'Neznana kategorija' },
        { status: 400 }
      );
    }

    // Read current file content
    const fileContent = await fs.readFile(INSTRUCTION_FILE_PATH, 'utf8');

    // Find the start and end of the export we want to replace
    const exportRegex = new RegExp(
      `export const ${exportName} = \`([\\s\\S]*?)\`;`,
      'g'
    );

    // Escape backticks in content
    const escapedContent = content.replace(/`/g, '\\`');

    // Replace the content
    const updatedContent = fileContent.replace(
      exportRegex,
      `export const ${exportName} = \`${escapedContent}\`;`
    );

    // Write back to file
    await fs.writeFile(INSTRUCTION_FILE_PATH, updatedContent, 'utf8');

    return NextResponse.json({ 
      success: true, 
      message: 'Instrukcije so bile uspešno posodobljene' 
    });

  } catch (error) {
    console.error('Error updating instructions:', error);
    return NextResponse.json(
      { error: 'Napaka pri shranjevanju instrukcij' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Return current instructions (for debugging/verification)
    const fileContent = await fs.readFile(INSTRUCTION_FILE_PATH, 'utf8');
    
    return NextResponse.json({
      success: true,
      content: fileContent
    });
  } catch (error) {
    console.error('Error reading instructions:', error);
    return NextResponse.json(
      { error: 'Napaka pri branju instrukcij' },
      { status: 500 }
    );
  }
}
