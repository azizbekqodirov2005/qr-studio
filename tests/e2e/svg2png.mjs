// Rasterises an SVG file to PNG (used by the e2e suite to decode downloaded SVGs).
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
const [, , input, output] = process.argv;
const png = new Resvg(readFileSync(input, 'utf8'), { background: '#ffffff', fitTo: { mode: 'width', value: 1000 } }).render();
writeFileSync(output, png.asPng());
