import fs from 'fs';
import path from 'path';

const baselinePath = path.resolve(process.argv[2] || 'audit_p1_control.json');
const postFixPath = path.resolve(process.argv[3] || 'audit_3min_memory_report.json');

if (!fs.existsSync(baselinePath) || !fs.existsSync(postFixPath)) {
  console.log(`Both reports must exist to compare: ${baselinePath}, ${postFixPath}`);
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const postFix = JSON.parse(fs.readFileSync(postFixPath, 'utf8'));

console.log('========================================================================');
console.log(` A/B AUDIT COMPARISON: ${path.basename(baselinePath)} vs ${path.basename(postFixPath)}`);
console.log('========================================================================\n');

// Summarize by task
const tasks = [
  'Task 1: Cold Launch Idle',
  'Task 2: Songs Page Load',
  'Task 3: Rapid Scroll & Images',
  'Task 4: Nav -> Albums',
  'Task 4: Nav -> Artists',
  'Task 5: Search [love]',
  'Task 6: Standard MiniPlayer',
  'Task 6: Compact MiniPlayer',
  'Task 7: Post-GC Settled'
];

console.log(
  'Phase / Task'.padEnd(28) +
  ' | ' + 'Base TotalWS'.padStart(12) +
  ' | ' + 'Post TotalWS'.padStart(12) +
  ' | ' + 'Delta WS'.padStart(10) +
  ' | ' + 'Base RendWS'.padStart(11) +
  ' | ' + 'Post RendWS'.padStart(11) +
  ' | ' + 'Base Nodes'.padStart(10) +
  ' | ' + 'Post Nodes'.padStart(10)
);
console.log('-'.repeat(105));

for (const t of tasks) {
  const bSamples = baseline.filter(s => s.task === t);
  const pSamples = postFix.filter(s => s.task === t);
  if (bSamples.length > 0 && pSamples.length > 0) {
    const b = bSamples[bSamples.length - 1];
    const p = pSamples[pSamples.length - 1];
    const dWS = Math.round((p.totalWS - b.totalWS) * 100) / 100;
    const sign = dWS > 0 ? `+${dWS}` : `${dWS}`;
    console.log(
      t.padEnd(28) +
      ' | ' + (b.totalWS + ' MB').padStart(12) +
      ' | ' + (p.totalWS + ' MB').padStart(12) +
      ' | ' + (sign + ' MB').padStart(10) +
      ' | ' + (b.rendererWS + ' MB').padStart(11) +
      ' | ' + (p.rendererWS + ' MB').padStart(11) +
      ' | ' + String(b.domNodes).padStart(10) +
      ' | ' + String(p.domNodes).padStart(10)
    );
  }
}

// Peak comparison
const bPeak = Math.max(...baseline.map(s => s.totalWS));
const pPeak = Math.max(...postFix.map(s => s.totalWS));
console.log('\n========================================================================');
console.log(`Peak Total Working Set: Baseline = ${bPeak} MB | Post-Fix = ${pPeak} MB (Delta: ${Math.round((pPeak - bPeak)*100)/100} MB)`);
const bFinal = baseline[baseline.length - 1];
const pFinal = postFix[postFix.length - 1];
console.log(`Final Settled Post-GC:  Baseline = ${bFinal.totalWS} MB | Post-Fix = ${pFinal.totalWS} MB (Delta: ${Math.round((pFinal.totalWS - bFinal.totalWS)*100)/100} MB)`);
console.log('========================================================================\n');
