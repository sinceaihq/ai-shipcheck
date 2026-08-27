#!/usr/bin/env node
/**
 * Render `assets/social-preview.svg` to the 1280x640 PNG GitHub expects.
 *
 * No image library is added for this. A social preview is regenerated a
 * handful of times in a project's life, and pulling a native rasteriser into
 * the dependency tree of a tool whose selling point is having almost none
 * would be a poor trade. The script uses whatever rasteriser the machine
 * already has, and says clearly what to install if it finds none.
 *
 * Usage: npm run assets:social
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = path.join(root, 'assets', 'social-preview.svg');
const png = path.join(root, 'assets', 'social-preview.png');

const WIDTH = 1280;
const HEIGHT = 640;

/** Whether an executable is on PATH, without going through a shell. */
function has(command) {
  const paths = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  return paths.some((dir) => {
    try {
      fs.accessSync(path.join(dir, command), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

/** Rasterisers in order of output quality, each returning true when it worked. */
const strategies = [
  {
    name: 'rsvg-convert',
    available: () => has('rsvg-convert'),
    render() {
      execFileSync('rsvg-convert', ['-w', String(WIDTH), '-h', String(HEIGHT), '-o', png, svg], {
        stdio: 'pipe',
      });
    },
  },
  {
    name: 'headless Chrome',
    available: () =>
      chromePaths().some((candidate) => fs.existsSync(candidate)) || has('google-chrome'),
    render() {
      const chrome = chromePaths().find((candidate) => fs.existsSync(candidate)) ?? 'google-chrome';
      const work = fs.mkdtempSync(path.join(os.tmpdir(), 'shipcheck-assets-'));
      // A wrapper page pins the viewport so the screenshot is exactly 1280x640
      // regardless of how the browser would otherwise scale a bare SVG.
      const html = path.join(work, 'preview.html');
      fs.writeFileSync(
        html,
        `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden}</style>${fs.readFileSync(svg, 'utf8')}`,
      );
      execFileSync(
        chrome,
        [
          '--headless',
          '--disable-gpu',
          '--hide-scrollbars',
          '--force-device-scale-factor=1',
          `--screenshot=${png}`,
          `--window-size=${WIDTH},${HEIGHT}`,
          `file://${html}`,
        ],
        { stdio: 'pipe' },
      );
      fs.rmSync(work, { recursive: true, force: true });
    },
  },
  {
    name: 'ImageMagick',
    available: () => has('magick') || has('convert'),
    render() {
      const binary = has('magick') ? 'magick' : 'convert';
      execFileSync(
        binary,
        ['-background', 'none', '-density', '144', svg, '-resize', `${WIDTH}x${HEIGHT}`, png],
        {
          stdio: 'pipe',
        },
      );
    },
  },
];

function chromePaths() {
  return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
}

if (!fs.existsSync(svg)) {
  console.error(`Missing source: ${path.relative(root, svg)}`);
  process.exit(1);
}

const strategy = strategies.find((s) => s.available());
if (strategy === undefined) {
  console.error(
    [
      'No SVG rasteriser found. Install one of:',
      '  brew install librsvg          (macOS, best output)',
      '  apt-get install librsvg2-bin  (Debian/Ubuntu)',
      '  or have Google Chrome installed',
      '',
      `The source SVG is committed at ${path.relative(root, svg)} and can be`,
      'exported from any vector editor if none of the above is convenient.',
    ].join('\n'),
  );
  process.exit(1);
}

strategy.render();

const { size } = fs.statSync(png);
console.log(
  `Rendered assets/social-preview.png via ${strategy.name} (${(size / 1024).toFixed(0)} KB)`,
);
