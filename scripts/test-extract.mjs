import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { writeFileSync } from "fs";
import { basename } from "path";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node scripts/test-extract.mjs <path-to-pdf>");
  process.exit(1);
}

async function extractTextWithPositions(pdfPath) {
  const doc = await getDocument(pdfPath).promise;
  const result = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();

    const items = [];
    for (const item of textContent.items) {
      if (!("str" in item) || !item.str.trim()) continue;

      const tx = item.transform;
      items.push({
        text: item.str,
        x: tx[4],
        y: tx[5],
        width: item.width,
        height: item.height,
        // fontSize: Math.abs(tx[3]),
        // fontName: item.fontName,
      });
    }

    result.push({ page: i, width: viewport.width, height: viewport.height, items });
  }

  return result;
}

const result = await extractTextWithPositions(filePath);
const outPath = `scripts/${basename(filePath, ".pdf")}-extract.json`;
writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`Wrote ${outPath}`);
