/**
 * Render the app icons.
 *
 * A one-off: the PNGs it produces are committed, so this is not part of the build and
 * nothing depends on playwright at runtime. Run again only if the mark changes.
 *
 * The mark is the app's own palette, black and white, with the ring standing for a
 * day tracked and the bars for the grid the dashboard is built from.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require(require.resolve("playwright-core", { paths: [path.resolve(__dirname, "../..")] }));

const PUBLIC = path.resolve(__dirname, "../public");
const OUT = path.join(PUBLIC, "icons");

/** @param {{size:number, maskable:boolean}} opts */
function markup({ size, maskable }) {
  // A maskable icon is cropped to whatever shape the launcher wants, so the mark has
  // to sit inside the safe circle at 80% of the canvas and the background must bleed
  // to the edges. The plain icon uses the whole square with rounded corners instead.
  // A maskable icon is cropped to whatever shape the launcher wants, so the mark has
  // to sit inside the safe circle at 80% of the canvas and the background must bleed
  // to the edges. The plain icon uses the whole square with rounded corners instead.
  const pad = maskable ? size * 0.24 : size * 0.2;
  const inner = size - pad * 2;
  const radius = maskable ? 0 : size * 0.22;
  const cx = size / 2;
  const baseline = size / 2 + inner * 0.42;

  // Four rising bars: the shape of a month on the dashboard, and still legible at the
  // sixteen pixels a browser tab gives it.
  const heights = [0.4, 0.62, 0.82, 1];
  const barW = inner * 0.16;
  const gap = inner * 0.115;
  const totalW = barW * 4 + gap * 3;
  const bars = heights
    .map((h, i) => {
      const height = inner * 0.84 * h;
      const x = cx - totalW / 2 + i * (barW + gap);
      return `<rect x="${x}" y="${baseline - height}" width="${barW}" height="${height}" rx="${barW * 0.4}" fill="#ffffff" fill-opacity="${0.55 + i * 0.15}" />`;
    })
    .join("");

  return `<!doctype html><html><head><style>
    html,body{margin:0;padding:0;background:transparent}
    svg{display:block}
  </style></head><body>
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" fill="#09090b" />
    ${bars}
  </svg></body></html>`;
}

const TARGETS = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
  { file: "apple-touch-icon.png", size: 180, maskable: false },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const target of TARGETS) {
    await page.setViewportSize({ width: target.size, height: target.size });
    await page.setContent(markup(target));
    const buffer = await page.screenshot({ omitBackground: true, type: "png" });
    fs.writeFileSync(path.join(OUT, target.file), buffer);
    console.log(target.file, buffer.length, "bytes");
  }

  // The favicon stays vector: it is the one place a browser will happily scale SVG.
  fs.writeFileSync(path.join(PUBLIC, "app-icon.svg"), markup({ size: 512, maskable: false }).match(/<svg[\s\S]*<\/svg>/)[0]);
  console.log("app-icon.svg written");

  await browser.close();
})();
