'use strict';
const { PDFDocument, degrees } = require('pdf-lib');
const fs = require('fs/promises');
const { pageIndices } = require('../core/options.cjs');
const { cancelled } = require('./proc.cjs');
async function transform({ inputs, output, opts, signal, onProgress }) {
  const result = await PDFDocument.create();
  for (let i = 0; i < inputs.length; i++) {
    if (signal?.aborted) throw cancelled();
    const src = await PDFDocument.load(await fs.readFile(inputs[i]));
    const ids = pageIndices(opts.pages, src.getPageCount());
    const pages = await result.copyPages(src, ids);
    for (const page of pages) {
      if (opts.rotate) page.setRotation(degrees((page.getRotation().angle + opts.rotate) % 360));
      result.addPage(page);
    }
    onProgress?.((i + 1) / inputs.length * .9);
  }
  if (signal?.aborted) throw cancelled();
  await fs.writeFile(output, await result.save({ useObjectStreams: true }));
  return { pages: result.getPageCount() };
}
module.exports = { transform };
