'use client';

import React, { useState, useEffect } from 'react';
import { MarkdownEditor } from './MarkdownEditor';
import {
  FANCITA_UNIFIED_INSTRUCTIONS,
} from '../agentConfigs/shared/instructions';

interface InstructionCategory {
  id: string;
  name: string;
  description: string;
  content: string;
}

const INSTRUCTION_CATEGORIES: InstructionCategory[] = [
  {
    id: 'unified',
    name: 'Poenotene Instrukcije',
    description: 'Poenotene instrukcije za vse funkcionalnosti - rezervacije, naročila, handoff',
    content: FANCITA_UNIFIED_INSTRUCTIONS,
  },
];

export const InstructionEditor: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [currentContent, setCurrentContent] = useState<string>('');
  const [hasChanges, setHasChanges] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Load selected category content
  useEffect(() => {
    if (selectedCategory) {
      const category = INSTRUCTION_CATEGORIES.find(cat => cat.id === selectedCategory);
      if (category) {
        setCurrentContent(category.content);
        setHasChanges(false);
      }
    }
  }, [selectedCategory]);

  const handleContentChange = (newContent: string) => {
    setCurrentContent(newContent);
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!selectedCategory || !hasChanges) return;

    setIsSaving(true);
    try {
      // Call API to save the changes
      const response = await fetch('/api/instructions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: selectedCategory,
          content: currentContent,
        }),
      });

      if (response.ok) {
        setHasChanges(false);
        alert('Instrukcije so bile uspešno shranjene!');
      } else {
        throw new Error('Napaka pri shranjevanju');
      }
    } catch (error) {
      alert('Napaka pri shranjevanju instrukcij. Poskusite znova.');
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCategoryData = INSTRUCTION_CATEGORIES.find(cat => cat.id === selectedCategory);

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Urednik instrukcij
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Upravljaj in uredi instrukcije za različne agente
            </p>
          </div>
          
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isSaving ? 'Shranjujem...' : 'Shrani spremembe'}
            </button>
          )}
        </div>

        {/* Category selector */}
        <div className="mt-6">
          <label htmlFor="category-select" className="block text-sm font-medium text-gray-700 mb-2">
            Izberi kategorijo instrukcij
          </label>
          <div className="relative max-w-md">
            <select
              id="category-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="block w-full px-4 py-3 bg-white border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-900 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors appearance-none cursor-pointer"
            >
              <option value="" className="text-gray-500">-- Izberi kategorijo --</option>
              {INSTRUCTION_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id} className="text-gray-900 py-2">
                  📋 {category.name} - {category.description}
                </option>
              ))}
            </select>
            {/* Custom dropdown arrow */}
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
              <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 10.44l3.71-3.21a.75.75 0 111.04 1.08l-4.25 3.65a.75.75 0 01-1.04 0L5.21 8.27a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
        </div>

        {selectedCategoryData && (
          <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
            <h3 className="text-sm font-semibold text-blue-900 flex items-center">
              📝 {selectedCategoryData.name}
            </h3>
            <p className="text-sm text-blue-700 mt-1">
              {selectedCategoryData.description}
            </p>
          </div>
        )}

        {hasChanges && (
          <div className="mt-4 p-4 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-lg border border-amber-200">
            <p className="text-sm text-amber-800 flex items-center font-medium">
              ⚠️ Imate neshranjene spremembe
            </p>
          </div>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        {selectedCategory ? (
          <MarkdownEditor
            key={selectedCategory}
            initialContent={currentContent}
            onChange={handleContentChange}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <p className="text-lg">Izberite kategorijo instrukcij za začetek urejanja</p>
              <p className="text-sm mt-2">Uporabite spustni meni zgoraj za izbiro kategorije</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
