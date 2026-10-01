import { copyFileSync } from 'node:fs';
import { buildOracle, runOracle } from './oracle';
buildOracle();
runOracle('generate', 'tests/fixtures');
copyFileSync('tests/fixtures/normal-binary.sav', 'src/assets/demo.sav');
console.log('Created 6 synthetic save fixtures using the original Emuera writers, plus the browser demo.');
