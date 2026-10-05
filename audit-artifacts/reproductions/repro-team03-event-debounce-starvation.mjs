/**
 * REPRODUCTION SCRIPT: TEAM03-002 (HIGH)
 * Trailing Debounce Event Starvation in Main Process dataUpdateEvent
 *
 * Demonstrates:
 * If dataUpdateEvent is called at regular intervals < 1000ms (e.g. every 500ms
 * during library scanning, asset generation, or scrobble syncing):
 * 1. clearTimeout(dataUpdateEventTimeOutId) cancels the pending flush every single time.
 * 2. As long as periodic events continue, the timer NEVER fires.
 * 3. dataEventsCache grows monotonically in memory, and the renderer receives ZERO
 *    events, leaving the UI completely frozen and desynchronized.
 */

class MockMainEventDispatcher {
  dataUpdateEventTimeOutId = null;
  dataEventsCache = [];
  eventsSentToRenderer = 0;

  dataUpdateEvent(dataType, data = [], message) {
    if (this.dataUpdateEventTimeOutId) {
      clearTimeout(this.dataUpdateEventTimeOutId);
    }

    this.addEventsToCache(dataType, data, message);

    this.dataUpdateEventTimeOutId = setTimeout(() => {
      this.eventsSentToRenderer += this.dataEventsCache.length;
      this.dataEventsCache = [];
    }, 1000);
  }

  addEventsToCache(dataType, data = [], message) {
    this.dataEventsCache.push({ dataType, eventData: [{ data, message }] });
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const dispatcher = new MockMainEventDispatcher();

  console.log('--- Step 1: Simulate continuous library events every 400ms for 3 seconds ---');
  const startTime = Date.now();
  let tick = 0;

  const interval = setInterval(() => {
    tick++;
    dispatcher.dataUpdateEvent('songs/updatedSong', [tick]);
    console.log(`[t=${Date.now() - startTime}ms] Fired event #${tick}. Cache size: ${dispatcher.dataEventsCache.length}, Sent to renderer: ${dispatcher.eventsSentToRenderer}`);
  }, 400);

  // Run for 2.5 seconds (6 events, all within <1000ms of each other)
  await sleep(2500);
  clearInterval(interval);

  console.log('\n--- Step 2: Check status during active traffic ---');
  console.log(`Total events generated: ${tick}`);
  console.log(`Events in main process cache: ${dispatcher.dataEventsCache.length}`);
  console.log(`Events delivered to renderer: ${dispatcher.eventsSentToRenderer}`);

  if (dispatcher.eventsSentToRenderer === 0 && dispatcher.dataEventsCache.length > 0) {
    console.log('\n[HIGH BUG CONFIRMED] Pure trailing debounce without maxWait completely starves renderer updates!');
    console.log(`Renderer received 0 updates across 2.5 seconds despite ${tick} database updates occurring.`);
  }

  console.log('\n--- Step 3: Wait 1.1s of total silence for trailing timer to finally fire ---');
  await sleep(1100);
  console.log(`Events delivered to renderer after traffic stopped: ${dispatcher.eventsSentToRenderer}`);
}

run().catch(console.error);
