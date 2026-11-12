# Tsakonian Translation Project

This project contains user-supplied Modern Greek manuscripts and machine-
generated Tsakonian translation output, along with a consistency guide and a
script for producing an EPUB edition of the first book.

## Project Files

- `ελληνικα/` contains numbered Greek source manuscripts. The translation
	runner reads `.txt` files directly and extracts `.docx` files using macOS
	`textutil`; source files are not modified.
- `τςακονιαν_gemma_2_model/<book-number>/` and
	`τςακονιαν_leonida_model/<book-number>/` keep each model's resumable
	checkpoints, partial translations, metadata, and completed `.txt` outputs
	separate.
- `τςακονιαν_gemma_2_model/1/1 Harry Potter - Tsakonian.epub` is the first
	book's generated ebook, with a title page, linked contents, and separate
	chapter sections.
- `ORTHOGRAPHY.md` records source-backed names and terms used for consistency.
- `build_epub.py` formats the text on request and builds and validates the EPUB.
- `WORK_LOG.md` records translation setup, provenance, and execution notes.

## Requirements

Node.js with `Intl.Segmenter`, Ollama, and the configured local Tsakonian
translation model are required for translation. The Gemma model is
`hf.co/jgchaparro/language_garden-tsd-ell-9B-bl-GGUF:Q8_0`; the newer Leonida
model is `hf.co/jgchaparro/Llama-Leonida-GGUF:Q8_0`. `.docx` source extraction
uses macOS `textutil`. Python 3.10 or later is required for EPUB building; the
builder uses only the Python standard library.

## Translate manuscripts

From the project directory, Translate or resume one numbered book with Gemma (the default):

```sh
node translate.mjs --book 2
```

Choose Leonida and translate the first two available manuscripts:

```sh
node translate.mjs --model leonida --books 1,2
```

Translate or resume every available source manuscript after book 1, one at a
time:

```sh
node translate.mjs --all
```

The runner discovers numbered `.txt` and `.docx` sources in `ελληνικα/`,
preserves each book's checkpoint independently, and keeps each model's outputs
in separate folders. Leonida uses Ollama's chat API and its recommended
instruction format; Gemma retains the original raw-generation prompt. Use
`--limit 5` for a short per-book pilot, `--verify --book 2` to verify a
completed output, `--list` to see available manuscripts, or `--self-test` to
test text segmentation and model prompts. Missing book numbers are not inferred
or generated; add the source manuscript before translating that book. Do not
run multiple copies concurrently.

## Build the EPUB

Run from the project directory:

```sh
python3 build_epub.py
```

By default, the script reads
`τςακονιαν_gemma_2_model/1/1 Harry Potter - Tsakonian.txt` and writes the EPUB
beside it. This command does not rewrite the text file, so it is suitable for
rebuilding the EPUB after editing the translation.

To normalize paragraph indentation and spacing in the text file before
building, run:

```sh
python3 build_epub.py --format-text
```

This option rewrites the input text in place: it removes inconsistent leading
spaces, adds one tab to each prose paragraph, and leaves recognized headings
flush-left. It changes whitespace only, not the paragraph wording. The
formatting is safe to repeat.

For other input or output paths, or different creator metadata, use:

```sh
python3 build_epub.py --input path/to/input.txt --output path/to/output.epub \
	--author "Creator Name"
```

Run `python3 build_epub.py --help` to see all options. The builder recognizes
this book's 17 chapter titles explicitly; if those headings are edited, update
`CHAPTER_TITLES` in the script as well. Each build checks the EPUB archive,
XHTML/XML documents, manifest resources, and chapter navigation. These checks
do not assess translation quality.

## Translation Status

Both translation models run locally through Ollama. Leonida is an 8B Llama
model with a Tsakonian translation benchmark; its model card and license
details are available at
https://huggingface.co/jgchaparro/Llama-Leonida-GGUF.

This is machine translation, not a validated Tsakonian edition. It has not been
reviewed by a qualified Tsakonian reader, and automated checks cannot establish
grammatical or semantic accuracy. `ORTHOGRAPHY.md` is a project consistency
reference, not an authoritative grammar or orthographic standard.