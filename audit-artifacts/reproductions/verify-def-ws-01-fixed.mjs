import assert from 'node:assert';
import { normalizeWeights, assertWorkspaceInvariants } from '../../src/renderer/src/workspace/ops.ts';
import { sanitizeWorkspace } from '../../src/renderer/src/workspace/persistence.ts';

console.log('=== Running Verification DEF-WS-01 Fixed ===');

// 1. Test normalizeWeights with extremely small/narrow slot
const rawSlotPixelSizes = [1920, 300, 0.04];
console.log('Input slot sizes:', rawSlotPixelSizes);

const normalized = normalizeWeights(rawSlotPixelSizes);
console.log('Normalized weights:', normalized);

// Assert every weight is strictly positive (at least 0.001)
for (let i = 0; i < normalized.length; i++) {
  assert.ok(
    normalized[i] >= 0.001,
    `Weight at index ${i} should be >= 0.001, got ${normalized[i]}`
  );
}

// Assert sum is within 0.0001 of 1.0
const sum = normalized.reduce((acc, w) => acc + w, 0);
console.log('Sum of weights:', sum);
assert.ok(Math.abs(sum - 1.0) < 0.0001, `Weights must sum to 1.0, got ${sum}`);

// 2. Test Workspace with corrupted (0 weight) split node via sanitizeWorkspace
const corruptedWorkspace = {
  id: 'custom-workspace-1',
  name: 'Custom Layout',
  schemaVersion: 2,
  root: {
    kind: 'split',
    id: 'split-root',
    axis: 'x',
    children: [
      {
        kind: 'panel',
        panel: 'router-1'
      },
      {
        kind: 'panel',
        panel: 'queue-1'
      },
      {
        kind: 'panel',
        panel: 'lyrics-1'
      }
    ],
    weights: [0.865, 0.135, 0] // 0 weight from previous un-sanitized layout
  },
  panels: {
    'router-1': {
      id: 'router-1',
      type: 'router-view',
      local: {}
    },
    'queue-1': {
      id: 'queue-1',
      type: 'queue',
      local: {}
    },
    'lyrics-1': {
      id: 'lyrics-1',
      type: 'lyrics',
      local: {}
    }
  },
  frame: {
    playerBar: 'bottom',
    playerBarCompact: false
  }
};

const sanitized = sanitizeWorkspace(corruptedWorkspace);
assert.notStrictEqual(sanitized, null, 'sanitizeWorkspace must self-heal corrupted weights rather than returning null');

console.log('Sanitized workspace root weights:', sanitized.root.weights);
for (const w of sanitized.root.weights) {
  assert.ok(w >= 0.001, `Healed weight must be >= 0.001, got ${w}`);
}

// Test assertWorkspaceInvariants directly on sanitized workspace
assert.doesNotThrow(() => {
  assertWorkspaceInvariants(sanitized);
}, 'Sanitized workspace must satisfy assertWorkspaceInvariants');

console.log('=== DEF-WS-01 Verification Passed Successfully ===');
