# atcems-cog-anki-notes

Study materials and tooling around Austin–Travis County EMS (ATCEMS) clinical operating guidelines (COG), including structured extracts suitable for flashcards (for example, Anki).

## PDF to structured JSON (`Nodejs/app.js`)

The main application is a small **Node.js CLI** that reads one or more **COG-style guideline PDFs**, pulls plain text with [`pdf-parse`](https://www.npmjs.com/package/pdf-parse), and writes **JSON** next to each PDF (same file name, `.json` extension).

### Prerequisites

- [Node.js](https://nodejs.org/) installed on your machine.

### Install

```bash
cd Nodejs
npm install
```

### Run

```bash
cd Nodejs
npm start
# or: node app.js
```

When prompted, enter either:

- **Path to a single `.pdf` file**, or  
- **Path to a directory** that contains one or more PDFs.

The tool resolves the path, verifies it exists, then:

1. **Single file:** extracts text, parses it, writes `<same-name-as-pdf>.json` in the **same folder** as the PDF, and prints that path.
2. **Directory:** finds every `.pdf` in that directory (not subfolders), processes each the same way, and prints each output path.

If the path is missing, invalid, or not a file/directory, the process exits with a non-zero code and an error message on stderr.

### How parsing works

The PDF text is normalized into lines (trimmed, runs of whitespace collapsed). The parser looks for guideline sections that match the COG layout:

- **`Assessment`** — split into:
  - `pediatricPearls` — bullets and narrative before the signs/symptoms block.
  - `signsAndSymptoms` — content after known “signs” anchor phrases in the text (for example, glottic opening, neck mobility).
  - `differential` — content after differential anchor phrases (for example, airway obstruction, pulmonary edema).

- **`Clinical Management Options`** — six provider levels **`pl1` … `pl6`**, corresponding to cumulative management options (P/L/1–6 markers in some PDFs).

The code tries to anchor on headings such as **“Clinical Management Options”** and **“Consult Online Medical Control As Needed”** (end of that block). When multiple “Clinical Management Options” regions appear, it prefers the block that has the clearest **P/L/1–6** marker pattern in the following lines. If blank-line structure is lost in the PDF extract, it **falls back** to a line-based parser that follows **P**, **L**, and **1–6** lines.

Bullet lines (`•` or `o` at the start) become separate array entries; continuation lines are appended to the previous item.

### Output shape

Each generated JSON file has this top-level structure:

```json
{
  "assessment": {
    "pediatricPearls": ["..."],
    "signsAndSymptoms": ["..."],
    "differential": ["..."]
  },
  "clinicalManagementOptions": {
    "pl1": ["..."],
    "pl2": ["..."],
    "pl3": ["..."],
    "pl4": ["..."],
    "pl5": ["..."],
    "pl6": ["..."]
  }
}
```

Example outputs live under `Nodejs/ClinicalGuidelines/` (paired JSON from processed guidelines).

### Anki and CSV

This repository may also contain **CSV** files formatted for Anki import (for example, `Front`, `Back`, `Document` columns). Those files are **not** produced by `app.js`; they are separate assets you can import into Anki after you build cards from the JSON or from your own notes.
