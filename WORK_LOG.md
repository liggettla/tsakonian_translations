# Tsakonian translation work log

## Request and scope

Translate the user-supplied Modern Greek text of the first Harry Potter book
into Tsakonian locally, using the model linked by Tsakonian Digital. Preserve
the source. Document setup, execution, limitations, and output locations.

## Discovery - 2026-10-29

- Starting resource: https://jgchaparro.com/tsakonian_digital_vault/English/6.-Resources/6.3-Tsakonian-Digital
- Official collection, linked by https://tsakoniandigital.com/:
  https://huggingface.co/collections/jgchaparro/tsakonian-models-6896056fcc3798c235c92876
- Selected repository: https://huggingface.co/jgchaparro/language_garden-tsd-ell-9B-bl-GGUF
- Repository revision reported by Hugging Face: `e53bd36174f36803e2958d61f88939a53c98b1fa`.
- Model: Gemma 2 9B fine-tuned for Greek/Tsakonian bidirectional translation.
  The project describes approximately 1,600 bilingual training-corpus pairs.
- Selected published quantization: `unsloth.Q8_0.gguf`, 9,827,148,096 bytes.
  Published SHA-256: `cdcaa668253026005d3f2d0f83f5ebe76a2d639f2acc2eb633b8df436f3b58b1`.
  This favors fidelity over the smaller Q4/Q5 options; it does not guarantee accuracy.
- Machine: macOS, 32 GiB unified memory; approximately 34 GiB disk available.
- Ollama: `/usr/local/bin/ollama`; existing `gemma4:e4b` model left unchanged.
- Node.js: v26.0.0; no additional packages required by the runner.
- Source: `ελληνικα/1 Ο Χάρι Πότερ και η Φιλοσοφική Λίθος.docx.txt`.
  The initial shell count reported 567,504 characters.
- Destination folder `τςακονιαν/` was empty at inspection.
- No `AGENTS.md` was found in the workspace search.
- `rg` is unavailable; the initial chained inspection stopped at that command.
  Subsequent focused checks used built-in tools instead. No install attempted.
- A paper link on the Vault returned HTTP 404. The model card and official
  dictionary supplied the needed repository and inference instructions instead.
- The first runner creation returned an uncertain editor result; a filesystem
  check confirmed it had not been created. It was added again, not overwritten.

## Translation method

`translate.mjs` uses the author's exact plain-text instruction format, sent to
Ollama's local `/api/generate` endpoint with `raw: true` to bypass chat templates:

```text
### Instruction:
Translate the following text from Greek to Tsakonian:

### Input:
[source text]

### Response:
```

- Intended Ollama identifier:
  `hf.co/jgchaparro/language_garden-tsd-ell-9B-bl-GGUF:Q8_0`.
- Temperature 0, seed 42, context 4096 tokens, maximum generated tokens 1536.
- Paragraphs/line breaks retained. Greek sentence segmentation groups short
  sentences up to approximately 550 characters; long sentences split at words.
  Internal whitespace can normalize at chunk boundaries.
- No previous translation is fed back, so errors cannot accumulate through
  conversation history. The trade-off is limited cross-chunk context and
  potentially inconsistent names, terminology, and literary style.
- Every accepted result is immediately checkpointed with its exact source,
  translation, index, configuration/source fingerprint, token count, and timing.
- Empty or token-limit-truncated output stops the run instead of silently
  omitting text. Length anomalies, exact source copying, repeated text, and
  prompt leakage are recorded as warnings, not treated as proof of inaccuracy.
- Text is submitted only to local Ollama. External requests made for discovery
  and model download do not contain the source book.

## Commands

Run from any working directory using the absolute script path, or from this folder:

```sh
node translate.mjs --self-test
ollama pull hf.co/jgchaparro/language_garden-tsd-ell-9B-bl-GGUF:Q8_0
node translate.mjs --limit 5
node translate.mjs
node translate.mjs --verify
```

The final command resumes a matching checkpoint automatically. Do not run two
copies concurrently. Stop with Ctrl+C; completed chunks remain checkpointed.

## Outputs

All translation artifacts go into `τςακονιαν/`:

- `1 Harry Potter - Tsakonian.checkpoint.jsonl`: aligned Greek/Tsakonian chunks.
- `1 Harry Potter - Tsakonian.partial.txt`: translated prefix, updated per chunk.
- `1 Harry Potter - Tsakonian.run.json`: settings, counts, warnings, completeness.
- `1 Harry Potter - Tsakonian.txt`: created only when every chunk is translated.

## Validation and execution status

- Runner self-test passed: text content and line breaks survive chunking;
  instruction prompt and exact-copy warning checks pass.
- Ollama download initially stopped at approximately 56%; the resumed pull
  completed successfully and Ollama verified the SHA-256 digest.
- Initial pilot discovered 3,363 chunks across 567,504 source characters.
  The book title translated in approximately 5 seconds (22 generated tokens).
- The next heading hit the 1,536-token limit, stopping the pilot as designed.
  A focused 100-token reproduction showed a translation followed by an invented
  `### Instruction:` / `### Response:` training example. The imported model
  has template `{{ .Prompt }}` and no configured stop strings.
- Fix: explicit stops for `### Instruction:`, `### Input:`, `### Response:`,
  and `<end_of_turn>`. This stops unwanted continuation; it does not change
  the author's input prompt. The initial pilot checkpoint is archived before
  rerunning because the inference configuration fingerprint changes.
- Corrected pilot passed: 5/3,363 chunks completed in 53 seconds, 682
  generated tokens, zero automated warnings. Aligned checkpoint records and
  run metadata were independently checked for sequential indices and agreement.
- The pilot projects roughly 10 hours for the full book; the two short title
  chunks make that estimate optimistic. Actual timing will vary by passage.
- Editor diagnostics reported no errors in the runner.
- Important manual finding: in the first narrative paragraph, the model
  replaces the Dursleys' surname with unrelated names (Nikoa/Nichaou).
  This is a semantic fidelity failure despite passing the automated checks.
  Output is deliberately not corrected so it remains a test of the actual model.
- Source text remains unchanged. Full run will resume after chunk 5.
- Added source SHA-256 to metadata and `--verify` to check complete coverage,
  source integrity, and exact final-output reconstruction from checkpoints.
- Executions now append timestamped start/end/error records to this document.
- Full execution command (prevents idle sleep while running and saves output):

```sh
set -o pipefail
caffeinate -i node translate.mjs 2>&1 | tee full-run.log
node translate.mjs --verify
```

- Logs: `pilot.log` (initial pilot), `pilot-corrected.log` (fixed pilot),
  `full-run.log` (full run). The first pilot's stderr was displayed in the
  terminal rather than captured by tee; its failure and diagnosis are recorded above.
- Archived initial checkpoint:
  `τςακονιαν/1 Harry Potter - Tsakonian.initial-pilot.jsonl`.

### Full-run interruption and recovery

- First full run completed 295 chunks in 2,426 seconds before chunk index 295
  reached the token limit. Completed output and checkpoints were retained.
- The failed source is a normal sentence about letters falling through a door;
  it is not an unusually large input. The first accepted exact-copy warning
  was chapter heading index 273.
- Recovery policy added prospectively: try the original settings first; on
  empty/truncated output, retry with repetition penalty 1.2 and newline as an
  additional stop. This assumes one output line per input fragment. It may
  omit content if the model inserts a line break mid-translation, so recovered
  chunks are explicitly marked `fallback_generation_settings` for review.
- Failed responses are now preserved in
  `τςακονιαν/1 Harry Potter - Tsakonian.attempts.jsonl`; successful new records
  include their actual `generationOptions`. Earlier records used the documented
  original settings. The existing source/chunk fingerprint remains valid;
  the additional fallback is recorded per result rather than hiding a change.
- Subsequent full runs append to `full-run.log` rather than overwriting it.

## Interpretation limits

This is unreviewed machine translation, not a validated Tsakonian edition.
The training corpus is small and literary fantasy is outside its demonstrated
evaluation domain. Automated checks cannot assess grammatical or semantic
accuracy. A qualified Tsakonian reader and independent reference translations
are needed for a reliable quality assessment; round-trip translation alone
would not establish quality.
### Execution 2026-10-29T19:33:43.866Z

Started/resumed with 5/3363 chunks; requested limit 5.
Source SHA-256: `073d49b5e68603315259b508ea61c9cd6c34f1598da08bbf708db5c093260d67`.

Execution ended 2026-10-29T19:33:43.882Z: 5/3363 chunks, 0.016 seconds in this session, 0 chunks with automated warnings. Pilot only; full translation not yet complete.

### Execution 2026-10-29T19:33:49.037Z

Started/resumed with 5/3363 chunks; requested limit 3363.
Source SHA-256: `073d49b5e68603315259b508ea61c9cd6c34f1598da08bbf708db5c093260d67`.

Execution error 2026-10-29T20:15:50.911Z: Chunk 295: generation truncated; checkpoint preserved.

### Execution 2026-10-29T20:16:45.701Z

Started/resumed with 295/3363 chunks; requested limit 296.
Source SHA-256: `073d49b5e68603315259b508ea61c9cd6c34f1598da08bbf708db5c093260d67`.

Execution ended 2026-10-29T20:18:27.896Z: 296/3363 chunks, 102.195 seconds in this session, 2 chunks with automated warnings. Pilot only; full translation not yet complete.

### Execution 2026-10-29T20:18:42.210Z

Started/resumed with 296/3363 chunks; requested limit 3363.
Source SHA-256: `073d49b5e68603315259b508ea61c9cd6c34f1598da08bbf708db5c093260d67`.

Execution error 2026-10-29T21:55:59.305Z: Chunk 1028: both generation attempts failed; checkpoint preserved.

## Orthography question - 2026-10-29

- User asked about `τ͡σαι` and other marked consonants in the output.
- Checked the current guide:
  https://jgchaparro.com/tsakonian_digital_vault/English/3.-Writing/3.1-Orthography
  and the author's simplified spelling proposal:
  https://tsakoniandigital.com/orthography
- The guide explicitly gives `τσ̑αι` as "and", equivalent to Modern Greek
  `και`, and transliterates it as `tsse` (with stress on its only syllable).
  The vowel written `αι` is /e/, not the English sound in "eye".
- The model emits `τ͡σαι`: tau, U+0361 COMBINING DOUBLE INVERTED BREVE,
  sigma, alpha, iota. This is a tie-bar rendering and differs from the
  guide's `τσ̑` spelling, which marks sigma with U+0311. It appears intended
  to represent the same Tsakonian affricate, but is not an exact reproduction
  of the guide's orthographic notation. Rendering may vary by font.
- Other documented distinctions: `π̔`, `τ̔`, `κ̔` mark aspirated stops;
  `σ̌` and `ζ̌` mark sh/zh-type sounds; `ν̇` marks non-palatalized n.
  These marks must not be indiscriminately stripped as if they were corruption.
- Simple Kostakis represents the marked affricate with `τσσ`, giving
  `τσσαι` for "and". A separate converted reading copy could use this scheme;
  the original machine output has not been normalized or overwritten.
- Orthographic plausibility does not establish translation accuracy. The
  previously observed substitution of unrelated names remains a real error.
- Current run is stopped, not complete: 1,028/3,363 chunks saved. The next
  chunk (zero-based index 1028) exhausted both generation attempts. No full
  translation or successful final verification is claimed.
- Two obsolete guessed Vault paths returned HTTP 404 during this check;
  the current writing/orthography page above supplied the needed information.

### Execution 2026-10-31T00:27:45.621Z

Started/resumed with 1028/3363 chunks; requested limit 3363.
Source SHA-256: `073d49b5e68603315259b508ea61c9cd6c34f1598da08bbf708db5c093260d67`.

Execution error 2026-10-31T00:31:05.942Z: Chunk 1028: both generation attempts failed; checkpoint preserved.

### Repeated-chunk recovery - 2026-10-30

- Resumed run stopped again at chunk 1028. Inspection of both stored attempts
  showed degenerate repetition exhausting all 1,536 generated tokens.
- The 267-character source chunk contains five sentence segments. Direct,
  sentence-by-sentence tests returned finite responses for all five; these
  remain unreviewed translations and may be semantically inaccurate.
- Added a last-resort sentence-split retry after both existing full-chunk
  strategies fail. Each sentence uses the documented prompt, 384-token limit,
  repeat penalty 1.2, and newline stop. Accepted output is joined with spaces
  into the original chunk slot; the source chunk/checkpoint order is unchanged.
- The failed full-chunk responses and sentence-level requests/responses are
  retained in `τςακονιαν/1 Harry Potter - Tsakonian.attempts.jsonl`.
  Recovered checkpoint entries carry `fallback_generation_settings` and
  `sentence_split` warnings. Any sentence that still truncates stops the run
  without appending a partial chunk.
- Runner self-test passed after the change. Next action: test only through
  chunk 1028, then resume the full run if that chunk is checkpointed.

### Execution 2026-10-31T00:32:21.361Z

Started/resumed with 1028/3363 chunks; requested limit 1029.
Source SHA-256: `073d49b5e68603315259b508ea61c9cd6c34f1598da08bbf708db5c093260d67`.

Execution ended 2026-10-31T00:36:23.591Z: 1029/3363 chunks, 242.23 seconds in this session, 22 chunks with automated warnings. Pilot only; full translation not yet complete.

### Execution 2026-10-31T00:36:35.534Z

Started/resumed with 1029/3363 chunks; requested limit 3363.
Source SHA-256: `073d49b5e68603315259b508ea61c9cd6c34f1598da08bbf708db5c093260d67`.

Execution ended 2026-10-31T04:39:52.817Z: 3363/3363 chunks, 14597.283 seconds in this session, 53 chunks with automated warnings. Full output written; linguistic review remains required.

### Execution - book 2 - 2026-11-11T13:09:36.755Z

Source: `/Users/laliggett/Downloads/tsakonian_translations/ελληνικα/2 Ο Χάρι Πότερ και η Κάμαρα με τα Μυστικά.txt`.
Started/resumed with 0/3387 chunks; requested limit 1.
Source SHA-256: `9e8674a53b3d8973edd02a1f82de900ec20baffc3a8a9265e7031756cdf7e990`.

Execution ended 2026-11-11T13:09:44.704Z: 1/3387 chunks, 7.949 seconds in this session, 0 chunks with automated warnings. Pilot only; full translation not yet complete.

### Execution - book 3 - 2026-11-11T13:09:44.797Z

Source: `/Users/laliggett/Downloads/tsakonian_translations/ελληνικα/3 Ο Χάρι Ποτερ και ο Αιχμάλωτος του Αζκαμπάν.txt`.
Started/resumed with 0/9363 chunks; requested limit 1.
Source SHA-256: `cae0a680ea028462fadaac50ed8fa5c38265883bcfdbe29107093704d119a6a7`.

Execution ended 2026-11-11T13:09:46.913Z: 1/9363 chunks, 2.116 seconds in this session, 0 chunks with automated warnings. Pilot only; full translation not yet complete.

### Execution - book 4 - 2026-11-11T13:09:47.045Z

Source: `/Users/laliggett/Downloads/tsakonian_translations/ελληνικα/4 Ο Χάρι Πότερ και το Κύπελλο της Φωτιάς.txt`.
Started/resumed with 0/21055 chunks; requested limit 1.
Source SHA-256: `987889cd5e0533d44ffc8830ea5344e0ae0996a51f37fd35bb347bb93011a266`.

Execution ended 2026-11-11T13:09:48.871Z: 1/21055 chunks, 1.826 seconds in this session, 0 chunks with automated warnings. Pilot only; full translation not yet complete.

### Execution - book 5 - 2026-11-11T13:09:50.038Z

Source: `/Users/laliggett/Downloads/tsakonian_translations/ελληνικα/5 Ο Χάρι Πότερ και το Τάγμα του Φοίνικα.docx`.
Started/resumed with 0/38023 chunks; requested limit 1.
Source SHA-256: `2d6ea1b97993743a3a255f7cc3d51194efd03b80c65909cfe661d6788278172e`.

Execution ended 2026-11-11T13:09:51.976Z: 1/38023 chunks, 1.938 seconds in this session, 0 chunks with automated warnings. Pilot only; full translation not yet complete.

### Execution - book 7 - 2026-11-11T13:09:52.103Z

Source: `/Users/laliggett/Downloads/tsakonian_translations/ελληνικα/7 Ο Χάρι Πότερ και οι Κλήροι του Θανάτου.txt`.
Started/resumed with 0/21625 chunks; requested limit 1.
Source SHA-256: `fc129827d82f4f7fac623d8fa7024e77f575391a7ffcbf4886bf0927a6174281`.

Execution ended 2026-11-11T13:09:53.790Z: 1/21625 chunks, 1.687 seconds in this session, 0 chunks with automated warnings. Pilot only; full translation not yet complete.

### Execution - book 2 - 2026-11-11T13:10:13.658Z

Source: `/Users/laliggett/Downloads/tsakonian_translations/ελληνικα/2 Ο Χάρι Πότερ και η Κάμαρα με τα Μυστικά.txt`.
Started/resumed with 1/3387 chunks; requested limit 3387.
Source SHA-256: `9e8674a53b3d8973edd02a1f82de900ec20baffc3a8a9265e7031756cdf7e990`.

Execution error 2026-11-11T16:16:46.975Z: Ollama HTTP 500: {"error":"prediction aborted, token repeat limit reached"}

### Execution - book 2 - 2026-11-11T16:37:02.507Z

Source: `/Users/laliggett/Downloads/tsakonian_translations/ελληνικα/2 Ο Χάρι Πότερ και η Κάμαρα με τα Μυστικά.txt`.
Started/resumed with 1695/3387 chunks; requested limit 3387.
Source SHA-256: `9e8674a53b3d8973edd02a1f82de900ec20baffc3a8a9265e7031756cdf7e990`.

Execution ended 2026-11-11T19:57:21.051Z: 3387/3387 chunks, 12018.544 seconds in this session, 53 chunks with automated warnings. Full output written; linguistic review remains required.

### Execution - book 3 - 2026-11-11T19:57:21.160Z

Source: `/Users/laliggett/Downloads/tsakonian_translations/ελληνικα/3 Ο Χάρι Ποτερ και ο Αιχμάλωτος του Αζκαμπάν.txt`.
Started/resumed with 1/9363 chunks; requested limit 9363.
Source SHA-256: `cae0a680ea028462fadaac50ed8fa5c38265883bcfdbe29107093704d119a6a7`.

### Execution - leonida - book 1 - 2026-11-12T00:12:54.235Z

Model: `hf.co/jgchaparro/Llama-Leonida-GGUF:Q8_0` (chat API).
Source: `/Users/laliggett/Downloads/tsakonian_translations/ελληνικα/1 Ο Χάρι Πότερ και η Φιλοσοφική Λίθος.docx.txt`.
Started/resumed with 0/3363 chunks; requested limit 1.
Source SHA-256: `073d49b5e68603315259b508ea61c9cd6c34f1598da08bbf708db5c093260d67`.

Execution ended 2026-11-12T00:13:00.036Z: 1/3363 chunks, 5.801 seconds in this session, 0 chunks with automated warnings. Pilot only; full translation not yet complete.

### Execution - leonida - book 2 - 2026-11-12T00:13:00.100Z

Model: `hf.co/jgchaparro/Llama-Leonida-GGUF:Q8_0` (chat API).
Source: `/Users/laliggett/Downloads/tsakonian_translations/ελληνικα/2 Ο Χάρι Πότερ και η Κάμαρα με τα Μυστικά.txt`.
Started/resumed with 0/3387 chunks; requested limit 1.
Source SHA-256: `9e8674a53b3d8973edd02a1f82de900ec20baffc3a8a9265e7031756cdf7e990`.

Execution ended 2026-11-12T00:13:01.392Z: 1/3387 chunks, 1.292 seconds in this session, 0 chunks with automated warnings. Pilot only; full translation not yet complete.

### Execution - leonida - book 1 - 2026-11-12T00:13:17.675Z

Model: `hf.co/jgchaparro/Llama-Leonida-GGUF:Q8_0` (chat API).
Source: `/Users/laliggett/Downloads/tsakonian_translations/ελληνικα/1 Ο Χάρι Πότερ και η Φιλοσοφική Λίθος.docx.txt`.
Started/resumed with 1/3363 chunks; requested limit 3363.
Source SHA-256: `073d49b5e68603315259b508ea61c9cd6c34f1598da08bbf708db5c093260d67`.
