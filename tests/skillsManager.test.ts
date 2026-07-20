import test from 'node:test';
import assert from 'node:assert/strict';

export interface SkillItem {
  id: string;
  name: string;
  agent_type: string;
  scope: string;
  path: string;
  description?: string;
  has_skill_md: boolean;
  file_count: number;
  size_bytes: number;
}

export const filterSkills = (skills: SkillItem[], query: string, agentFilter: string): SkillItem[] => {
  return skills.filter((s) => {
    const matchesAgent = agentFilter === 'all' || s.agent_type === agentFilter || (agentFilter === 'workspace' && s.scope === 'workspace');
    const q = query.toLowerCase().trim();
    const matchesQuery = !q || s.name.toLowerCase().includes(q) || (s.description && s.description.toLowerCase().includes(q));
    return matchesAgent && matchesQuery;
  });
};

test('filters skills correctly by search query and agent type', () => {
  const sampleSkills: SkillItem[] = [
    { id: '1', name: 'Git Workflow', agent_type: 'gemini', scope: 'global', path: '/p1', description: 'Git helper', has_skill_md: true, file_count: 1, size_bytes: 100 },
    { id: '2', name: 'Code Review', agent_type: 'claude', scope: 'global', path: '/p2', description: 'Review code', has_skill_md: true, file_count: 2, size_bytes: 200 },
    { id: '3', name: 'Local Helper', agent_type: 'gemini', scope: 'workspace', path: '/p3', description: 'Project skill', has_skill_md: true, file_count: 1, size_bytes: 150 },
  ];

  assert.equal(filterSkills(sampleSkills, '', 'all').length, 3);
  assert.equal(filterSkills(sampleSkills, 'git', 'all').length, 1);
  assert.equal(filterSkills(sampleSkills, '', 'claude').length, 1);
  assert.equal(filterSkills(sampleSkills, '', 'workspace').length, 1);
});
