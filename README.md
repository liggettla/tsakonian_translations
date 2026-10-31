# Tsakonian Translation

## Build the EPUB

Run from this directory:

```sh
python3 build_epub.py
```

The default input is `τςακονιαν/1 Harry Potter - Tsakonian.txt`; the EPUB is
written beside it. To normalize the text file's paragraph indents and rebuild:

```sh
python3 build_epub.py --format-text
```

The script uses only the Python standard library. Use `--input`, `--output`, and
`--author` to override the defaults. Every build validates the EPUB archive,
XML documents, manifest resources, and chapter navigation.