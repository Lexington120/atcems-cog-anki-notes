const fs = require("fs");
const path = require("path");
const readline = require("readline");
const pdfParse = require("pdf-parse");

function askQuestion(promptText) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function extractPdfText(fileInput) {
  const resolvedPath = path.resolve(fileInput);

  if (!resolvedPath.toLowerCase().endsWith(".pdf")) {
    throw new Error("Please provide a .pdf file.");
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  const fileBuffer = fs.readFileSync(resolvedPath);
  const parsed = await pdfParse(fileBuffer);
  return parsed.text;
}

function getOutputJsonPathForPdf(pdfPath) {
  const dir = path.dirname(pdfPath);
  const base = path.basename(pdfPath, path.extname(pdfPath));
  return path.join(dir, `${base}.json`);
}

function normalizeLines(text, keepEmpty = false) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim());
  return keepEmpty ? lines : lines.filter((line) => line.length > 0);
}

function getSection(lines, startLabel, endLabel) {
  const startIdx = lines.findIndex((line) =>
    line.toLowerCase().includes(startLabel.toLowerCase())
  );
  if (startIdx === -1) {
    return [];
  }

  let endIdx = lines.length;
  if (endLabel) {
    const foundEndIdx = lines.findIndex(
      (line, idx) =>
        idx > startIdx && line.toLowerCase().includes(endLabel.toLowerCase())
    );
    if (foundEndIdx !== -1) {
      endIdx = foundEndIdx;
    }
  }

  return lines.slice(startIdx + 1, endIdx);
}

function pushLineItem(target, rawLine) {
  const isBullet = /^[•o]\s*/.test(rawLine);
  const cleaned = rawLine.replace(/^[•o]\s*/, "").trim();
  if (!cleaned) {
    return;
  }

  if (isBullet || target.length === 0) {
    target.push(cleaned);
    return;
  }

  target[target.length - 1] = `${target[target.length - 1]} ${cleaned}`;
}

function parseAssessment(assessmentLines) {
  const pediatricPearls = [];
  const signsAndSymptoms = [];
  const differential = [];

  const signsStartTokens = [
    "percentage of glottic opening",
    "neck mobility",
    "beard, may prevent mask seal",
    "facial trauma/instability",
  ];
  const differentialStartTokens = [
    "airway obstruction",
    "pulmonary edema",
    "copd/asthma",
    "stroke",
  ];

  let mode = "pediatricPearls";
  for (const line of assessmentLines) {
    const lower = line.toLowerCase();
    if (
      lower.includes("pediatric pearls") ||
      lower.includes("signs & symptoms") ||
      lower.includes("differential")
    ) {
      continue;
    }

    if (signsStartTokens.some((token) => lower.includes(token))) {
      mode = "signsAndSymptoms";
    }
    if (differentialStartTokens.some((token) => lower.includes(token))) {
      mode = "differential";
    }

    if (mode === "pediatricPearls") {
      pushLineItem(pediatricPearls, line);
    } else if (mode === "signsAndSymptoms") {
      pushLineItem(signsAndSymptoms, line);
    } else {
      pushLineItem(differential, line);
    }
  }

  return {
    pediatricPearls,
    signsAndSymptoms,
    differential,
  };
}

function parseClinicalManagementOptions(optionLines) {
  const result = {
    pl1: [],
    pl2: [],
    pl3: [],
    pl4: [],
    pl5: [],
    pl6: [],
  };

  let currentLevel = null;
  let sawP = false;
  let sawPL = false;

  for (const line of optionLines) {
    if (/^P$/i.test(line)) {
      sawP = true;
      sawPL = false;
      continue;
    }

    if (/^L$/i.test(line) && sawP) {
      sawPL = true;
      continue;
    }

    if (/^[1-6]$/.test(line) && sawPL) {
      currentLevel = `pl${line}`;
      sawP = false;
      sawPL = false;
      continue;
    }

    sawP = false;
    sawPL = false;

    if (line.toLowerCase().includes("general pearls")) {
      currentLevel = null;
      continue;
    }

    if (currentLevel && result[currentLevel]) {
      pushLineItem(result[currentLevel], line);
    }
  }

  return { clinicalManagementOptions: result };
}

function extractSectionText(text, startLabel, endLabel) {
  const startIdx = text.toLowerCase().indexOf(startLabel.toLowerCase());
  if (startIdx === -1) {
    return "";
  }

  const bodyStart = startIdx + startLabel.length;
  const endIdx = text.toLowerCase().indexOf(endLabel.toLowerCase(), bodyStart);
  const bodyEnd = endIdx === -1 ? text.length : endIdx;
  return text.slice(bodyStart, bodyEnd);
}

function parseClinicalManagementOptionsFromText(optionText) {
  const base = {
    pl1: [],
    pl2: [],
    pl3: [],
    pl4: [],
    pl5: [],
    pl6: [],
  };

  if (!optionText) {
    return { clinicalManagementOptions: base };
  }

  const rawLines = normalizeLines(optionText, true);
  const groups = [];
  let currentGroup = [];

  for (const line of rawLines) {
    if (/^(P|L|[1-6])$/i.test(line)) {
      continue;
    }

    if (!line) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
      continue;
    }

    pushLineItem(currentGroup, line);
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  const keys = ["pl1", "pl2", "pl3", "pl4", "pl5", "pl6"];
  const clinicalManagementOptions = { ...base };
  for (let i = 0; i < keys.length; i += 1) {
    if (groups[i]) {
      clinicalManagementOptions[keys[i]] = groups[i];
    }
  }

  return { clinicalManagementOptions };
}

function countPlMarkers(lines) {
  const found = new Set();
  let sawP = false;
  let sawPL = false;

  for (const line of lines) {
    if (/^P$/i.test(line)) {
      sawP = true;
      sawPL = false;
      continue;
    }
    if (/^L$/i.test(line) && sawP) {
      sawPL = true;
      continue;
    }
    if (/^[1-6]$/.test(line) && sawPL) {
      found.add(line);
      sawP = false;
      sawPL = false;
      continue;
    }
    sawP = false;
    sawPL = false;
  }

  return found.size;
}

function findTargetBlock(lines) {
  const cmoIndices = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].toLowerCase().includes("clinical management options")) {
      cmoIndices.push(i);
    }
  }

  if (cmoIndices.length === 0) {
    return { assessmentStart: -1, cmoStart: -1, end: -1 };
  }

  let bestCmoIndex = cmoIndices[0];
  let bestScore = -1;

  for (const idx of cmoIndices) {
    const probeWindow = lines.slice(idx, Math.min(idx + 140, lines.length));
    const score = countPlMarkers(probeWindow);
    if (score > bestScore) {
      bestScore = score;
      bestCmoIndex = idx;
    }
  }

  let assessmentStart = -1;
  for (let i = bestCmoIndex - 1; i >= 0; i -= 1) {
    if (lines[i].toLowerCase().includes("assessment")) {
      assessmentStart = i;
      break;
    }
  }

  let end = lines.length;
  for (let i = bestCmoIndex + 1; i < lines.length; i += 1) {
    if (lines[i].toLowerCase().includes("consult online medical control as needed")) {
      end = i;
      break;
    }
  }

  return { assessmentStart, cmoStart: bestCmoIndex, end };
}

function buildStructuredOutput(text) {
  const lines = normalizeLines(text);
  const { assessmentStart, cmoStart, end } = findTargetBlock(lines);

  const assessmentLines =
    assessmentStart !== -1 && cmoStart !== -1
      ? lines.slice(assessmentStart + 1, cmoStart)
      : getSection(lines, "Assessment", "Clinical Management Options");

  const optionLines =
    cmoStart !== -1
      ? lines.slice(cmoStart + 1, end === -1 ? lines.length : end)
      : getSection(
          lines,
          "Clinical Management Options",
          "Consult Online Medical Control As Needed"
        );
  const optionText = extractSectionText(
    text,
    "Clinical Management Options",
    "Consult Online Medical Control As Needed"
  );

  const assessment = parseAssessment(assessmentLines);
  let { clinicalManagementOptions } =
    parseClinicalManagementOptionsFromText(optionText);

  // Fallback path for PDFs that do not preserve blank-line delineation in extracted text.
  if (
    clinicalManagementOptions.pl1.length === 0 &&
    clinicalManagementOptions.pl2.length === 0 &&
    clinicalManagementOptions.pl3.length === 0 &&
    clinicalManagementOptions.pl4.length === 0 &&
    clinicalManagementOptions.pl5.length === 0
  ) {
    ({ clinicalManagementOptions } = parseClinicalManagementOptions(optionLines));
  }

  return {
    assessment,
    clinicalManagementOptions,
  };
}

async function main() {
  try {
    const inputPath = await askQuestion(
      "Enter a PDF file path or a directory path: "
    );

    if (!inputPath) {
      console.error("No path provided.");
      process.exitCode = 1;
      return;
    }

    const resolvedInputPath = path.resolve(inputPath);
    if (!fs.existsSync(resolvedInputPath)) {
      throw new Error(`Path not found: ${resolvedInputPath}`);
    }

    const stats = fs.statSync(resolvedInputPath);

    if (stats.isFile()) {
      const text = await extractPdfText(resolvedInputPath);
      const structured = buildStructuredOutput(text);
      const outputPath = getOutputJsonPathForPdf(resolvedInputPath);
      fs.writeFileSync(outputPath, JSON.stringify(structured, null, 2), "utf8");

      console.log("\nStructured data saved to:");
      console.log(outputPath);
      return;
    }

    if (!stats.isDirectory()) {
      throw new Error("Input path must be a PDF file or a directory.");
    }

    const entries = fs.readdirSync(resolvedInputPath, { withFileTypes: true });
    const pdfFiles = entries
      .filter(
        (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")
      )
      .map((entry) => path.join(resolvedInputPath, entry.name));

    if (pdfFiles.length === 0) {
      throw new Error("No PDF files found in the selected directory.");
    }

    console.log(`\nProcessing ${pdfFiles.length} PDF file(s)...`);

    for (const pdfPath of pdfFiles) {
      const text = await extractPdfText(pdfPath);
      const structured = buildStructuredOutput(text);
      const outputPath = getOutputJsonPathForPdf(pdfPath);
      fs.writeFileSync(outputPath, JSON.stringify(structured, null, 2), "utf8");
      console.log(`Saved: ${outputPath}`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
