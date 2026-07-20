import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWorkspaceStore } from '../store/workspaceStore';
import { AgentIcon } from './AgentIcon';
import {
  Sparkles,
  Search,
  Plus,
  GitPullRequest,
  Copy,
  FolderInput,
  Trash2,
  FileText,
  X,
  Check,
  RefreshCw,
  Loader2,
  Globe,
  Folder
} from 'lucide-react';

export interface SkillItem {
  id: string;
  name: string;
  agent_type: string; // "gemini", "claude", "codex", "aider"
  scope: string;      // "global", "workspace"
  path: string;
  description?: string;
  has_skill_md: boolean;
  file_count: number;
  size_bytes: number;
}

export const filterSkills = (skills: SkillItem[], query: string, agentFilter: string): SkillItem[] => {
  return skills.filter((s) => {
    const matchesAgent =
      agentFilter === 'all' ||
      s.agent_type === agentFilter ||
      (agentFilter === 'workspace' && s.scope === 'workspace');
    const q = query.toLowerCase().trim();
    const matchesQuery =
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q)) ||
      s.path.toLowerCase().includes(q);
    return matchesAgent && matchesQuery;
  });
};

export const SkillsPanel: React.FC = () => {
  const { activeWorkspace, setActiveRightPanel } = useWorkspaceStore();
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [agentFilter, setAgentFilter] = useState('all');

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [transferModalSkill, setTransferModalSkill] = useState<{ skill: SkillItem; mode: 'copy' | 'move' } | null>(null);
  const [editSkill, setEditSkill] = useState<SkillItem | null>(null);
  const [deleteConfirmSkill, setDeleteConfirmSkill] = useState<SkillItem | null>(null);

  // Form states
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createAgent, setCreateAgent] = useState('gemini');
  const [createScope, setCreateScope] = useState('global');

  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneAgent, setCloneAgent] = useState('gemini');
  const [cloneScope, setCloneScope] = useState('global');
  const [cloneCustomName, setCloneCustomName] = useState('');

  const [targetAgent, setTargetAgent] = useState('claude');
  const [targetScope, setTargetScope] = useState('global');

  const [skillFileContent, setSkillFileContent] = useState('');
  const [isSavingContent, setIsSavingContent] = useState(false);

  const fetchSkills = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<SkillItem[]>('list_agent_skills', {
        workspacePath: activeWorkspace?.path || null,
      });
      setSkills(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSkills();
  }, [activeWorkspace?.path]);

  const handleCreateSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    setLoading(true);
    try {
      await invoke('create_skill', {
        agentType: createAgent,
        scope: createScope,
        workspacePath: activeWorkspace?.path || null,
        name: createName.trim(),
        description: createDesc.trim(),
      });
      setShowCreateModal(false);
      setCreateName('');
      setCreateDesc('');
      await fetchSkills();
    } catch (err) {
      alert(`Failed to create skill: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCloneSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneUrl.trim()) return;
    setLoading(true);
    try {
      await invoke('clone_skill', {
        gitUrl: cloneUrl.trim(),
        targetAgent: cloneAgent,
        scope: cloneScope,
        workspacePath: activeWorkspace?.path || null,
        newName: cloneCustomName.trim() || null,
      });
      setShowCloneModal(false);
      setCloneUrl('');
      setCloneCustomName('');
      await fetchSkills();
    } catch (err) {
      alert(`Failed to clone skill: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTransferSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferModalSkill) return;
    const { skill, mode } = transferModalSkill;
    setLoading(true);
    try {
      if (mode === 'copy') {
        await invoke('copy_skill', {
          sourcePath: skill.path,
          targetAgent: targetAgent,
          scope: targetScope,
          workspacePath: activeWorkspace?.path || null,
          newName: null,
        });
      } else {
        await invoke('move_skill', {
          sourcePath: skill.path,
          targetAgent: targetAgent,
          scope: targetScope,
          workspacePath: activeWorkspace?.path || null,
          newName: null,
        });
      }
      setTransferModalSkill(null);
      await fetchSkills();
    } catch (err) {
      alert(`Failed to ${mode} skill: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSkill = async () => {
    if (!deleteConfirmSkill) return;
    setLoading(true);
    try {
      await invoke('delete_skill', { path: deleteConfirmSkill.path });
      setDeleteConfirmSkill(null);
      await fetchSkills();
    } catch (err) {
      alert(`Failed to delete skill: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = async (skill: SkillItem) => {
    setEditSkill(skill);
    setSkillFileContent('');
    try {
      const content = await invoke<string>('read_skill_file', {
        skillPath: skill.path,
        relativeFile: 'SKILL.md',
      });
      setSkillFileContent(content);
    } catch (err) {
      setSkillFileContent(`# ${skill.name}\n\nNo SKILL.md file found.`);
    }
  };

  const handleSaveEdit = async () => {
    if (!editSkill) return;
    setIsSavingContent(true);
    try {
      await invoke('save_skill_file', {
        skillPath: editSkill.path,
        relativeFile: 'SKILL.md',
        content: skillFileContent,
      });
      setEditSkill(null);
      await fetchSkills();
    } catch (err) {
      alert(`Failed to save SKILL.md: ${err}`);
    } finally {
      setIsSavingContent(false);
    }
  };

  const filteredSkills = filterSkills(skills, searchQuery, agentFilter);

  return (
    <div className="flex flex-col h-full bg-surface-1 border-l border-surface-2 text-zinc-300 font-sans text-xs">
      {/* Header toolbar */}
      <div className="p-3 border-b border-surface-2 flex items-center justify-between bg-surface-2/30">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-brand-light" />
          <span className="font-semibold text-zinc-100 text-sm">Skills Manager</span>
          <span className="text-[10px] bg-brand/20 text-brand-light px-1.5 py-0.5 rounded-full font-mono">
            {skills.length}
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => void fetchSkills()}
            className="p-1 hover:bg-surface-2 rounded text-zinc-400 hover:text-zinc-200 transition"
            title="Refresh skills list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setActiveRightPanel('none')}
            className="p-1 hover:bg-surface-2 rounded text-zinc-400 hover:text-zinc-200 transition"
            title="Close panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Action buttons bar */}
      <div className="p-2.5 border-b border-surface-2 bg-surface-1 flex items-center gap-2">
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex-1 flex items-center justify-center space-x-1.5 bg-brand hover:bg-brand-dark text-white font-medium py-1.5 px-2.5 rounded text-xs transition shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Skill</span>
        </button>
        <button
          onClick={() => setShowCloneModal(true)}
          className="flex-1 flex items-center justify-center space-x-1.5 bg-surface-2 hover:bg-surface-3 text-zinc-200 font-medium py-1.5 px-2.5 rounded text-xs transition border border-surface-3"
        >
          <GitPullRequest className="w-3.5 h-3.5 text-brand-light" />
          <span>Clone Git</span>
        </button>
      </div>

      {/* Search & Agent Filters */}
      <div className="p-2.5 border-b border-surface-2 space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search skills by name, prompt, agent..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface-2 border border-surface-3 rounded pl-8 pr-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-brand/60"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[11px] scrollbar-none">
          {[
            { id: 'all', label: 'All' },
            { id: 'gemini', label: 'Gemini' },
            { id: 'claude', label: 'Claude' },
            { id: 'codex', label: 'Codex' },
            { id: 'aider', label: 'Aider' },
            { id: 'workspace', label: 'Workspace' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setAgentFilter(tab.id)}
              className={`px-2 py-1 rounded-md transition whitespace-nowrap font-medium ${
                agentFilter === tab.id
                  ? 'bg-brand/20 text-brand-light border border-brand/40'
                  : 'bg-surface-2/60 hover:bg-surface-2 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Skills list */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {loading && skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 space-y-2 text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin text-brand" />
            <span>Scanning agent skills directories...</span>
          </div>
        ) : error ? (
          <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded text-rose-300 text-xs">
            {error}
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 space-y-2 text-zinc-500 text-center px-4">
            <Sparkles className="w-8 h-8 opacity-30" />
            <p className="font-medium text-zinc-400">No skills found</p>
            <p className="text-[11px]">
              {searchQuery ? 'Try adjusting your search query or filter.' : 'Create or clone a skill into an agent directory.'}
            </p>
          </div>
        ) : (
          filteredSkills.map((skill) => (
            <div
              key={skill.id}
              className="p-3 rounded-lg border border-surface-3/60 bg-surface-2/30 hover:bg-surface-2/60 transition space-y-2 group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center space-x-2 truncate">
                  <AgentIcon name={skill.agent_type} size={18} />
                  <span className="font-semibold text-zinc-100 truncate text-xs" title={skill.name}>
                    {skill.name}
                  </span>
                </div>
                <div className="flex items-center space-x-1 shrink-0">
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-medium border ${
                      skill.scope === 'workspace'
                        ? 'bg-amber-950/40 text-amber-300 border-amber-800/40'
                        : 'bg-indigo-950/40 text-indigo-300 border-indigo-800/40'
                    }`}
                  >
                    {skill.scope === 'workspace' ? 'Workspace' : 'Global'}
                  </span>
                </div>
              </div>

              {skill.description && (
                <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                  {skill.description}
                </p>
              )}

              <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-surface-3/30 font-mono">
                <div className="truncate max-w-[170px]" title={skill.path}>
                  {skill.path.replace(/^.*[\\/]/, '')} ({skill.file_count} files)
                </div>
                <div className="flex items-center space-x-1 opacity-90 group-hover:opacity-100 transition">
                  <button
                    onClick={() => void handleOpenEdit(skill)}
                    className="p-1 hover:bg-surface-3 rounded text-zinc-400 hover:text-zinc-200"
                    title="View/Edit SKILL.md"
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setTransferModalSkill({ skill, mode: 'copy' });
                      setTargetAgent(skill.agent_type);
                      setTargetScope(skill.scope === 'global' ? 'workspace' : 'global');
                    }}
                    className="p-1 hover:bg-surface-3 rounded text-zinc-400 hover:text-zinc-200"
                    title="Copy skill to agent"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setTransferModalSkill({ skill, mode: 'move' });
                      setTargetAgent(skill.agent_type);
                      setTargetScope(skill.scope === 'global' ? 'workspace' : 'global');
                    }}
                    className="p-1 hover:bg-surface-3 rounded text-zinc-400 hover:text-zinc-200"
                    title="Move skill to agent"
                  >
                    <FolderInput className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirmSkill(skill)}
                    className="p-1 hover:bg-rose-950/50 rounded text-zinc-500 hover:text-rose-400"
                    title="Delete skill"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal: Create Skill */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface-1 border border-surface-3 rounded-lg w-full max-w-md p-4 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-surface-2 pb-2">
              <h3 className="font-semibold text-zinc-100 text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-brand-light" />
                Create New Skill
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateSkill} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Skill Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Code Reviewer"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Target Agent</label>
                <select
                  value={createAgent}
                  onChange={(e) => setCreateAgent(e.target.value)}
                  className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-brand"
                >
                  <option value="gemini">Gemini / Antigravity (~/.gemini/skills)</option>
                  <option value="claude">Claude Code (~/.claude/skills)</option>
                  <option value="codex">Codex CLI (~/.codex/skills)</option>
                  <option value="aider">Aider (~/.aider/skills)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Target Scope</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateScope('global')}
                    className={`py-1.5 px-2 rounded border text-xs font-medium flex items-center justify-center gap-1.5 ${
                      createScope === 'global'
                        ? 'bg-brand/20 border-brand/50 text-brand-light'
                        : 'bg-surface-2 border-surface-3 text-zinc-400'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Global Agent</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateScope('workspace')}
                    disabled={!activeWorkspace}
                    className={`py-1.5 px-2 rounded border text-xs font-medium flex items-center justify-center gap-1.5 ${
                      createScope === 'workspace'
                        ? 'bg-amber-950/40 border-amber-800/50 text-amber-300'
                        : 'bg-surface-2 border-surface-3 text-zinc-400 opacity-60'
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>Workspace Only</span>
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Description / Instructions</label>
                <textarea
                  rows={3}
                  placeholder="Describe what this skill does..."
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  className="w-full bg-surface-2 border border-surface-3 rounded p-2 text-xs text-zinc-100 focus:outline-none focus:border-brand"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-surface-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded bg-surface-2 hover:bg-surface-3 text-zinc-300 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-brand hover:bg-brand-dark text-white text-xs font-medium"
                >
                  Create Skill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Clone Skill */}
      {showCloneModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface-1 border border-surface-3 rounded-lg w-full max-w-md p-4 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-surface-2 pb-2">
              <h3 className="font-semibold text-zinc-100 text-sm flex items-center gap-2">
                <GitPullRequest className="w-4 h-4 text-brand-light" />
                Clone Skill from Git Repository
              </h3>
              <button onClick={() => setShowCloneModal(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCloneSkill} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Git Repository URL</label>
                <input
                  type="url"
                  required
                  placeholder="https://github.com/user/my-agent-skill.git"
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                  className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-brand font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">Target Agent</label>
                  <select
                    value={cloneAgent}
                    onChange={(e) => setCloneAgent(e.target.value)}
                    className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-brand"
                  >
                    <option value="gemini">Gemini</option>
                    <option value="claude">Claude</option>
                    <option value="codex">Codex</option>
                    <option value="aider">Aider</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">Target Scope</label>
                  <select
                    value={cloneScope}
                    onChange={(e) => setCloneScope(e.target.value)}
                    className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-brand"
                  >
                    <option value="global">Global</option>
                    <option value="workspace" disabled={!activeWorkspace}>Workspace</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Custom Folder Name (Optional)</label>
                <input
                  type="text"
                  placeholder="Leave empty to use repository name"
                  value={cloneCustomName}
                  onChange={(e) => setCloneCustomName(e.target.value)}
                  className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-brand font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-surface-2">
                <button
                  type="button"
                  onClick={() => setShowCloneModal(false)}
                  className="px-3 py-1.5 rounded bg-surface-2 hover:bg-surface-3 text-zinc-300 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-brand hover:bg-brand-dark text-white text-xs font-medium"
                >
                  Clone Skill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Transfer (Copy/Move) Skill */}
      {transferModalSkill && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface-1 border border-surface-3 rounded-lg w-full max-w-md p-4 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-surface-2 pb-2">
              <h3 className="font-semibold text-zinc-100 text-sm capitalize flex items-center gap-2">
                {transferModalSkill.mode === 'copy' ? <Copy className="w-4 h-4 text-brand-light" /> : <FolderInput className="w-4 h-4 text-brand-light" />}
                {transferModalSkill.mode} Skill: {transferModalSkill.skill.name}
              </h3>
              <button onClick={() => setTransferModalSkill(null)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleTransferSkill} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Target Agent</label>
                <select
                  value={targetAgent}
                  onChange={(e) => setTargetAgent(e.target.value)}
                  className="w-full bg-surface-2 border border-surface-3 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-brand"
                >
                  <option value="gemini">Gemini / Antigravity</option>
                  <option value="claude">Claude Code</option>
                  <option value="codex">Codex CLI</option>
                  <option value="aider">Aider</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Target Scope</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetScope('global')}
                    className={`py-1.5 px-2 rounded border text-xs font-medium flex items-center justify-center gap-1.5 ${
                      targetScope === 'global'
                        ? 'bg-brand/20 border-brand/50 text-brand-light'
                        : 'bg-surface-2 border-surface-3 text-zinc-400'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Global</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetScope('workspace')}
                    disabled={!activeWorkspace}
                    className={`py-1.5 px-2 rounded border text-xs font-medium flex items-center justify-center gap-1.5 ${
                      targetScope === 'workspace'
                        ? 'bg-amber-950/40 border-amber-800/50 text-amber-300'
                        : 'bg-surface-2 border-surface-3 text-zinc-400 opacity-60'
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>Workspace</span>
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-surface-2">
                <button
                  type="button"
                  onClick={() => setTransferModalSkill(null)}
                  className="px-3 py-1.5 rounded bg-surface-2 hover:bg-surface-3 text-zinc-300 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-brand hover:bg-brand-dark text-white text-xs font-medium capitalize"
                >
                  {transferModalSkill.mode} Skill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View/Edit SKILL.md */}
      {editSkill && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface-1 border border-surface-3 rounded-lg w-full max-w-2xl h-[75vh] flex flex-col p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-surface-2 pb-2">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-brand-light" />
                <span className="font-semibold text-zinc-100 text-sm">Editing SKILL.md — {editSkill.name}</span>
              </div>
              <button onClick={() => setEditSkill(null)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 flex flex-col min-h-0">
              <textarea
                value={skillFileContent}
                onChange={(e) => setSkillFileContent(e.target.value)}
                className="w-full flex-1 bg-black/80 border border-surface-3 rounded p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:border-brand/80 resize-none leading-relaxed"
              />
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-surface-2">
              <span className="text-[10px] text-zinc-500 font-mono truncate max-w-sm">{editSkill.path}/SKILL.md</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditSkill(null)}
                  className="px-3 py-1.5 rounded bg-surface-2 hover:bg-surface-3 text-zinc-300 text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleSaveEdit()}
                  disabled={isSavingContent}
                  className="px-3 py-1.5 rounded bg-brand hover:bg-brand-dark text-white text-xs font-medium flex items-center gap-1.5"
                >
                  {isSavingContent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete */}
      {deleteConfirmSkill && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface-1 border border-surface-3 rounded-lg w-full max-w-sm p-4 space-y-3 shadow-xl">
            <h3 className="font-semibold text-rose-400 text-sm">Delete Skill</h3>
            <p className="text-xs text-zinc-300">
              Are you sure you want to delete <strong className="text-zinc-100">{deleteConfirmSkill.name}</strong>?
              This will remove the skill folder at <code className="text-[10px] bg-surface-2 px-1 py-0.5 rounded text-amber-300 font-mono block mt-1 truncate">{deleteConfirmSkill.path}</code>.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-surface-2">
              <button
                onClick={() => setDeleteConfirmSkill(null)}
                className="px-3 py-1.5 rounded bg-surface-2 text-zinc-300 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDeleteSkill()}
                className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
