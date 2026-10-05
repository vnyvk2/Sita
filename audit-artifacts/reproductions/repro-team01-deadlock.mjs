// Reproduction script demonstrating nested withTxLock self-deadlock
let txLock = null;

const withTxLock = async (fn) => {
  const prev = txLock;
  let release;
  const lock = new Promise((resolve) => (release = resolve));
  txLock = lock;
  try {
    if (prev) await prev;
    return await fn();
  } finally {
    release();
    if (txLock === lock) txLock = null;
  }
};

async function runRepro() {
  console.log('[REPRO] Testing nested withTxLock self-deadlock...');
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('DEADLOCK TIMEOUT: Lock held indefinitely across nested caller')), 1000)
  );

  const test = withTxLock(async () => {
    console.log('[REPRO] Outer transaction acquired lock');
    return await withTxLock(async () => {
      console.log('[REPRO] Inner transaction attempting to acquire lock');
      return 'SUCCESS';
    });
  });

  try {
    await Promise.race([test, timeout]);
  } catch (err) {
    console.log('[REPRO CONFIRMED]', err.message);
  }
}

runRepro();
