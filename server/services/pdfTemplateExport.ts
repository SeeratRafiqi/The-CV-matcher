import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const CONTENT_MARGIN = 40; // points from each edge
const FONT_SIZE = 10;
const LINE_HEIGHT = 12;
const WHITE = rgb(1, 1, 1);

/**
 * Build a PDF that keeps the user's original CV template (design, colours, style)
 * and overlays the revised content. Uses pdf-lib: copy original pages, then draw
 * a white content area and the new text on top.
 */
export async function buildPdfFromOriginalTemplate(
  originalPdfPath: string,
  tailoredText: string
): Promise<Buffer> {
  const absolutePath = path.isAbsolute(originalPdfPath)
    ? originalPdfPath
    : path.resolve(process.cwd(), originalPdfPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error('Original CV file not found');
  }

  const pdfBytes = fs.readFileSync(absolutePath);
  const sourceDoc = await PDFDocument.load(pdfBytes);
  const pageCount = sourceDoc.getPageCount();
  if (pageCount === 0) throw new Error('Original PDF has no pages');

  const newDoc = await PDFDocument.create();
  const copiedPages = await newDoc.copyPages(sourceDoc, Array.from({ length: pageCount }, (_, i) => i));
  copiedPages.forEach((p) => newDoc.addPage(p));

  const pages = newDoc.getPages();
  const font = await newDoc.embedFont(StandardFonts.Helvetica);

  const lines = (tailoredText || '').trim().split(/\r?\n/);
  const linesPerPage = Math.max(1, Math.ceil(lines.length / pageCount));
  let lineIndex = 0;

  for (let p = 0; p < pages.length; p++) {
    const page = pages[p];
    const { width, height } = page.getSize();
    const contentWidth = width - CONTENT_MARGIN * 2;
    const contentHeight = height - CONTENT_MARGIN * 2;
    const contentLeft = CONTENT_MARGIN;
    const contentBottom = CONTENT_MARGIN;

    // White rectangle over content area so revised text is readable (preserves border/design at edges)
    page.drawRectangle({
      x: contentLeft,
      y: contentBottom,
      width: contentWidth,
      height: contentHeight,
      color: WHITE,
      opacity: 1,
    });

    // Draw tailored text for this page (top-down)
    let y = height - CONTENT_MARGIN - FONT_SIZE;
    const endLine = Math.min(lineIndex + linesPerPage, lines.length);
    const maxTextWidth = contentWidth - 4;

    while (lineIndex < endLine && y >= contentBottom + FONT_SIZE) {
      const line = lines[lineIndex] || ' ';
      const words = line.split(/\s+/);
      let run: string[] = [];

      for (const word of words) {
        const testRun = run.length ? [...run, word].join(' ') : word;
        const textWidth = font.widthOfTextAtSize(testRun, FONT_SIZE);
        if (textWidth <= maxTextWidth) {
          run.push(word);
        } else {
          if (run.length) {
            const text = run.join(' ');
            page.drawText(text, {
              x: contentLeft + 2,
              y,
              size: FONT_SIZE,
              font,
              color: rgb(0.1, 0.1, 0.1),
            });
            y -= LINE_HEIGHT;
            run = [word];
          } else {
            page.drawText(word, {
              x: contentLeft + 2,
              y,
              size: FONT_SIZE,
              font,
              color: rgb(0.1, 0.1, 0.1),
            });
            y -= LINE_HEIGHT;
          }
        }
      }
      if (run.length) {
        page.drawText(run.join(' '), {
          x: contentLeft + 2,
          y,
          size: FONT_SIZE,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= LINE_HEIGHT;
      }
      lineIndex++;
    }
  }

  const bytes = await newDoc.save();
  return Buffer.from(bytes);
}
