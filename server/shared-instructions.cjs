// Centralized access to shared instructions for server files (CommonJS)
const fs = require('fs');
const path = require('path');

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

// Helper function to replace instruction variables
function replaceInstructionVariables(instructions, callerId, conversationId, sessionLanguage = 'hr') {
  return instructions
    .replace(/\{\{system__caller_id\}\}/g, callerId)
    .replace(/\{\{system__conversation_id\}\}/g, conversationId)
    .replace(/\{\{session_language\}\}/g, sessionLanguage);
}

// Export functions - UNIFIED ONLY
module.exports = {
  FANCITA_UNIFIED_INSTRUCTIONS: () => extractInstruction('FANCITA_UNIFIED_INSTRUCTIONS'),
  replaceInstructionVariables
};
