import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PDFDocument = require('pdfkit');

/**
 * Generate a PDF buffer from plain text (e.g. improved CV text).
 * Uses simple formatting: title, body with line breaks.
 */
export async function textToPdfBuffer(text: string, title: string = 'CV'): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).font('Helvetica-Bold').text(title, { align: 'left' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text((text || '').trim(), { align: 'left', lineGap: 3 });

    doc.end();
  });
}
