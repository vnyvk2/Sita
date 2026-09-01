import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read styles.css
const stylesPath = path.join(__dirname, '../src/renderer/src/assets/styles/styles.css');
const styles = fs.readFileSync(stylesPath, 'utf8');

// The required semantic variables
const requiredLightVars = [
  '--background-color-1',
  '--background-color-2',
  '--background-color-3',
  '--background-color-dimmed',
  '--side-bar-background',
  '--text-color',
  '--text-color-dimmed',
  '--text-color-highlight',
  '--text-color-highlight-2',
  '--seekbar-background-color',
  '--seekbar-track-background-color',
  '--foreground-color-1',
  '--context-menu-background',
  '--context-menu-list-hover'
];

const requiredDarkVars = requiredLightVars.map((v) => v.replace('--', '--dark-'));

// Since we can't easily import a TS file directly without ts-node in a plain script,
// let's just parse the TS file with a regex to extract the modes for now.

const registryPath = path.join(__dirname, '../src/common/themeRegistry.ts');
const registryCode = fs.readFileSync(registryPath, 'utf8');
const themes = [];
const regex =
  /(\w+):\s*\{\s*id:\s*['"](\w+)['"],\s*nameKey:[^,]+,\s*mode:\s*['"](light|dark|adaptive)['"]/g;
let match;
while ((match = regex.exec(registryCode)) !== null) {
  themes.push({ id: match[2], mode: match[3] });
}

let allPassed = true;

console.log('Testing Theme CSS Contracts...\n');

for (const theme of themes) {
  if (theme.id === 'default') continue; // Default doesn't have a data-theme, it's the root

  const selectorRegex = new RegExp(`\\[data-theme=['"]${theme.id}['"]\\][^{]*\\{([^}]+)\\}`, 'g');
  const match = selectorRegex.exec(styles);

  if (!match) {
    console.error(`❌ Theme '${theme.id}' is missing from styles.css!`);
    allPassed = false;
    continue;
  }

  const cssContent = match[1];

  const checkVars = (requiredVars, modeLabel) => {
    const missing = [];
    for (const v of requiredVars) {
      if (!cssContent.includes(v + ':')) {
        missing.push(v);
      }
    }
    if (missing.length > 0) {
      console.error(
        `❌ Theme '${theme.id}' (mode: ${theme.mode}) is missing ${modeLabel} variables:\n  ${missing.join(', ')}`
      );
      allPassed = false;
    } else {
      console.log(`✅ Theme '${theme.id}' has all required ${modeLabel} variables.`);
    }
  };

  if (theme.mode === 'light' || theme.mode === 'adaptive') {
    checkVars(requiredLightVars, 'Light');
  }

  if (theme.mode === 'dark' || theme.mode === 'adaptive') {
    checkVars(requiredDarkVars, 'Dark');
  }
}

if (!allPassed) {
  console.log('\n❌ Theme Contract Test Failed. Please add the missing variables to styles.css.');
  process.exit(1);
} else {
  console.log('\n✅ All themes satisfy their CSS contracts!');
}
