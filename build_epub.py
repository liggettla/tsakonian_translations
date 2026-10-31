#!/usr/bin/env python3
"""Format the Tsakonian text and build a navigable EPUB 3 edition."""

from __future__ import annotations

import argparse
import hashlib
import html
import posixpath
import sys
import uuid
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parent
DEFAULT_INPUT = ROOT / "τςακονιαν" / "1 Harry Potter - Tsakonian.txt"
DEFAULT_OUTPUT = DEFAULT_INPUT.with_suffix(".epub")
LANGUAGE = "tsd"
AUTHOR = "J. K. Rowling"
XHTML_NS = "http://www.w3.org/1999/xhtml"
EPUB_NS = "http://www.idpf.org/2007/ops"
OPF_NS = "http://www.idpf.org/2007/opf"

CHAPTER_TITLES = (
    "Το Αγογκί π̔' εσούστε",
    "Το Τζάμι π̔' εφαγκίστε.",
    "Τα Γράμματα Από Τον Κανένα",
    "Ο Κλειδοκράτορα",
    "Α Διαγώνια Αλέα",
    "Το Ταξίδι Από ταν Παλαιοφόρμα 9 τ͡σαι 3/4",
    "Το Καπέλε τα Επιλογή",
    "Ο Καθηγήτα Των Φίλτρων",
    "Μονομάχία Τα Μεσάνυχτα",
    "Χάλοουιν",
    "Κουίντιτ͡σε",
    "Ο Καθρέφτε ν̂' εξερίε",
    "Ο Νίκολας Φλαμέλ",
    "Νόρμπερτ, ο Νορβηγικό Δράκο",
    "Το Απαγορευτέ Δάσ̌ος",
    "Τάσου Από Ταν Καταβάτ͡σα",
    "Ο Άτσ̌ωπο Με Τα Δύου Πρόσωπα",
)
CHAPTER_SET = frozenset(CHAPTER_TITLES)

CSS = """@charset "UTF-8";
@page { margin: 7%; }
html { font-family: Georgia, "Times New Roman", serif; }
body { color: #24211e; line-height: 1.55; }
.title-page { margin: 18vh auto 0; max-width: 32em; text-align: center; }
.title-page h1 { font-size: 2em; font-weight: normal; line-height: 1.25; }
.title-page .creator { font-size: 1.15em; margin-top: 2.5em; }
.title-page .edition { font-size: 0.9em; font-style: italic; margin-top: 4em; }
.chapter { break-before: page; page-break-before: always; }
.chapter h1 { font-size: 1.55em; font-weight: normal; line-height: 1.35;
  margin: 1.8em 0 1.4em; page-break-after: avoid; text-align: center; }
.chapter-number { display: block; font-size: 0.62em; margin-bottom: 0.7em; }
.chapter-title { display: block; }
.chapter h2 { font-size: 1.05em; font-weight: normal; line-height: 1.4;
  margin: 1.5em 0 0.8em; page-break-after: avoid; text-align: center; }
.chapter p { margin: 0; text-align: justify; text-indent: 1.2em; }
.chapter h1 + p, .chapter h2 + p { text-indent: 0; }
.title-page + * { break-before: page; }
nav ol { list-style: none; padding-left: 0; }
nav li { margin: 0.45em 0; }
"""


@dataclass(frozen=True)
class Paragraph:
    text: str
    blank_before: bool
    blank_after: bool


@dataclass
class Chapter:
    title: str
    entries: list[tuple[str, str]] = field(default_factory=list)


def parse_paragraphs(text: str) -> list[Paragraph]:
    raw: list[tuple[str, bool]] = []
    blank_pending = False
    for line in text.splitlines():
        value = line.strip()
        if not value:
            blank_pending = True
            continue
        raw.append((value, blank_pending))
        blank_pending = False

    return [
        Paragraph(
            text=value,
            blank_before=blank_before,
            blank_after=raw[index + 1][1] if index + 1 < len(raw) else True,
        )
        for index, (value, blank_before) in enumerate(raw)
    ]


def is_internal_heading(paragraph: Paragraph) -> bool:
    return (
        paragraph.text not in CHAPTER_SET
        and paragraph.blank_before
        and paragraph.blank_after
    )


def format_plain_text(paragraphs: list[Paragraph]) -> str:
    if not paragraphs:
        raise ValueError("The input text is empty.")

    output = [paragraphs[0].text, ""]
    for paragraph in paragraphs[1:]:
        if paragraph.text in CHAPTER_SET or is_internal_heading(paragraph):
            if output[-1] != "":
                output.append("")
            output.append(paragraph.text)
            output.append("")
        else:
            output.append("\t" + paragraph.text)

    while output and output[-1] == "":
        output.pop()
    return "\r\n".join(output) + "\r\n"


def split_chapters(paragraphs: list[Paragraph]) -> tuple[str, list[Chapter]]:
    if not paragraphs:
        raise ValueError("The input text is empty.")

    title = paragraphs[0].text
    chapters: list[Chapter] = []
    current: Chapter | None = None
    for paragraph in paragraphs[1:]:
        if paragraph.text in CHAPTER_SET:
            current = Chapter(title=paragraph.text)
            chapters.append(current)
        elif current is None:
            raise ValueError(
                f"Content appears before the first chapter: {paragraph.text[:60]}"
            )
        elif is_internal_heading(paragraph):
            current.entries.append(("heading", paragraph.text))
        else:
            current.entries.append(("paragraph", paragraph.text))

    found = [chapter.title for chapter in chapters]
    missing = [title for title in CHAPTER_TITLES if title not in found]
    if missing:
        raise ValueError("Chapter titles not found: " + "; ".join(missing))
    if len(found) != len(CHAPTER_TITLES):
        raise ValueError(
            f"Expected {len(CHAPTER_TITLES)} chapters; found {len(found)}."
        )
    return title, chapters


def xhtml_document(title: str, body: str) -> str:
    safe_title = html.escape(title, quote=False)
    return f'''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="{XHTML_NS}" xmlns:epub="{EPUB_NS}" lang="{LANGUAGE}" xml:lang="{LANGUAGE}">
<head>
  <title>{safe_title}</title>
  <meta charset="utf-8" />
  <link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
{body}
</body>
</html>
'''


def render_title_page(title: str, author: str) -> str:
    return xhtml_document(
        title,
        """<main epub:type="frontmatter">
  <section epub:type="titlepage" class="title-page">
    <h1>"""
        + html.escape(title, quote=False)
        + """</h1>
    <p class="creator">"""
        + html.escape(author, quote=False)
        + """</p>
    <p class="edition">Tsakonian translation</p>
  </section>
</main>""",
    )


def render_chapter(chapter: Chapter, number: int) -> str:
    heading_id = f"chapter-{number:02d}"
    body = [
        '<main epub:type="bodymatter">',
        f'<section epub:type="chapter" class="chapter" aria-labelledby="{heading_id}">',
        f'<h1 id="{heading_id}"><span class="chapter-number">{number}</span>',
        f'<span class="chapter-title">{html.escape(chapter.title, quote=False)}</span></h1>',
    ]
    for kind, text in chapter.entries:
        escaped = html.escape(text, quote=False)
        if kind == "heading":
            body.append(f'<h2 class="section-heading">{escaped}</h2>')
        else:
            body.append(f"<p>{escaped}</p>")
    body.extend(("</section>", "</main>"))
    return xhtml_document(chapter.title, "\n".join(body))


def render_nav(chapters: list[Chapter]) -> str:
    links = "\n".join(
        f'<li><a href="chapter-{index:02d}.xhtml#chapter-{index:02d}">'
        f"{html.escape(chapter.title, quote=False)}</a></li>"
        for index, chapter in enumerate(chapters, 1)
    )
    return xhtml_document(
        "Contents",
        f'''<nav epub:type="toc" id="toc">
  <h1>Contents</h1>
  <ol>
{links}
  </ol>
</nav>''',
    )


def render_package(
    title: str,
    author: str,
    identifier: str,
    modified: str,
    chapters: list[Chapter],
) -> str:
    chapter_items = "\n".join(
        f'<item id="chapter-{index:02d}" href="chapter-{index:02d}.xhtml" '
        'media-type="application/xhtml+xml" />'
        for index in range(1, len(chapters) + 1)
    )
    chapter_spine = "\n".join(
        f'<itemref idref="chapter-{index:02d}" />'
        for index in range(1, len(chapters) + 1)
    )
    return f'''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="{OPF_NS}" xmlns:dc="http://purl.org/dc/elements/1.1/" version="3.0" unique-identifier="pub-id" xml:lang="{LANGUAGE}">
  <metadata>
    <dc:identifier id="pub-id">urn:uuid:{identifier}</dc:identifier>
    <dc:title>{html.escape(title, quote=False)}</dc:title>
    <dc:creator>{html.escape(author, quote=False)}</dc:creator>
    <dc:language>{LANGUAGE}</dc:language>
    <dc:description>Machine-generated Tsakonian translation; not linguistically reviewed.</dc:description>
    <meta property="dcterms:modified">{modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="titlepage" href="titlepage.xhtml" media-type="application/xhtml+xml" />
    <item id="style" href="style.css" media-type="text/css" />
{chapter_items}
  </manifest>
  <spine>
    <itemref idref="titlepage" />
{chapter_spine}
  </spine>
</package>
'''


def validate_epub(path: Path, expected_chapters: int) -> None:
    with zipfile.ZipFile(path, "r") as archive:
        names = archive.namelist()
        if not names or names[0] != "mimetype":
            raise ValueError("EPUB mimetype must be the first archive entry.")
        if archive.getinfo("mimetype").compress_type != zipfile.ZIP_STORED:
            raise ValueError("EPUB mimetype must be stored without compression.")
        if archive.read("mimetype") != b"application/epub+zip":
            raise ValueError("Invalid EPUB mimetype entry.")
        if archive.testzip() is not None:
            raise ValueError("The EPUB archive failed its CRC check.")

        for name in names:
            if name.endswith((".xml", ".opf", ".xhtml")):
                ET.fromstring(archive.read(name))

        package = ET.fromstring(archive.read("OEBPS/package.opf"))
        manifest = package.find(f"{{{OPF_NS}}}manifest")
        if manifest is None:
            raise ValueError("EPUB package has no manifest.")
        for item in manifest:
            href = item.get("href")
            if href and posixpath.join("OEBPS", href) not in names:
                raise ValueError(f"Missing manifest resource: {href}")

        nav = ET.fromstring(archive.read("OEBPS/nav.xhtml"))
        link_count = len(nav.findall(f".//{{{XHTML_NS}}}a"))
        if link_count != expected_chapters:
            raise ValueError(
                f"Contents lists {link_count} chapters, expected {expected_chapters}."
            )


def build_epub(input_path: Path, output_path: Path, author: str, format_text: bool) -> int:
    if input_path.resolve() == output_path.resolve():
        raise ValueError("Input and output paths must be different.")

    original = input_path.read_text(encoding="utf-8-sig")
    paragraphs = parse_paragraphs(original)
    if format_text:
        formatted = format_plain_text(paragraphs)
        input_path.write_bytes(formatted.encode("utf-8"))
        paragraphs = parse_paragraphs(formatted)

    title, chapters = split_chapters(paragraphs)
    source_digest = hashlib.sha256(input_path.read_bytes()).hexdigest()
    identifier = uuid.uuid5(uuid.NAMESPACE_URL, f"tsakonian-epub:{source_digest}")
    modified = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )

    package_files: list[tuple[str, bytes]] = [
        ("META-INF/container.xml", (f'''<?xml version="1.0" encoding="utf-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>
''').encode("utf-8")),
        ("OEBPS/style.css", CSS.encode("utf-8")),
        ("OEBPS/nav.xhtml", render_nav(chapters).encode("utf-8")),
        ("OEBPS/titlepage.xhtml", render_title_page(title, author).encode("utf-8")),
    ]
    for index, chapter in enumerate(chapters, 1):
        package_files.append(
            (
                f"OEBPS/chapter-{index:02d}.xhtml",
                render_chapter(chapter, index).encode("utf-8"),
            )
        )
    package_files.append(
        (
            "OEBPS/package.opf",
            render_package(
                title,
                author,
                str(identifier),
                modified,
                chapters,
            ).encode("utf-8"),
        )
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_path, "w") as archive:
        archive.writestr(
            "mimetype", b"application/epub+zip", compress_type=zipfile.ZIP_STORED
        )
        for name, content in package_files:
            archive.writestr(name, content, compress_type=zipfile.ZIP_DEFLATED)

    validate_epub(output_path, len(chapters))
    paragraph_count = sum(
        1
        for chapter in chapters
        for kind, _ in chapter.entries
        if kind == "paragraph"
    )
    return paragraph_count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="UTF-8 text input")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="EPUB output path")
    parser.add_argument("--author", default=AUTHOR, help="Creator metadata")
    parser.add_argument(
        "--format-text",
        action="store_true",
        help="Normalize the input file in place before building the EPUB",
    )
    args = parser.parse_args()

    try:
        paragraph_count = build_epub(
            args.input.expanduser(),
            args.output.expanduser(),
            args.author,
            args.format_text,
        )
    except (OSError, ValueError, zipfile.BadZipFile, ET.ParseError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    size_kib = args.output.stat().st_size / 1024
    if args.format_text:
        print(f"Formatted text: {args.input}")
    print(
        f"Created and validated {args.output} "
        f"({len(CHAPTER_TITLES)} chapters, {paragraph_count} paragraphs, {size_kib:.1f} KiB)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())