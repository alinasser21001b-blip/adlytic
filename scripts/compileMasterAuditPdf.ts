#!/usr/bin/env npx tsx
// ════════════════════════════════════════════════════════════════════════
//  scripts/compileMasterAuditPdf.ts
//
//  Converts ADLYTIC_MASTER_ARCHITECT_AUDIT_2026.md → Adlytic_Master_Software_Audit.pdf
//
//  Usage:
//    npx tsx scripts/compileMasterAuditPdf.ts
//    npx tsx scripts/compileMasterAuditPdf.ts --input docs/custom.md --output out.pdf
// ════════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function parseArgs(): { input: string; output: string } {
  const args = process.argv.slice(2);
  let input = path.join(REPO_ROOT, 'ADLYTIC_MASTER_ARCHITECT_AUDIT_2026.md');
  let output = path.join(REPO_ROOT, 'Adlytic_Master_Software_Audit.pdf');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) input = path.resolve(args[++i]);
    if (args[i] === '--output' && args[i + 1]) output = path.resolve(args[++i]);
  }
  return { input, output };
}

type Block =
  | { kind: 'h1' | 'h2' | 'h3'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'code'; text: string }
  | { kind: 'hr' }
  | { kind: 'table'; rows: string[][] };

function stripInlineMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.+?)\]\([^)]+\)/g, '$1')
    .trim();
}

function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ kind: 'code', text: codeLines.join('\n') });
      i++;
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }

    const h1 = line.match(/^# (.+)$/);
    if (h1) { blocks.push({ kind: 'h1', text: stripInlineMd(h1[1]) }); i++; continue; }
    const h2 = line.match(/^## (.+)$/);
    if (h2) { blocks.push({ kind: 'h2', text: stripInlineMd(h2[1]) }); i++; continue; }
    const h3 = line.match(/^### (.+)$/);
    if (h3) { blocks.push({ kind: 'h3', text: stripInlineMd(h3[1]) }); i++; continue; }

    if (/^\|.+\|$/.test(line)) {
      const tableRows: string[][] = [];
      while (i < lines.length && /^\|.+\|$/.test(lines[i])) {
        if (!/^\|[\s\-:|]+\|$/.test(lines[i])) {
          tableRows.push(
            lines[i].split('|').slice(1, -1).map((c) => stripInlineMd(c.trim())),
          );
        }
        i++;
      }
      if (tableRows.length) blocks.push({ kind: 'table', rows: tableRows });
      continue;
    }

    if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(stripInlineMd(lines[i].replace(/^[-*] /, '')));
        i++;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(stripInlineMd(lines[i].replace(/^\d+\. /, '')));
        i++;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }

    if (line.trim() === '') { i++; continue; }

    const paraLines: string[] = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !/^#/.test(lines[i]) && !/^[-*] /.test(lines[i]) && !/^\d+\. /.test(lines[i]) && !/^```/.test(lines[i]) && !/^\|/.test(lines[i]) && !/^---/.test(lines[i])) {
      paraLines.push(lines[i].trim());
      i++;
    }
    blocks.push({ kind: 'p', text: stripInlineMd(paraLines.join(' ')) });
  }

  return blocks;
}

function ensureSpace(doc: PdfDoc, needed: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

type PdfDoc = InstanceType<typeof PDFDocument>;

async function renderPdf(blocks: Block[], outputPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 54, bottom: 54, left: 54, right: 54 },
      info: {
        Title: 'Adlytic Master Software Audit 2026',
        Author: 'Adlytic Architecture Review',
        Subject: 'Production-grade architecture audit',
      },
    });

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const bodySize = 9.5;
    const codeSize = 8;
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.font('Helvetica');

    for (const block of blocks) {
      switch (block.kind) {
        case 'h1':
          ensureSpace(doc, 40);
          doc.moveDown(0.5);
          doc.font('Helvetica-Bold').fontSize(20).fillColor('#111827').text(block.text, { width: pageWidth });
          doc.moveDown(0.4);
          doc.font('Helvetica').fontSize(bodySize).fillColor('#1f2937');
          break;
        case 'h2':
          ensureSpace(doc, 32);
          doc.moveDown(0.6);
          doc.font('Helvetica-Bold').fontSize(14).fillColor('#1e3a8a').text(block.text, { width: pageWidth });
          doc.moveDown(0.25);
          doc.font('Helvetica').fontSize(bodySize).fillColor('#1f2937');
          break;
        case 'h3':
          ensureSpace(doc, 24);
          doc.moveDown(0.4);
          doc.font('Helvetica-Bold').fontSize(11).fillColor('#374151').text(block.text, { width: pageWidth });
          doc.moveDown(0.15);
          doc.font('Helvetica').fontSize(bodySize).fillColor('#1f2937');
          break;
        case 'p':
          ensureSpace(doc, 16);
          doc.font('Helvetica').fontSize(bodySize).fillColor('#1f2937').text(block.text, {
            width: pageWidth,
            align: 'left',
            lineGap: 2,
          });
          doc.moveDown(0.35);
          break;
        case 'ul':
          for (const item of block.items) {
            ensureSpace(doc, 14);
            doc.font('Helvetica').fontSize(bodySize).fillColor('#1f2937').text(`• ${item}`, {
              width: pageWidth - 12,
              indent: 12,
              lineGap: 1,
            });
          }
          doc.moveDown(0.3);
          break;
        case 'ol':
          block.items.forEach((item, idx) => {
            ensureSpace(doc, 14);
            doc.font('Helvetica').fontSize(bodySize).fillColor('#1f2937').text(`${idx + 1}. ${item}`, {
              width: pageWidth - 12,
              indent: 12,
              lineGap: 1,
            });
          });
          doc.moveDown(0.3);
          break;
        case 'code':
          ensureSpace(doc, 40);
          doc.font('Courier').fontSize(codeSize).fillColor('#111827');
          doc.rect(doc.page.margins.left - 4, doc.y, pageWidth + 8, Math.min(220, 12 + block.text.split('\n').length * 10))
            .fill('#f3f4f6');
          doc.fillColor('#111827').text(block.text, {
            width: pageWidth - 8,
            indent: 4,
            lineGap: 1,
          });
          doc.font('Helvetica').fontSize(bodySize).fillColor('#1f2937');
          doc.moveDown(0.4);
          break;
        case 'hr':
          ensureSpace(doc, 12);
          doc.moveDown(0.2);
          doc.strokeColor('#d1d5db').moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
          doc.moveDown(0.4);
          break;
        case 'table':
          for (const row of block.rows) {
            ensureSpace(doc, 14);
            const isHeader = block.rows.indexOf(row) === 0;
            doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(isHeader ? 9 : 8.5);
            doc.fillColor('#1f2937').text(row.join('  |  '), { width: pageWidth, lineGap: 0.5 });
          }
          doc.font('Helvetica').fontSize(bodySize);
          doc.moveDown(0.35);
          break;
      }
    }

    const range = doc.bufferedPageRange();
    for (let p = range.start; p < range.start + range.count; p++) {
      doc.switchToPage(p);
      doc.font('Helvetica').fontSize(8).fillColor('#6b7280');
      doc.text(
        `Adlytic Master Audit 2026 — Page ${p + 1} of ${range.count}`,
        doc.page.margins.left,
        doc.page.height - doc.page.margins.bottom + 18,
        { width: pageWidth, align: 'center' },
      );
    }

    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}

async function main(): Promise<void> {
  const { input, output } = parseArgs();
  if (!fs.existsSync(input)) {
    console.error(`[compileMasterAuditPdf] Input not found: ${input}`);
    process.exit(1);
  }
  const md = fs.readFileSync(input, 'utf8');
  const blocks = parseMarkdown(md);
  await renderPdf(blocks, output);
  const stat = fs.statSync(output);
  console.log(`[compileMasterAuditPdf] Wrote ${output} (${(stat.size / 1024).toFixed(1)} KiB)`);
}

main().catch((err) => {
  console.error('[compileMasterAuditPdf] Failed:', err);
  process.exit(1);
});
