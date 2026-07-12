import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Search, Loader2, FileText, CornerDownRight } from 'lucide-react';
import { useWorkspaceStore } from '../store/workspaceStore';

interface SearchMatch {
  line_number: number;
  line_content: string;
}

interface SearchResult {
  path: string;
  name: string;
  matches_content: SearchMatch[];
  matches_filename: boolean;
}

export const SearchPanel: React.FC = () => {
  const { activeWorkspace, openFile } = useWorkspaceStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rootPath = activeWorkspace?.path || '/Users/ray/git-repo/black_tde';

  const handleSearch = async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<SearchResult[]>('search_project', {
        rootPath,
        query: trimmed,
      });
      setResults(res);
    } catch (err: any) {
      setError(err?.toString() || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const getRelativePath = (absolutePath: string) => {
    if (absolutePath.startsWith(rootPath)) {
      return absolutePath.slice(rootPath.length).replace(/^[/\\]/, '');
    }
    return absolutePath;
  };

  const highlightMatch = (text: string, search: string) => {
    if (!search.trim()) return <span>{text}</span>;
    const parts = text.split(new RegExp(`(${search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === search.toLowerCase() ? (
            <mark key={i} className="bg-brand/30 text-brand-light font-bold px-0.5 rounded">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  };

  return (
    <div className="h-full flex flex-col bg-surface-1/40 font-sans text-xs">
      <div className="p-4 border-b border-surface-2 space-y-3">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">
          Search in Project
        </h3>
        
        {/* Search Input Box */}
        <div className="relative">
          <input
            type="text"
            value={query}
            autoFocus
            onChange={(e) => {
              setQuery(e.target.value);
              handleSearch(e.target.value);
            }}
            placeholder="Search filenames or contents..."
            className="w-full bg-surface-2 border border-surface-3 rounded pl-8 pr-8 py-1.5 text-zinc-250 focus:outline-none focus:border-brand/70 font-mono text-xs"
          />
          <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
          {loading && (
            <Loader2 size={13} className="absolute right-2.5 top-2.5 text-brand animate-spin" />
          )}
        </div>
      </div>

      {/* Results Listing */}
      <div className="flex-grow overflow-y-auto p-3 space-y-3 min-h-0">
        {error && (
          <div className="text-rose-450 p-2 bg-rose-500/10 border border-rose-500/20 rounded font-mono text-[10px]">
            {error}
          </div>
        )}

        {!loading && results.length === 0 && query.trim() && (
          <div className="text-zinc-500 font-mono text-[10px] text-center py-6">
            No matches found
          </div>
        )}

        {!loading && results.length === 0 && !query.trim() && (
          <div className="text-zinc-600 font-mono text-[10px] text-center py-6">
            Type query above to search files...
          </div>
        )}

        {results.map((result) => {
          const relPath = getRelativePath(result.path);
          return (
            <div key={result.path} className="border border-surface-3 bg-surface-2/20 rounded-lg overflow-hidden">
              {/* File Title Header */}
              <div
                onClick={() => openFile(result.path, result.name)}
                className="flex items-center justify-between px-2.5 py-1.5 bg-surface-2/50 hover:bg-surface-2 border-b border-surface-3 cursor-pointer transition select-none group"
              >
                <div className="flex items-center space-x-1.5 truncate">
                  <FileText size={12} className="text-zinc-400 group-hover:text-brand-light" />
                  <span className="font-semibold text-zinc-200 truncate font-mono">
                    {result.name}
                  </span>
                  <span className="text-[9px] text-zinc-500 truncate max-w-[120px]">
                    {relPath}
                  </span>
                </div>
                {result.matches_filename && (
                  <span className="text-[8px] bg-brand/20 text-brand-light font-bold font-mono px-1 py-0.5 rounded border border-brand/30 shrink-0">
                    name
                  </span>
                )}
              </div>

              {/* Line Matches */}
              {result.matches_content.length > 0 && (
                <div className="p-1.5 space-y-1 bg-surface-1/20">
                  {result.matches_content.map((m) => (
                    <div
                      key={m.line_number}
                      onClick={() => openFile(result.path, result.name)}
                      className="flex items-start space-x-2 py-0.5 px-1.5 hover:bg-surface-3/40 rounded transition cursor-pointer select-none"
                    >
                      <CornerDownRight size={10} className="text-zinc-600 self-center shrink-0" />
                      <span className="text-[9px] font-mono text-zinc-500 w-6 text-right shrink-0">
                        L{m.line_number}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400 truncate flex-grow">
                        {highlightMatch(m.line_content, query)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
