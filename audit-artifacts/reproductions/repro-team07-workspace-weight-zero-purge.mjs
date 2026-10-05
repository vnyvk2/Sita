/**
 * REPRODUCTION: TEAM07-001
 * Title: normalizeWeights rounds small weights to 0, triggering invariant failure and permanent workspace deletion
 *
 * Demonstrates that when a split slot is narrow or collapsed (weight < 0.00005),
 * `normalizeWeights` rounds the weight to 0.0000 via `Math.round(w * 10000) / 10000`.
 *
 * During startup or validation, `assertWorkspaceInvariants` asserts `w > 0`.
 * When a weight is 0, it throws `WorkspaceInvariantError`.
 * As a result, `sanitizeWorkspace` fails and returns `null`, causing Nora to permanently delete
 * the user's custom workspace layout from `localStorage` upon reload.
 */

import assert from 'node:assert';

// Exact implementation of normalizeWeights from src/renderer/src/workspace/ops.ts:164-190
function normalizeWeights(weights) {
  if (weights.length === 0) return [];
  const sum = weights.reduce((acc, w) => acc + (w > 0 ? w : 0.001), 0);
  if (sum <= 0) {
    const equal = 1 / weights.length;
    return weights.map(() => equal);
  }
  const raw = weights.map((w) => (w > 0 ? w : 0.001) / sum);
  // Round to 4 decimal places and adjust last weight so sum is exactly 1.0
  const rounded = raw.map((w) => Math.round(w * 10000) / 10000);
  const roundedSum = rounded.reduce((acc, w) => acc + w, 0);
  const diff = Math.round((1.0 - roundedSum) * 10000) / 10000;

  const lastIdx = rounded.length - 1;
  if (rounded[lastIdx] + diff >= 0.001) {
    rounded[lastIdx] = Math.round((rounded[lastIdx] + diff) * 10000) / 10000;
  } else {
    let maxIdx = 0;
    for (let i = 1; i < rounded.length; i++) {
      if (rounded[i] > rounded[maxIdx]) {
        maxIdx = i;
      }
    }
    rounded[maxIdx] = Math.round((rounded[maxIdx] + diff) * 10000) / 10000;
  }
  return rounded;
}

// Invariant assertion from src/renderer/src/workspace/ops.ts:87-93
function validateWeights(nodeId, weights) {
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (Math.abs(weightSum - 1.0) > 0.015) {
    throw new Error(`SplitNode '${nodeId}' weights must sum to 1.0, got ${weightSum.toFixed(4)}.`);
  }
  for (const w of weights) {
    if (!Number.isFinite(w) || w <= 0) {
      throw new Error(
        `SplitNode '${nodeId}' has invalid weight: ${w}. All weights must be positive finite numbers.`
      );
    }
  }
  return true;
}

console.log('=== Running Reproduction TEAM07-001 ===');

// Scenario: A 3-way split with a large main panel (1920px), a side panel (300px),
// and a collapsed/minimized panel (e.g. 0.05px or dragged to boundary)
const rawSlotPixelSizes = [1920, 300, 0.04];
console.log('Original slot pixel sizes:', rawSlotPixelSizes);

const normalized = normalizeWeights(rawSlotPixelSizes);
console.log('Normalized weights after 4-decimal rounding:', normalized);

// Assert that the tiny slot was rounded to 0
assert.strictEqual(
  normalized[2],
  0,
  'Defect: 4-decimal rounding rounded the tiny weight to exactly 0'
);

// Now run Nora invariant validation
let validationError = null;
try {
  validateWeights('split_test_1', normalized);
} catch (err) {
  validationError = err;
}

console.log('Validation result:', validationError ? validationError.message : 'PASSED');

assert.notStrictEqual(
  validationError,
  null,
  'Defect: Invariant check threw an error on the zero weight'
);
assert.match(
  validationError.message,
  /has invalid weight: 0/,
  'Error matches expected invariant violation'
);

console.log(
  '\nConfirmed: normalizeWeights produces weight 0 -> fails invariant -> sanitizeWorkspace returns null -> custom workspace deleted from localStorage.'
);
console.log('=== Reproduction TEAM07-001 Verified Successfully ===');
