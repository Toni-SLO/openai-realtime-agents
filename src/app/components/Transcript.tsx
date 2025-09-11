"use-client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { TranscriptItem } from "@/app/types";
import Image from "next/image";
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { DownloadIcon, ClipboardCopyIcon } from "@radix-ui/react-icons";
import { GuardrailChip } from "./GuardrailChip";

// Helper function to get event icon like SIP Transcripts
function getEventIcon(item: TranscriptItem): string {
  if (item.type === 'MESSAGE') {
    return item.role === 'user' ? '👤' : item.role === 'assistant' ? '🤖' : '📝';
  } else if (item.type === 'BREADCRUMB') {
    if (item.title?.includes('SIP call')) return '📞';
    if (item.title?.includes('tool_call')) return '🔧';
    if (item.title?.includes('session')) return '📝';
    return '📋';
  }
  return '📝';
}

export interface TranscriptProps {
  userText: string;
  setUserText: (val: string) => void;
  onSendMessage: () => void;
  canSend: boolean;
  downloadRecording: () => void;
}

function Transcript({
  userText,
  setUserText,
  onSendMessage,
  canSend,
  downloadRecording,
}: TranscriptProps) {
  const { transcriptItems, toggleTranscriptItemExpand } = useTranscript();
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const [prevLogs, setPrevLogs] = useState<TranscriptItem[]>([]);
  const [justCopied, setJustCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function scrollToBottom() {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }

  useEffect(() => {
    const hasNewMessage = transcriptItems.length > prevLogs.length;
    const hasUpdatedMessage = transcriptItems.some((newItem, index) => {
      const oldItem = prevLogs[index];
      return (
        oldItem &&
        (newItem.title !== oldItem.title || newItem.data !== oldItem.data)
      );
    });

    if (hasNewMessage || hasUpdatedMessage) {
      scrollToBottom();
    }

    setPrevLogs(transcriptItems);
  }, [transcriptItems]);

  // Autofocus on text box input on load
  useEffect(() => {
    if (canSend && inputRef.current) {
      inputRef.current.focus();
    }
  }, [canSend]);

  const handleCopyTranscript = async () => {
    if (!transcriptRef.current) return;
    try {
      await navigator.clipboard.writeText(transcriptRef.current.innerText);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 1500);
    } catch (error) {
      console.error("Failed to copy transcript:", error);
    }
  };

  return (
    <div className="flex flex-col flex-1 bg-white min-h-0 rounded-xl">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between px-6 py-3 sticky top-0 z-10 text-base border-b bg-white rounded-t-xl">
          <span className="font-semibold">Transcript</span>
          <div className="flex gap-x-2">
            <button
              onClick={handleCopyTranscript}
              className="w-24 text-sm px-3 py-1 rounded-md bg-gray-200 hover:bg-gray-300 flex items-center justify-center gap-x-1"
            >
              <ClipboardCopyIcon />
              {justCopied ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={downloadRecording}
              className="w-40 text-sm px-3 py-1 rounded-md bg-gray-200 hover:bg-gray-300 flex items-center justify-center gap-x-1"
            >
              <DownloadIcon />
              <span>Download Audio</span>
            </button>
          </div>
        </div>

        {/* Transcript Content */}
        <div
          ref={transcriptRef}
          className="overflow-auto p-4 flex flex-col gap-y-4 h-full"
        >
          {[...transcriptItems]
            .sort((a, b) => a.createdAtMs - b.createdAtMs)
            .map((item) => {
              const {
                itemId,
                type,
                role,
                data,
                expanded,
                timestamp,
                title = "",
                isHidden,
                guardrailResult,
              } = item;

            if (isHidden) {
              return null;
            }

            // Use SIP Transcripts design for all items
            return (
              <div
                key={itemId}
                className="border-l-4 border-gray-200 pl-4 py-2"
              >
                {/* Header with event info like SIP Transcripts */}
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                  <span>{getEventIcon(item)}</span>
                  <span>{timestamp}</span>
                  <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                    {type.toLowerCase()}
                  </span>
                  {role && (
                    <span className="text-xs bg-blue-100 px-2 py-1 rounded">
                      {role}
                    </span>
                  )}
                </div>
                
                {/* Content */}
                {title && (
                  <div className="text-gray-800 bg-gray-50 p-2 rounded text-sm">
                    {type === 'MESSAGE' ? (
                      <div className="whitespace-pre-wrap">
                        <ReactMarkdown>{title}</ReactMarkdown>
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap font-mono text-xs">
                        {title}
                      </pre>
                    )}
                  </div>
                )}

                {/* Guardrail result */}
                {guardrailResult && (
                  <div className="mt-2 p-2 bg-yellow-50 rounded border border-yellow-200">
                    <GuardrailChip guardrailResult={guardrailResult} />
                  </div>
                )}

                {/* Expandable data like SIP Transcripts */}
                {data && (
                  <div className="mt-2 text-xs bg-blue-50 p-2 rounded border-l-2 border-blue-200">
                    <div 
                      className="font-semibold text-blue-700 mb-1 cursor-pointer flex items-center"
                      onClick={() => toggleTranscriptItemExpand(itemId)}
                    >
                      <span className={`mr-1 transform transition-transform duration-200 ${
                        expanded ? "rotate-90" : "rotate-0"
                      }`}>▶</span>
                      📋 Metadata:
                    </div>
                    {expanded && (
                      <pre className="text-blue-600 font-mono">
                        {JSON.stringify(data, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-4 flex items-center gap-x-2 flex-shrink-0 border-t border-gray-200">
        <input
          ref={inputRef}
          type="text"
          value={userText}
          onChange={(e) => setUserText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSend) {
              onSendMessage();
            }
          }}
          className="flex-1 px-4 py-2 focus:outline-none"
          placeholder="Type a message..."
        />
        <button
          onClick={onSendMessage}
          disabled={!canSend || !userText.trim()}
          className="bg-gray-900 text-white rounded-full px-2 py-2 disabled:opacity-50"
        >
          <Image src="arrow.svg" alt="Send" width={24} height={24} />
        </button>
      </div>
    </div>
  );
}

export default Transcript;
