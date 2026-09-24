import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlanFrontmatter, resolvePlanFile } from '../src/server/plan-files.js';

describe('plan-files', () => {
  it('parses plan frontmatter name and overview', () => {
    const raw = `---
name: Test Plan from Web
overview: Fix View Plan so it shows the saved .md plan file.
todos: []
---
# Body
`;
    const meta = parsePlanFrontmatter(raw);
    assert.equal(meta.name, 'Test Plan from Web');
    assert.match(meta.overview || '', /Fix View Plan/);
  });

  it('resolvePlanFile finds a plan by description when label is missing', () => {
    const resolved = resolvePlanFile({
      title: 'Plan',
      description:
        'Fix View Plan so it shows the saved .md plan file in the web modal (or hides the button when content is unavailable)',
    });
    assert.ok(resolved, 'expected a resolved plan file');
    assert.match(resolved!.label, /\.plan\.md$/);
    assert.match(resolved!.data.body, /#|Fix View Plan|Test/i);
  });
});
