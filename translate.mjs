import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const model = 'hf.co/jgchaparro/language_garden-tsd-ell-9B-bl-GGUF:Q8_0';
const options = {
  temperature: 0, seed: 42, num_ctx: 4096, num_predict: 1536,
  stop: ['### Instruction:', '### Input:', '### Response:', '<end_of_turn>']
};
const maxChars = 550;

function splitText(text) {
  const sentences = new Intl.Segmenter('el', { granularity: 'sentence' });
  const pieces = [];
  for (const line of text.match(/[^\r\n]+|[\r\n]+/gu) ?? []) {
    if (!line.trim()) {
      pieces.push({ literal: line });
      continue;
    }
    const leading = line.match(/^\s*/u)[0];
    const trailing = line.match(/\s*$/u)[0];
    if (leading) pieces.push({ literal: leading });
    let pending = '';
    for (const { segment } of sentences.segment(line.trim())) {
      for (const fragment of segment.match(/\S+\s*/gu) ?? []) {
        if (pending.length + fragment.length > maxChars && pending) {
          pieces.push({ source: pending.trim() }, { literal: ' ' });
          pending = '';
        }
        pending += fragment;
      }
      if (pending.length >= maxChars * 0.6) {
        pieces.push({ source: pending.trim() }, { literal: ' ' });
        pending = '';
      }
    }
    if (pending.trim()) pieces.push({ source: pending.trim() });
    else if (pieces.at(-1)?.literal === ' ') pieces.pop();
    if (trailing) pieces.push({ literal: trailing });
  }
  return pieces;
}

function prompt(source) {
  return `### Instruction:\nTranslate the following text from Greek to Tsakonian:\n\n### Input:\n${source}\n\n### Response:\n`;
}

function warnings(source, translation) {
  const issues = [];
  const ratio = [...translation].length / [...source].length;
  if (ratio < 0.3 || ratio > 3.5) issues.push('unusual_length_ratio');
  if (source.trim() === translation.trim()) issues.push('unchanged_source');
  if (/###\s*(Instruction|Input|Response)|<\|/u.test(translation)) issues.push('prompt_leakage');
  if (/(.{25,}?)\1\1/u.test(translation)) issues.push('repetition');
  return issues;
}

function isRepeatLimitError(message) {
  return /prediction aborted,\s*token repeat limit reached/iu.test(message);
}

async function findSources() {
  const sourceDir = join(root, 'ελληνικα');
  const entries = await readdir(sourceDir, { withFileTypes: true });
  const sources = entries
    .filter(entry => entry.isFile() && /^\d+\s/u.test(entry.name) && /\.(?:txt|docx)$/iu.test(entry.name))
    .map(entry => ({ book: Number(entry.name.match(/^\d+/u)[0]), path: join(sourceDir, entry.name) }))
    .sort((left, right) => left.book - right.book);
  for (let index = 1; index < sources.length; index++) {
    assert.notEqual(sources[index - 1].book, sources[index].book, `Multiple source files found for book ${sources[index].book}.`);
  }
  return sources;
}

async function readSource(path) {
  if (/\.docx$/iu.test(path)) {
    const { stdout } = await execFileAsync('textutil', ['-convert', 'txt', '-stdout', path], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    });
    return stdout;
  }
  return readFile(path, 'utf8');
}

async function main() {
  if (process.argv.includes('--self-test')) {
    for (const source of ['Title\n\nOne sentence. Another sentence.\n', '  A long sentence. '.repeat(100), '\r\n  \r\n']) {
      const pieces = splitText(source);
      const rebuilt = pieces.map(piece => piece.literal ?? piece.source).join('');
      assert.equal(rebuilt.replace(/\s+/gu, ' ').trim(), source.replace(/\s+/gu, ' ').trim());
      assert.ok(pieces.filter(piece => piece.source).every(piece => piece.source.length <= maxChars));
      assert.equal(rebuilt.replace(/[^\r\n]/gu, ''), source.replace(/[^\r\n]/gu, ''));
    }
    assert.ok(prompt('sample').includes('Greek to Tsakonian'));
    assert.deepEqual(warnings('sample', 'sample'), ['unchanged_source']);
    console.log('PASS: segmentation preserves text and line breaks; prompt and warning checks pass.');
    return;
  }

  if (process.argv.includes('--list')) {
    const sources = await findSources();
    console.log(JSON.stringify(sources.map(({ book, path }) => ({ book, input: path })), null, 2));
    return;
  }

  const allBooks = process.argv.includes('--all');
  const bookIndex = process.argv.indexOf('--book');
  assert.ok(!(allBooks && bookIndex >= 0), 'Use either --all or --book, not both.');
  const sources = await findSources();
  const books = allBooks
    ? sources.filter(source => source.book > 1)
    : [sources.find(source => source.book === (bookIndex < 0 ? 1 : Number(process.argv[bookIndex + 1])))].filter(Boolean);
  assert.ok(books.length, allBooks ? 'No source manuscripts for books 2 and later were found.' : 'No source manuscript found for the requested book.');
  const limitIndex = process.argv.indexOf('--limit');
  const limit = limitIndex < 0 ? undefined : Number(process.argv[limitIndex + 1]);
  if (limit !== undefined) assert.ok(Number.isInteger(limit) && limit > 0, 'Invalid limit');
  for (const source of books) await translateBook(source, limit);
}

async function translateBook(sourceFile, requestedLimit) {
  const { book, path: input } = sourceFile;
  const outputDir = join(root, 'τςακονιαν', String(book));
  const stem = `${book} Harry Potter - Tsakonian`;
  const checkpoint = join(outputDir, `${stem}.checkpoint.jsonl`);
  const output = join(outputDir, `${stem}.txt`);
  const partial = join(outputDir, `${stem}.partial.txt`);
  const metadata = join(outputDir, `${stem}.run.json`);
  const source = await readSource(input);
  const sourceSha256 = createHash('sha256').update(source).digest('hex');
  const pieces = splitText(source);
  const chunks = pieces.filter(piece => piece.source).map(piece => piece.source);
  const fingerprint = createHash('sha256').update(JSON.stringify({ source, model, options, maxChars, prompt: prompt('') })).digest('hex');
  await mkdir(outputDir, { recursive: true });
  const results = [];
  try {
    for (const line of (await readFile(checkpoint, 'utf8')).split('\n').filter(Boolean)) {
      const record = JSON.parse(line);
      assert.equal(record.fingerprint, fingerprint, 'Checkpoint configuration differs.');
      assert.equal(record.index, results.length, 'Checkpoint is not sequential.');
      assert.equal(record.source, chunks[record.index], 'Checkpoint source differs.');
      results.push(record);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (process.argv.includes('--verify')) {
    assert.equal(results.length, chunks.length, 'Translation is incomplete.');
    const report = JSON.parse(await readFile(metadata, 'utf8'));
    assert.equal(report.sourceSha256, sourceSha256, 'Source has changed.');
    assert.equal(report.complete, true);
    let index = 0;
    const expected = pieces.map(piece => piece.literal ?? results[index++].translation).join('');
    assert.equal(await readFile(output, 'utf8'), expected, 'Final text differs from checkpoint.');
    console.log(JSON.stringify({ verified: true, chunks: chunks.length, sourceSha256, output }));
    return;
  }
  const limit = requestedLimit === undefined ? chunks.length : Math.min(chunks.length, requestedLimit);
  const started = Date.now();
  const initialCount = results.length;
  await appendFile(join(root, 'WORK_LOG.md'), `\n### Execution - book ${book} - ${new Date().toISOString()}\n\nSource: \`${input}\`.\nStarted/resumed with ${initialCount}/${chunks.length} chunks; requested limit ${limit}.\nSource SHA-256: \`${sourceSha256}\`.\n`);
  console.log(JSON.stringify({ book, model, sourceCharacters: [...source].length, chunks: chunks.length, resumed: results.length, limit, output }));
  async function saveProgress() {
    let index = 0;
    const translated = [];
    for (const piece of pieces) {
      if (piece.literal !== undefined) translated.push(piece.literal);
      else if (index < results.length) translated.push(results[index++].translation);
      else break;
    }
    await writeFile(`${partial}.tmp`, translated.join(''), 'utf8');
    await rename(`${partial}.tmp`, partial);
    const report = {
      model, options, maxChars, fingerprint, sourceSha256, input, output,
      completed: results.length, total: chunks.length,
      complete: results.length === chunks.length, updated: new Date().toISOString(),
      warnings: results.filter(result => result.warnings.length).map(({ index: chunkIndex, warnings: issues }) => ({ index: chunkIndex, issues })),
      caveat: 'Unreviewed machine translation. Automated checks do not establish Tsakonian accuracy.'
    };
    await writeFile(metadata, `${JSON.stringify(report, null, 2)}\n`);
    if (report.complete) await writeFile(output, translated.join(''), 'utf8');
  }
  for (let index = results.length; index < limit; index++) {
    let generated;
    let translation;
    let generationOptions;
    const attempts = [options, { ...options, repeat_penalty: 1.2, stop: [...options.stop, '\n'] }];
    for (const settings of attempts) {
      const response = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: prompt(chunks[index]), raw: true, stream: false, keep_alive: '30m', options: settings }),
        signal: AbortSignal.timeout(600_000)
      });
      if (!response.ok) {
        const error = await response.text();
        if (response.status !== 500 || !isRepeatLimitError(error)) {
          throw new Error(`Ollama HTTP ${response.status}: ${error}`);
        }
        await appendFile(join(outputDir, `${stem}.attempts.jsonl`), `${JSON.stringify({ index, options: settings, error, timestamp: new Date().toISOString() })}\n`);
        generated = { response: '', done_reason: 'error' };
        translation = '';
        generationOptions = settings;
        continue;
      }
      generated = await response.json();
      translation = generated.response?.trim();
      generationOptions = settings;
      if (translation && generated.done_reason !== 'length') break;
      await appendFile(join(outputDir, `${stem}.attempts.jsonl`), `${JSON.stringify({ index, source: chunks[index], options: settings, response: generated.response, reason: generated.done_reason, timestamp: new Date().toISOString() })}\n`);
    }
    let splitRecovery;
    if (!translation || generated.done_reason === 'length') {
      const segments = [...new Intl.Segmenter('el', { granularity: 'sentence' }).segment(chunks[index])]
        .map(({ segment }) => segment.trim()).filter(Boolean);
      if (segments.length < 2) throw new Error(`Chunk ${index}: whole-chunk generation failed and text cannot be split safely; checkpoint preserved.`);
      const segmentOptions = { ...options, num_predict: 384, repeat_penalty: 1.2, stop: [...options.stop, '\n'] };
      const segmentAttempts = [segmentOptions, { ...segmentOptions, repeat_penalty: 1.5 }];
      const translatedSegments = [];
      let totalTokens = 0;
      let totalDuration = 0;
      for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
        const segmentSource = segments[segmentIndex];
        let segmentResult;
        let segmentTranslation;
        let segmentGenerationOptions;
        for (const settings of segmentAttempts) {
          const response = await fetch('http://127.0.0.1:11434/api/generate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt: prompt(segmentSource), raw: true, stream: false, keep_alive: '30m', options: settings }),
            signal: AbortSignal.timeout(600_000)
          });
          if (!response.ok) {
            const error = await response.text();
            if (response.status !== 500 || !isRepeatLimitError(error)) {
              throw new Error(`Ollama HTTP ${response.status} on chunk ${index}, sentence ${segmentIndex}: ${error}`);
            }
            await appendFile(join(outputDir, `${stem}.attempts.jsonl`), `${JSON.stringify({ index, strategy: 'sentence_split', segmentIndex, options: settings, error, timestamp: new Date().toISOString() })}\n`);
            segmentResult = undefined;
            segmentTranslation = undefined;
            continue;
          }
          segmentResult = await response.json();
          segmentTranslation = segmentResult.response?.trim();
          segmentGenerationOptions = settings;
          await appendFile(join(outputDir, `${stem}.attempts.jsonl`), `${JSON.stringify({ index, strategy: 'sentence_split', segmentIndex, source: segmentSource, options: settings, response: segmentResult.response, reason: segmentResult.done_reason, timestamp: new Date().toISOString() })}\n`);
          if (segmentTranslation && segmentResult.done_reason !== 'length') break;
        }
        if (!segmentTranslation || segmentResult.done_reason === 'length') throw new Error(`Chunk ${index}, sentence ${segmentIndex}: sentence-split retry failed; checkpoint preserved.`);
        translatedSegments.push(segmentTranslation);
        totalTokens += segmentResult.eval_count ?? 0;
        totalDuration += segmentResult.total_duration ?? 0;
        generated = segmentResult;
        generationOptions = segmentGenerationOptions;
      }
      translation = translatedSegments.join(' ');
      splitRecovery = 'sentence_split';
      generated = { ...generated, eval_count: totalTokens, total_duration: totalDuration };
    }
    const record = {
      fingerprint, index, source: chunks[index], translation,
      warnings: warnings(chunks[index], translation),
      generationOptions,
      ...(splitRecovery ? { recoveryStrategy: splitRecovery } : {}),
      tokens: generated.eval_count, durationSeconds: generated.total_duration / 1e9
    };
    if (generationOptions !== options) record.warnings.push('fallback_generation_settings');
    if (splitRecovery) record.warnings.push(splitRecovery);
    await appendFile(checkpoint, `${JSON.stringify(record)}\n`);
    results.push(record);
    await saveProgress();
    const elapsed = (Date.now() - started) / 1000;
    const secondsPerChunk = elapsed / (results.length - initialCount);
    console.log(JSON.stringify({ completed: results.length, total: chunks.length, seconds: Math.round(elapsed), estimatedRemainingMinutes: Math.round((chunks.length - results.length) * secondsPerChunk / 60), warnings: record.warnings }));
  }
  await saveProgress();
  await appendFile(join(root, 'WORK_LOG.md'), `\nExecution ended ${new Date().toISOString()}: ${results.length}/${chunks.length} chunks, ${(Date.now() - started) / 1000} seconds in this session, ${results.filter(result => result.warnings.length).length} chunks with automated warnings. ${results.length === chunks.length ? 'Full output written; linguistic review remains required.' : 'Pilot only; full translation not yet complete.'}\n`);
  console.log(results.length === chunks.length ? `COMPLETE: ${output}` : `PILOT COMPLETE: ${partial}`);
}

main().catch(async error => {
  console.error(error);
  await appendFile(join(root, 'WORK_LOG.md'), `\nExecution error ${new Date().toISOString()}: ${error.message}\n`).catch(() => {});
  process.exitCode = 1;
});