# Tsakonian Translation Project

This project contains a user-supplied Modern Greek text of the first Harry
Potter book and a machine-generated Tsakonian translation, along with a
consistency guide and a script for producing an EPUB edition.

## Project Files

- `ελληνικα/1 Ο Χάρι Πότερ και η Φιλοσοφική Λίθος.docx.txt` is the Greek source.
	The build script does not modify it.
- `τςακονιαν/1 Harry Potter - Tsakonian.txt` is the Tsakonian text. Paragraphs
	are tab-indented; chapter and section headings are flush-left.
- `τςακονιαν/1 Harry Potter - Tsakonian.epub` is the generated ebook, with a
	title page, linked contents, and separate chapter sections.
- `ORTHOGRAPHY.md` records source-backed names and terms used for consistency.
- `build_epub.py` formats the text on request and builds and validates the EPUB.
- `WORK_LOG.md` records translation setup, provenance, and execution notes.

## Requirements

Python 3.10 or later is required. The builder uses only the Python standard
library; no package installation is needed.

## Build the EPUB

Run from the project directory:

```sh
python3 build_epub.py
```

By default, the script reads `τςακονιαν/1 Harry Potter - Tsakonian.txt` and
writes `τςακονιαν/1 Harry Potter - Tsakonian.epub`. This command does not rewrite
the text file, so it is suitable for rebuilding the EPUB after editing the
translation.

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

The translation was generated locally with an Ollama-hosted Gemma 2 model
fine-tuned for Greek/Tsakonian translation. The model and run details are
recorded in `WORK_LOG.md`.

This is machine translation, not a validated Tsakonian edition. It has not been
reviewed by a qualified Tsakonian reader, and automated checks cannot establish
grammatical or semantic accuracy. `ORTHOGRAPHY.md` is a project consistency
reference, not an authoritative grammar or orthographic standard.