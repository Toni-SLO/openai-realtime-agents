'use client';

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

interface MarkdownEditorProps {
  initialContent: string;
  onChange: (content: string) => void;
  className?: string;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  initialContent,
  onChange,
  className = "",
}) => {
  const [content, setContent] = useState(initialContent);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview' | 'split'>('split');

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    onChange(newContent);
  };

  return (
    <div className={`w-full h-full flex flex-col ${className}`}>
      {/* Toolbar */}
      <div className="flex border-b border-gray-200 bg-white">
        <button
          onClick={() => setActiveTab('edit')}
          className={`px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'edit'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          📝 Markdown
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'preview'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          👁️ Predogled
        </button>
        <button
          onClick={() => setActiveTab('split')}
          className={`px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'split'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          ⚡ Razdeljen
        </button>
      </div>

      {/* Editor content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Markdown editor */}
        {(activeTab === 'edit' || activeTab === 'split') && (
          <div className={`${activeTab === 'split' ? 'w-1/2' : 'w-full'} flex flex-col bg-gray-50`}>
            <textarea
              value={content}
              onChange={handleContentChange}
              className="flex-1 p-4 font-mono text-sm border-0 resize-none focus:outline-none focus:ring-0 bg-gray-50 text-gray-800 leading-relaxed"
              placeholder="Vnesite markdown besedilo..."
              style={{ minHeight: '500px' }}
            />
          </div>
        )}

        {/* Divider */}
        {activeTab === 'split' && (
          <div className="w-px bg-gray-200"></div>
        )}

        {/* Preview */}
        {(activeTab === 'preview' || activeTab === 'split') && (
          <div className={`${activeTab === 'split' ? 'w-1/2' : 'w-full'} overflow-auto bg-white`}>
            <div className="p-4 prose prose-gray max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-strong:text-gray-900 prose-code:text-blue-600 prose-code:bg-blue-50 prose-code:px-1 prose-code:rounded">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="text-2xl font-bold text-gray-900 mb-4 mt-6 first:mt-0">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-xl font-semibold text-gray-900 mb-3 mt-5">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-lg font-medium text-gray-900 mb-2 mt-4">{children}</h3>,
                  p: ({ children }) => <p className="text-gray-700 mb-3 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="text-gray-700">{children}</li>,
                  code: ({ children }) => <code className="text-blue-600 bg-blue-50 px-1 py-0.5 rounded text-sm font-mono">{children}</code>,
                  pre: ({ children }) => <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto mb-4">{children}</pre>,
                  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                  blockquote: ({ children }) => <blockquote className="border-l-4 border-blue-200 pl-4 italic text-gray-600 mb-4">{children}</blockquote>,
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
