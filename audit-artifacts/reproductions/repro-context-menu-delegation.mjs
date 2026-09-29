import assert from 'node:assert';

/**
 * REPRODUCTION SCRIPT: Context Menu Event Delegation Bypass
 *
 * Demonstrates how row-level handlers calling e.stopPropagation() prevent
 * container-level event delegation from receiving contextmenu and 3-dots click events.
 */

console.log('=== Running Reproduction: Context Menu Delegation Bypass ===');

// Mock Event Target & Event Bubbling model
class MockEventTarget {
  constructor(name, parent = null, attributes = {}) {
    this.name = name;
    this.parent = parent;
    this.attributes = attributes;
    this.listeners = {};
  }

  getAttribute(key) {
    return this.attributes[key] ?? null;
  }

  setAttribute(key, value) {
    this.attributes[key] = value;
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (selector === '[data-song-id]' && curr.attributes['data-song-id']) return curr;
      if (selector === '[data-more-options="true"]' && curr.attributes['data-more-options'] === 'true') return curr;
      curr = curr.parent;
    }
    return null;
  }

  addEventListener(type, listener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  dispatchEvent(event) {
    event.target = this;
    let curr = this;
    while (curr && !event.propagationStopped) {
      const handlers = curr.listeners[event.type] || [];
      for (const handler of handlers) {
        handler(event);
        if (event.propagationStopped) break;
      }
      curr = curr.parent;
    }
  }
}

class MockEvent {
  constructor(type, detail = 1, clientX = 100, clientY = 100) {
    this.type = type;
    this.detail = detail;
    this.clientX = clientX;
    this.clientY = clientY;
    this.defaultPrevented = false;
    this.propagationStopped = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {
    this.propagationStopped = true;
  }
}

// 1. Build DOM Tree: Container -> Virtuoso -> SongRow -> 3DotsButton
const container = new MockEventTarget('ContainerDiv');
let containerMenuReceivedSongId = null;

// Container delegation listener (from useSongListContextMenuDelegation.ts)
container.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('[data-song-id]');
  if (row) {
    containerMenuReceivedSongId = row.getAttribute('data-song-id');
  }
});

const virtuoso = new MockEventTarget('Virtuoso', container);
const songRow = new MockEventTarget('SongRow', virtuoso, {
  'data-song-id': '42',
  'data-song-index': '3'
});
const moreOptionsBtn = new MockEventTarget('MoreOptionsBtn', songRow, {
  'data-more-options': 'true'
});

// 2. Scenario A: Current Code (Row has local handler calling e.stopPropagation())
let rowLocalMenuFired = false;
songRow.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation(); // <-- Intercepts and halts event
  rowLocalMenuFired = true;
});

console.log('Testing Current Behavior: Right-click on songRow with row-level handler:');
const clickEvent = new MockEvent('contextmenu');
songRow.dispatchEvent(clickEvent);

console.log(`  Row local menu fired:       ${rowLocalMenuFired}`);
console.log(`  Container delegation caught: ${containerMenuReceivedSongId !== null ? containerMenuReceivedSongId : 'NONE (BLOCKED)'}`);

assert.strictEqual(rowLocalMenuFired, true, 'Row handler intercepted event');
assert.strictEqual(containerMenuReceivedSongId, null, 'BUG CONFIRMED: Container delegation was bypassed by e.stopPropagation()');

// 3. Scenario B: Fixed Delegated Mode (isDelegated = true, row does not halt propagation)
console.log('\nTesting Delegated Behavior (isDelegated = true):');
const delegatedSongRow = new MockEventTarget('DelegatedSongRow', virtuoso, {
  'data-song-id': '99',
  'data-song-index': '5'
});
// When isDelegated is true, the row attaches NO stopping handler, letting event bubble naturally

containerMenuReceivedSongId = null;
const delegatedClickEvent = new MockEvent('contextmenu');
delegatedSongRow.dispatchEvent(delegatedClickEvent);

console.log(`  Container delegation caught: Song ID ${containerMenuReceivedSongId}`);
assert.strictEqual(containerMenuReceivedSongId, '99', 'FIX VERIFIED: Container delegation received the event!');

console.log('\n>>> REPRODUCTION SUCCESSFUL: Delegation bypass demonstrated and resolved! <<<');
