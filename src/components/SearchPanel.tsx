import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  ChevronRight, 
  ChevronDown, 
  FileText, 
  RefreshCw, 
  Replace, 
  FolderSearch, 
  CornerDownRight, 
  CheckCheck
} from 'lucide-react';
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

interface SearchResponse {
  results: SearchResult[];
  truncated: boolean;
}

export const SearchPanel: React.FC = () => {
  const { activeWorkspace, openFile, triggerFileUpdate } = useWorkspaceStore();
  const [query, setQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [isReplaceOpen, setIsReplaceOpen] = useState(true);
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false); // UI toggle
  
  const [results, setResults] = useState<SearchResult[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Tracking expanded state of each file's matches
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [replaceSuccessMessage, setReplaceSuccessMessage] = useState<string | null>(null);
  const searchRequestId = useRef(0);

  const rootPath = activeWorkspace?.path || '/Users/ray/git-repo/black_tde';

  // Debounced search trigger
  useEffect(() => {
    searchRequestId.current += 1;
    const delayDebounceFn = setTimeout(() => {
      if (query.trim()) {
        handleSearch();
      } else {
        setResults([]);
        setTruncated(false);
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [query, matchCase, wholeWord, rootPath]);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    const requestId = ++searchRequestId.current;
    setLoading(true);
    setError(null);
    setReplaceSuccessMessage(null);
    try {
      const response = await invoke<SearchResponse>('search_project', {
        rootPath,
        query: trimmed,
        matchCase,
        wholeWord,
      });
      if (requestId !== searchRequestId.current) return;
      setResults(response.results);
      setTruncated(response.truncated);
      
      // Auto-expand all files on new search
      const expanded: Record<string, boolean> = {};
      response.results.forEach(item => {
        expanded[item.path] = true;
      });
      setExpandedFiles(expanded);
    } catch (err: any) {
      if (requestId !== searchRequestId.current) return;
      setError(err?.toString() || 'Search failed');
    } finally {
      if (requestId === searchRequestId.current) setLoading(false);
    }
  };

  const handleReplaceAll = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setReplaceSuccessMessage(null);
    try {
      const filesModified = await invoke<number>('replace_in_project', {
        rootPath,
        query: query.trim(),
        replaceStr: replaceText,
      });
      setReplaceSuccessMessage(`Successfully replaced in ${filesModified} file(s)`);
      // Trigger file refresh to sync latest content with open tab
      triggerFileUpdate();
      // Refresh search
      handleSearch();
    } catch (err: any) {
      setError(err?.toString() || 'Replacement failed');
      setLoading(false);
    }
  };

  const toggleFileExpand = (path: string) => {
    setExpandedFiles(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  };

  const getRelativePath = (absolutePath: string) => {
    if (absolutePath.startsWith(rootPath)) {
      return absolutePath.slice(rootPath.length).replace(/^[/\\]/, '');
    }
    return absolutePath;
  };

  const highlightMatch = (text: string, search: string) => {
    if (!search.trim()) return <span>{text}</span>;
    
    // Regular text search
    let parts: string[];
    if (matchCase) {
      parts = text.split(new RegExp(`(${search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'g'));
    } else {
      parts = text.split(new RegExp(`(${search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi'));
    }
    
    return (
      <>
        {parts.map((part, i) => {
          const isMatch = matchCase 
            ? part === search 
            : part.toLowerCase() === search.toLowerCase();
            
          return isMatch ? (
            <mark key={i} className="bg-brand/35 text-brand-light font-bold px-0.5 rounded border border-brand/20">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          );
        })}
      </>
    );
  };

  const totalResults = results.reduce((acc, curr) => acc + curr.matches_content.length, 0);

  return (
    <div className="h-full flex flex-col bg-surface-1/40 font-sans text-xs font-mono">
      
      {/* Header Panel */}
      <div className="p-3 border-b border-surface-2 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <FolderSearch size={14} className="text-brand-light" />
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-300 font-mono">
              Code Search
            </h3>
          </div>
          <button
            onClick={() => {
              setQuery('');
              setReplaceText('');
              setResults([]);
              setTruncated(false);
              setReplaceSuccessMessage(null);
            }}
            className="text-zinc-550 hover:text-zinc-300 transition cursor-pointer p-1 rounded hover:bg-surface-2"
            title="Clear Search Query"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin text-brand' : ''} />
          </button>
        </div>

        {/* Input Controls Block */}
        <div className="flex space-x-1 items-start">
          {/* Collapse/Expand Replace Box Trigger on the Left */}
          <button
            onClick={() => setIsReplaceOpen(!isReplaceOpen)}
            className="text-zinc-500 hover:text-zinc-300 transition cursor-pointer mt-1.5 shrink-0"
            title={isReplaceOpen ? "Collapse Replace" : "Expand Replace"}
          >
            {isReplaceOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {/* Input elements stack */}
          <div className="flex-grow space-y-2">
            
            {/* Search Input field wrapper */}
            <div className="relative flex items-center">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                autoFocus
                className="w-full bg-surface-2 border border-surface-3 rounded pl-2.5 pr-18 py-1 text-zinc-250 focus:outline-none focus:border-brand/70 font-mono text-[11px]"
              />
              
              {/* Option toggles (Aa, ab, *) inside the search box */}
              <div className="absolute right-1.5 flex items-center space-x-0.5 text-[9px] font-mono select-none">
                <button
                  onClick={() => setMatchCase(!matchCase)}
                  className={`px-1 py-0.5 rounded transition font-semibold cursor-pointer ${
                    matchCase 
                      ? 'bg-brand/20 text-brand-light border border-brand/35' 
                      : 'text-zinc-500 hover:text-zinc-350 border border-transparent'
                  }`}
                  title="Match Case (Aa)"
                >
                  Aa
                </button>
                <button
                  onClick={() => setWholeWord(!wholeWord)}
                  className={`px-1 py-0.5 rounded transition font-semibold cursor-pointer ${
                    wholeWord 
                      ? 'bg-brand/20 text-brand-light border border-brand/35' 
                      : 'text-zinc-500 hover:text-zinc-350 border border-transparent'
                  }`}
                  title="Match Whole Word (ab)"
                >
                  ab
                </button>
                <button
                  onClick={() => setUseRegex(!useRegex)}
                  className={`px-1 py-0.5 rounded transition font-semibold cursor-pointer ${
                    useRegex 
                      ? 'bg-brand/20 text-brand-light border border-brand/35' 
                      : 'text-zinc-500 hover:text-zinc-350 border border-transparent'
                  }`}
                  title="Use Regular Expression (*)"
                >
                  *
                </button>
              </div>
            </div>

            {/* Replace Input box (shown if isReplaceOpen is true) */}
            {isReplaceOpen && (
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  placeholder="Replace"
                  className="w-full bg-surface-2/70 border border-surface-3 rounded pl-2.5 pr-8 py-1 text-zinc-250 focus:outline-none focus:border-brand/70 font-mono text-[11px]"
                />
                
                {/* Replace Action button inside replace box */}
                <button
                  onClick={handleReplaceAll}
                  disabled={!query.trim() || loading}
                  className="absolute right-1.5 p-0.5 rounded text-zinc-500 hover:text-brand-light transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  title="Replace All"
                >
                  <Replace size={13} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Success message / Status messages */}
        {replaceSuccessMessage && (
          <div className="flex items-center space-x-1 text-emerald-450 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded font-mono text-[10px]">
            <CheckCheck size={11} className="shrink-0" />
            <span>{replaceSuccessMessage}</span>
          </div>
        )}
      </div>

      {/* Results block */}
      <div className="flex-grow overflow-y-auto p-3 space-y-2 min-h-0">
        
        {/* Results summary stats */}
        {results.length > 0 && (
          <div className="text-[10px] font-semibold text-zinc-400 font-mono flex items-center justify-between pb-1 select-none">
            <span>
              {totalResults} {totalResults === 1 ? 'result' : 'results'} in {results.length} {results.length === 1 ? 'file' : 'files'}
            </span>
            <span className="text-zinc-500 font-normal">Open in editor</span>
          </div>
        )}

        {error && (
          <div className="text-rose-450 p-2.5 bg-rose-500/10 border border-rose-500/20 rounded font-mono text-[10px]">
            {error}
          </div>
        )}

        {truncated && (
          <div className="text-amber-400 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded font-mono text-[10px]">
            Showing the first 2,000 matches. Refine the search to see more.
          </div>
        )}

        {!loading && results.length === 0 && query.trim() && (
          <div className="text-zinc-550 font-mono text-[10px] text-center py-6">
            No matches found
          </div>
        )}

        {!loading && results.length === 0 && !query.trim() && (
          <div className="text-zinc-600 font-mono text-[10px] text-center py-6 select-none">
            Type search string above...
          </div>
        )}

        {/* List of matching files */}
        {results.map((result) => {
          const isExpanded = expandedFiles[result.path] !== false;
          const relPath = getRelativePath(result.path);
          return (
            <div key={result.path} className="border border-surface-3 bg-surface-2/15 rounded-lg overflow-hidden">
              
              {/* File Title Accordion Row */}
              <div
                onClick={() => toggleFileExpand(result.path)}
                className="flex items-center justify-between px-2 py-1.5 bg-surface-2/45 hover:bg-surface-2 cursor-pointer transition select-none group border-b border-surface-3/50"
              >
                <div className="flex items-center space-x-1 truncate flex-grow">
                  <span className="text-zinc-500 mr-0.5 shrink-0">
                    {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  </span>
                  <FileText 
                    size={11.5} 
                    className="text-zinc-400 group-hover:text-brand-light shrink-0" 
                    onClick={(e) => {
                      e.stopPropagation();
                      openFile(result.path, result.name);
                    }}
                  />
                  <span 
                    className="font-semibold text-zinc-250 truncate font-mono text-[11px] hover:text-brand-light"
                    onClick={(e) => {
                      e.stopPropagation();
                      openFile(result.path, result.name);
                    }}
                  >
                    {result.name}
                  </span>
                  <span className="text-[9px] text-zinc-500 truncate pl-1 font-mono">
                    {relPath}
                  </span>
                </div>

                {/* Match count badge */}
                <span className="text-[9px] bg-surface-3 text-zinc-350 font-bold font-mono px-1.5 py-0.5 rounded-full shrink-0">
                  {result.matches_content.length || (result.matches_filename ? 1 : 0)}
                </span>
              </div>

              {/* Line Match Content List */}
              {isExpanded && result.matches_content.length > 0 && (
                <div className="p-1 space-y-0.5 bg-surface-1/10">
                  {result.matches_content.map((m) => (
                    <div
                      key={m.line_number}
                      onClick={() => openFile(result.path, result.name, m.line_number)}
                      className="flex items-start space-x-1.5 py-0.5 px-2 hover:bg-surface-3/35 rounded transition cursor-pointer select-none"
                    >
                      <CornerDownRight size={10} className="text-zinc-650 mt-1 shrink-0" />
                      <span className="text-[9px] font-mono text-zinc-500 w-6 text-right shrink-0 self-center">
                        L{m.line_number}
                      </span>
                      <span className="text-[10.5px] font-mono text-zinc-350 truncate flex-grow">
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
