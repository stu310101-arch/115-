import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

type ReviewProgram = {
  programCode: string;
  programName: string;
  reasons: string[];
};

type ReviewDocument = { programs: ReviewProgram[] };

const root = new URL("../work/official-115/", import.meta.url);
const review = JSON.parse(
  await readFile(new URL("review.json", root), "utf8"),
) as ReviewDocument;
const outputDirectory = new URL("review-sheets/", root);
await mkdir(outputDirectory, { recursive: true });

const cells = review.programs.flatMap((program) =>
  program.reasons.flatMap((reason) => {
    const match = reason.match(/順序(\d+)/u);
    return match
      ? [{
          key: `${program.programCode}-${match[1]}`,
          programCode: program.programCode,
          programName: program.programName,
          order: Number(match[1]),
        }]
      : [];
  }),
);

const uniqueCells = [...new Map(cells.map((cell) => [cell.key, cell])).values()];
const cardWidth = 600;
const cardHeight = 190;
const columns = 3;
const rows = 5;
const perSheet = columns * rows;
const sheets: Array<{ path: string; cells: typeof uniqueCells }> = [];

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]!);
}

for (let offset = 0; offset < uniqueCells.length; offset += perSheet) {
  const pageCells = uniqueCells.slice(offset, offset + perSheet);
  const composites: sharp.OverlayOptions[] = [];
  for (const [index, cell] of pageCells.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = column * cardWidth;
    const top = row * cardHeight;
    const imagePath = fileURLToPath(
      new URL(`threshold-cells/${cell.key}.png`, root),
    );
    const image = await sharp(imagePath)
      .resize({
        width: cardWidth - 24,
        height: cardHeight - 48,
        fit: "contain",
        background: "white",
      })
      .png()
      .toBuffer();
    const label = Buffer.from(
      `<svg width="${cardWidth}" height="42" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="100%" height="100%" fill="#102632"/>` +
        `<text x="12" y="27" fill="white" font-family="Arial, sans-serif" ` +
        `font-size="20" font-weight="700">${escapeXml(cell.key)}</text></svg>`,
    );
    composites.push({ input: label, left, top });
    composites.push({ input: image, left: left + 12, top: top + 42 });
  }

  const sheetNumber = Math.floor(offset / perSheet) + 1;
  const path = fileURLToPath(
    new URL(`review-${String(sheetNumber).padStart(2, "0")}.png`, outputDirectory),
  );
  await sharp({
    create: {
      width: cardWidth * columns,
      height: cardHeight * rows,
      channels: 3,
      background: "#ffffff",
    },
  })
    .composite(composites)
    .png()
    .toFile(path);
  sheets.push({ path, cells: pageCells });
}

await writeFile(
  new URL("index.json", outputDirectory),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), sheets }, null, 2)}\n`,
  "utf8",
);
console.log(`Created ${sheets.length} review sheets for ${uniqueCells.length} cells.`);
