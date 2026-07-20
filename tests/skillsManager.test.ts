import test from 'node:test';
import assert from 'node:assert/strict';

export interface SkillItem {
  id: string;
  name: string;
  agent_type: string;
  scope: string;
  path: string;
  plugin_name?: string;
  description?: string;
  has_skill_md: boolean;
  file_count: number;
  size_bytes: number;
}

export const filterSkills = (skills: SkillItem[], query: string, agentFilter: string): SkillItem[] => {
  return skills.filter((s) => {
    const matchesAgent =
      agentFilter === 'all' ||
      (agentFilter === 'plugins' && s.scope === 'plugin') ||
      (agentFilter === 'vault' && s.scope === 'vault') ||
      s.agent_type === agentFilter ||
      (agentFilter === 'workspace' && s.scope === 'workspace');
    const q = query.toLowerCase().trim();
    const matchesQuery =
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q)) ||
      (s.plugin_name && s.plugin_name.toLowerCase().includes(q));
    return matchesAgent && matchesQuery;
  });
};

test('filters plugin and vault skills correctly', () => {
  const sampleSkills: SkillItem[] = [
    { id: '1', name: 'Git Workflow', agent_type: 'gemini', scope: 'global', path: '/p1', has_skill_md: true, file_count: 1, size_bytes: 100 },
    { id: '2', name: 'Claude Plugin Skill', agent_type: 'claude', scope: 'plugin', plugin_name: 'superpowers', path: '/p2', has_skill_md: true, file_count: 2, size_bytes: 200 },
    { id: '3', name: 'Archived Skill', agent_type: 'vault', scope: 'vault', path: '/p3', has_skill_md: true, file_count: 1, size_bytes: 150 },
  ];

  assert.equal(filterSkills(sampleSkills, '', 'all').length, 3);
  assert.equal(filterSkills(sampleSkills, '', 'plugins').length, 1);
  assert.equal(filterSkills(sampleSkills, '', 'vault').length, 1);
  assert.equal(filterSkills(sampleSkills, 'superpowers', 'all').length, 1);
});
