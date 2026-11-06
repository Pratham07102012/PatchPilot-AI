const MAX_FILES = 5;
const MAX_BYTES = 200 * 1024;
const fileInput = document.querySelector("#file-input");
const dropzone = document.querySelector("#dropzone");
const fileList = document.querySelector("#file-list");
const scanButton = document.querySelector("#scan-button");
const resultsSection = document.querySelector("#results-section");
const resultsContainer = document.querySelector("#results");
const resultCount = document.querySelector("#result-count");
const severityFilters = document.querySelector("#severity-filters");
const downloadReportButton = document.querySelector("#download-report");
const clearFilesButton = document.querySelector("#clear-files");
const summaryStats = document.querySelector("#summary-stats");
const findingSearch = document.querySelector("#finding-search");
const notice = document.querySelector("#notice");
const configStatus = document.querySelector("#config-status");
const settingsPanel = document.querySelector("#settings-panel");
const settingsButton = document.querySelector("#settings-button");
const settingsForm = document.querySelector("#settings-form");
const apiKeyInput = document.querySelector("#api-key-input");
const providerSelect = document.querySelector("#provider-select");
const apiKeyLabel = document.querySelector("#api-key-label");
const settingsMessage = document.querySelector("#settings-message");
const settingsCopy = document.querySelector("#settings-copy");
const removeKeyButton = document.querySelector("#remove-key");
const localAuditPanel = document.querySelector(".local-audit-panel");
const privacyNote = document.querySelector("#privacy-note");
const siteAuditCopy = document.querySelector("#site-audit-copy");
const localAuditUrlLabel = document.querySelector("#local-audit-url-label");
const localAuditForm = document.querySelector("#local-audit-form");
const localAuditUrl = document.querySelector("#local-audit-url");
const localAuditReviewButton = document.querySelector("#local-audit-review");
const localAuditResults = document.querySelector("#local-audit-results");
const localAuditDialog = document.querySelector("#local-audit-confirm");
const localAuditConfirmForm = document.querySelector("#local-audit-confirm-form");
const confirmTarget = document.querySelector("#confirm-target");
const confirmSummary = document.querySelector("#confirm-summary");
const confirmBadge = document.querySelector("#confirm-badge");
const confirmWarning = document.querySelector("#confirm-warning");
const confirmOwnershipLabel = document.querySelector("#confirm-ownership-label");
const confirmPassiveLabel = document.querySelector("#confirm-passive-label");
const confirmPhraseLabel = document.querySelector("#confirm-phrase-label");
const confirmOwnership = document.querySelector("#confirm-ownership");
const confirmPassive = document.querySelector("#confirm-passive");
const confirmPhrase = document.querySelector("#confirm-phrase");
const confirmLocalAuditButton = document.querySelector("#confirm-local-audit");
const logicMapSection = document.querySelector("#logic-map-section");
const logicMapTitle = document.querySelector("#logic-map-title");
const logicMapChartSelect = document.querySelector("#logic-map-chart");
const logicMapNote = document.querySelector("#logic-map-note");
const logicMapCanvas = document.querySelector("#logic-map-canvas");
const downloadLogicMapButton = document.querySelector("#download-logic-map");
const downloadMermaidButton = document.querySelector("#download-mermaid");
const files = new Map();
let lastFindings = [];
let lastResults = [];
let activeSeverity = "all";
let findingQuery = "";
let scanModel = "";
let scanProvider = "";
let pendingLocalAuditUrl = "";
let activeLogicMap = null;
let isWebDeployment = false;
let sessionApiKey = "";
let sessionProvider = "gemini";
let pendingSiteChallenge = null;

function showNotice(message, isError = false) {
  notice.textContent = message;
  notice.classList.toggle("error", isError);
  notice.hidden = !message;
}

function renderLocalAudit(audit) {
  localAuditResults.replaceChildren();
  const summary = document.createElement("div");
  summary.className = "audit-summary";
  addText(summary, "strong", "", `${audit.pageCount} page${audit.pageCount === 1 ? "" : "s"} checked`);
  addText(summary, "span", "", `${audit.findings.length} observation${audit.findings.length === 1 ? "" : "s"} · same-origin only${audit.truncated ? ` · ${audit.stopReason}` : ""}`);
  localAuditResults.append(summary);
  addText(localAuditResults, "p", "audit-scope", audit.scope);

  for (const page of audit.pages) {
    const pageSection = document.createElement("section");
    pageSection.className = "audit-page";
    const heading = document.createElement("div");
    heading.className = "audit-page-heading";
    addText(heading, "strong", "", page.title);
    addText(heading, "span", "audit-page-status", `${page.status} · ${new URL(page.url).pathname}`);
    pageSection.append(heading);
    if (page.redirectNotFollowed) {
      addText(pageSection, "p", "audit-note", "Redirect was not followed.");
    }
    if (!page.findings.length) {
      addText(pageSection, "p", "audit-note", "No missing baseline headers or cookie flags were noticed on this page.");
    }
    for (const finding of page.findings) {
      const row = document.createElement("article");
      row.className = "audit-finding";
      addText(row, "span", `severity severity-${finding.severity}`, finding.severity);
      const details = document.createElement("div");
      addText(details, "strong", "", finding.title);
      addText(details, "p", "finding-copy", finding.description);
      addText(details, "p", "finding-recommendation", finding.recommendation);
      row.append(details);
      pageSection.append(row);
    }
    localAuditResults.append(pageSection);
  }
}

function formatSize(bytes) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function formatModelLabel(provider, model) {
  if (provider === "groq" && model.toLowerCase() === "openai/gpt-oss-20b") {
    return "GroqCloud · GPT-OSS 20B (OpenAI model)";
  }
  const providerName = provider === "groq" ? "GroqCloud" : "Gemini";
  return model ? `${providerName} · ${model}` : providerName;
}

function renderFiles() {
  fileList.replaceChildren();
  for (const [name, file] of files) {
    const row = document.createElement("div");
    row.className = "file-row";
    const glyph = document.createElement("span");
    glyph.className = "file-glyph";
    glyph.textContent = name.split(".").pop().slice(0, 4).toUpperCase();
    const label = document.createElement("span");
    label.className = "file-name";
    label.textContent = name;
    const size = document.createElement("span");
    size.className = "file-size";
    size.textContent = formatSize(file.size);
    row.append(glyph, label, size);
    const mapButton = document.createElement("button");
    mapButton.type = "button";
    mapButton.className = "button button-secondary file-map-button";
    mapButton.textContent = "Flowchart";
    mapButton.addEventListener("click", () => createLogicMap(file, mapButton));
    row.append(mapButton);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-file";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${name}`);
    remove.addEventListener("click", () => {
      files.delete(name);
      renderFiles();
    });
    row.append(remove);
    fileList.append(row);
  }
  scanButton.disabled = files.size === 0;
  clearFilesButton.hidden = files.size === 0;
}

function wrapSvgText(text, maxCharacters = 28) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > maxCharacters) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function renderLogicChart(chart) {
  const namespace = "http://www.w3.org/2000/svg";
  const nodeWidth = 210;
  const nodeHeight = 68;
  const columnGap = 54;
  const rowGap = 62;
  const rank = new Map();
  const byId = new Map(chart.nodes.map((node) => [node.id, node]));
  const outgoing = new Map();
  for (const edge of chart.edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(edge);
  }
  const start = chart.nodes.find((node) => node.type === "start") || chart.nodes[0];
  if (start) {
    rank.set(start.id, 0);
    const queue = [start.id];
    while (queue.length) {
      const current = queue.shift();
      for (const edge of outgoing.get(current) || []) {
        if (rank.has(edge.to)) continue;
        rank.set(edge.to, rank.get(current) + 1);
        queue.push(edge.to);
      }
    }
  }
  for (const node of chart.nodes) if (!rank.has(node.id)) rank.set(node.id, rank.size);
  const rowNodes = new Map();
  for (const node of chart.nodes) {
    const row = rank.get(node.id);
    if (!rowNodes.has(row)) rowNodes.set(row, []);
    rowNodes.get(row).push(node);
  }
  const maxColumns = Math.max(1, ...Array.from(rowNodes.values(), (nodes) => nodes.length));
  const svgWidth = Math.max(760, maxColumns * (nodeWidth + columnGap) + columnGap);
  const svgHeight = Math.max(220, (Math.max(...rowNodes.keys()) + 1) * (nodeHeight + rowGap) + 40);
  const positions = new Map();
  for (const [row, nodes] of rowNodes) {
    const rowWidth = nodes.length * nodeWidth + (nodes.length - 1) * columnGap;
    const left = Math.max(30, (svgWidth - rowWidth) / 2);
    nodes.forEach((node, column) => {
      positions.set(node.id, {
        x: left + column * (nodeWidth + columnGap),
        y: 20 + row * (nodeHeight + rowGap),
      });
    });
  }

  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("xmlns", namespace);
  svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
  svg.setAttribute("width", String(svgWidth));
  svg.setAttribute("height", String(svgHeight));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${chart.name} code logic flowchart`);
  const defs = document.createElementNS(namespace, "defs");
  const marker = document.createElementNS(namespace, "marker");
  marker.setAttribute("id", "flow-arrow");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "8");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "6");
  marker.setAttribute("markerHeight", "6");
  marker.setAttribute("orient", "auto-start-reverse");
  const arrow = document.createElementNS(namespace, "path");
  arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  arrow.setAttribute("fill", "#788292");
  marker.append(arrow);
  defs.append(marker);
  svg.append(defs);
  const background = document.createElementNS(namespace, "rect");
  background.setAttribute("width", String(svgWidth));
  background.setAttribute("height", String(svgHeight));
  background.setAttribute("fill", "#111419");
  svg.append(background);

  for (const edge of chart.edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) continue;
    const source = byId.get(edge.from);
    const target = byId.get(edge.to);
    const x1 = from.x + nodeWidth / 2;
    const y1 = from.y + (target && positions.get(edge.to).y < from.y ? 0 : nodeHeight);
    const x2 = to.x + nodeWidth / 2;
    const y2 = to.y + (target && positions.get(edge.to).y < from.y ? nodeHeight : 0);
    const bend = Math.max(28, Math.abs(y2 - y1) * 0.45);
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${y1 + (y2 < y1 ? -bend : bend)}, ${x2} ${y2 - (y2 < y1 ? -bend : bend)}, ${x2} ${y2}`);
    path.setAttribute("class", "flow-edge");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#788292");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("marker-end", "url(#flow-arrow)");
    svg.append(path);
    if (edge.label) {
      const edgeLabel = document.createElementNS(namespace, "text");
      edgeLabel.setAttribute("x", String((x1 + x2) / 2 + (x1 === x2 ? 11 : 0)));
      edgeLabel.setAttribute("y", String((y1 + y2) / 2 - 5));
      edgeLabel.setAttribute("class", "flow-edge-label");
      edgeLabel.setAttribute("fill", "#b5f269");
      edgeLabel.setAttribute("font-family", "monospace");
      edgeLabel.setAttribute("font-size", "11");
      edgeLabel.textContent = edge.label;
      svg.append(edgeLabel);
    }
    if (source?.type === "decision" && x1 !== x2 && !edge.label) {
      const fallbackLabel = document.createElementNS(namespace, "title");
      fallbackLabel.textContent = "Branch";
      path.append(fallbackLabel);
    }
  }

  for (const node of chart.nodes) {
    const position = positions.get(node.id);
    if (!position) continue;
    const group = document.createElementNS(namespace, "g");
    group.setAttribute("class", `flow-node flow-node-${node.type}`);
    group.setAttribute("aria-label", `${node.type}: ${node.label}${node.line ? `, line ${node.line}` : ""}`);
    const shape = document.createElementNS(namespace, node.type === "decision" ? "polygon" : "rect");
    const shapeColors = {
      start: ["#202a19", "#8db955"],
      end: ["#202a19", "#8db955"],
      decision: ["#2a2518", "#d6a74c"],
      merge: ["#1e2631", "#647b99"],
      terminal: ["#2b1e20", "#a7656b"],
      statement: ["#1a2028", "#4b5869"],
    };
    shape.setAttribute("fill", shapeColors[node.type]?.[0] || "#1a2028");
    shape.setAttribute("stroke", shapeColors[node.type]?.[1] || "#4b5869");
    shape.setAttribute("stroke-width", "1.5");
    if (node.type === "decision") {
      const midX = position.x + nodeWidth / 2;
      shape.setAttribute("points", `${midX},${position.y} ${position.x + nodeWidth},${position.y + nodeHeight / 2} ${midX},${position.y + nodeHeight} ${position.x},${position.y + nodeHeight / 2}`);
    } else {
      shape.setAttribute("x", String(position.x));
      shape.setAttribute("y", String(position.y));
      shape.setAttribute("width", String(nodeWidth));
      shape.setAttribute("height", String(nodeHeight));
      shape.setAttribute("rx", node.type === "start" || node.type === "end" ? "24" : "8");
    }
    group.append(shape);
    const lines = wrapSvgText(node.label);
    const text = document.createElementNS(namespace, "text");
    text.setAttribute("x", String(position.x + nodeWidth / 2));
    text.setAttribute("y", String(position.y + nodeHeight / 2 - ((lines.length - 1) * 7)));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("class", "flow-node-label");
    text.setAttribute("fill", "#e5e8ed");
    text.setAttribute("font-family", "monospace");
    text.setAttribute("font-size", "11");
    lines.forEach((line, index) => {
      const tspan = document.createElementNS(namespace, "tspan");
      tspan.setAttribute("x", String(position.x + nodeWidth / 2));
      tspan.setAttribute("dy", index === 0 ? "0" : "14");
      tspan.textContent = line;
      text.append(tspan);
    });
    group.append(text);
    if (node.line) {
      const lineLabel = document.createElementNS(namespace, "text");
      lineLabel.setAttribute("x", String(position.x + nodeWidth - 9));
      lineLabel.setAttribute("y", String(position.y + nodeHeight - 7));
      lineLabel.setAttribute("text-anchor", "end");
      lineLabel.setAttribute("class", "flow-line-number");
      lineLabel.setAttribute("fill", "#929baa");
      lineLabel.setAttribute("font-family", "monospace");
      lineLabel.setAttribute("font-size", "9");
      lineLabel.textContent = `L${node.line}`;
      group.append(lineLabel);
    }
    svg.append(group);
  }
  logicMapCanvas.replaceChildren(svg);
}

function showLogicMap(map) {
  activeLogicMap = map;
  logicMapTitle.textContent = `${map.file} · ${map.language} logic map`;
  logicMapNote.textContent = map.note;
  logicMapChartSelect.replaceChildren();
  map.charts.forEach((chart, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = chart.name;
    logicMapChartSelect.append(option);
  });
  renderLogicChart(map.charts[0]);
  logicMapSection.hidden = false;
  logicMapSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function createLogicMap(file, button) {
  button.disabled = true;
  button.textContent = "Mapping…";
  try {
    const map = await post("/api/logic-map", { file });
    showLogicMap(map);
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Flowchart";
  }
}

async function addFiles(selectedFiles) {
  showNotice("");
  for (const file of selectedFiles) {
    if (files.size >= MAX_FILES && !files.has(file.name)) {
      showNotice(`You can scan up to ${MAX_FILES} files at once.`, true);
      break;
    }
    if (file.size > MAX_BYTES) {
      showNotice(`${file.name} is over the 200 KB per-file limit.`, true);
      continue;
    }
    if (files.has(file.name)) {
      showNotice(`${file.name} is already in the upload list. Remove it first to replace it.`, true);
      continue;
    }
    try {
      const content = await file.text();
      if (content.includes("\u0000")) {
        showNotice(`${file.name} appears to be binary. Choose a text-based source file.`, true);
        continue;
      }
      files.set(file.name, { name: file.name, content, size: file.size });
    } catch {
      showNotice(`Could not read ${file.name}. Check file permissions and try again.`, true);
    }
  }
  renderFiles();
}

function getProviderHeaders() {
  if (!isWebDeployment || !sessionApiKey) return {};
  return {
    "X-PatchPilot-API-Key": sessionApiKey,
    "X-PatchPilot-Provider": sessionProvider,
  };
}

async function post(path, body, includeProviderKey = true) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(includeProviderKey ? getProviderHeaders() : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

async function scanWithProgress(body, onEvent) {
  const response = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getProviderHeaders() },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  if (!response.body) throw new Error("This app could not receive scan progress. Restart PatchPilot and try again.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  while (!completed) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const eventText of events) {
      const dataLine = eventText.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      const event = JSON.parse(dataLine.slice(6));
      onEvent(event);
      if (event.type === "error") throw new Error(event.message);
      if (event.type === "complete") completed = true;
    }
    if (done) break;
  }
  if (!completed) throw new Error("The scan connection ended before Gemini returned results. Check your connection and retry.");
}

function addText(parent, tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function renderFinding(finding) {
  const card = document.createElement("article");
  card.className = "result-card";
  const top = document.createElement("div");
  top.className = "result-top";
  addText(top, "span", `severity severity-${finding.severity}`, finding.severity);
  addText(top, "h3", "finding-title", finding.title);
  addText(top, "span", "finding-line", finding.line ? `L${finding.line}` : "");
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "copy-finding";
  copyButton.textContent = "Copy";
  copyButton.setAttribute("aria-label", `Copy ${finding.title}`);
  copyButton.addEventListener("click", async () => {
    const text = [
      `${finding.severity.toUpperCase()}: ${finding.title}`,
      `File: ${finding.file}${finding.line ? ` (line ${finding.line})` : ""}`,
      finding.description,
      finding.recommendation ? `Recommendation: ${finding.recommendation}` : "",
    ].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      copyButton.textContent = "Copied";
      setTimeout(() => { copyButton.textContent = "Copy"; }, 1400);
    } catch {
      showNotice("Could not copy this finding. Check clipboard permissions and try again.", true);
    }
  });
  top.append(copyButton);
  card.append(top);
  addText(card, "p", "finding-copy", finding.description);
  if (finding.recommendation) {
    const recommendation = document.createElement("p");
    recommendation.className = "finding-recommendation";
    addText(recommendation, "strong", "", `${finding.category}: `);
    recommendation.append(document.createTextNode(finding.recommendation));
    card.append(recommendation);
  }
  return card;
}

function renderResults(responseResults) {
  resultsContainer.replaceChildren();
  lastResults = responseResults;
  lastFindings = responseResults.flatMap((result) => result.findings.map((finding) => ({ file: result.name, ...finding })));
  const normalizedQuery = findingQuery.trim().toLocaleLowerCase();
  const matchesQuery = (finding) => !normalizedQuery || [
    finding.file, finding.title, finding.description, finding.recommendation, finding.category,
  ].some((value) => String(value || "").toLocaleLowerCase().includes(normalizedQuery));
  const allCount = lastFindings.length;
  const filteredFindings = lastFindings.filter((finding) => (
    (activeSeverity === "all" || finding.severity === activeSeverity) && matchesQuery(finding)
  ));
  const matchingCount = filteredFindings.length;
  resultCount.textContent = activeSeverity === "all"
    ? `${matchingCount}${normalizedQuery ? ` of ${allCount}` : ""} finding${matchingCount === 1 ? "" : "s"}`
    : `${matchingCount} of ${allCount} findings`;
  const criticalCount = lastFindings.filter((finding) => ["critical", "high"].includes(finding.severity)).length;
  summaryStats.replaceChildren();
  [
    { label: "Files scanned", value: responseResults.length, tone: "neutral" },
    { label: "Total findings", value: allCount, tone: allCount ? "accent" : "good" },
    { label: "Critical + high", value: criticalCount, tone: criticalCount ? "danger" : "good" },
    { label: "Provider · model", value: formatModelLabel(scanProvider, scanModel), tone: "neutral" },
  ].forEach(({ label, value, tone }) => {
    const stat = document.createElement("div");
    stat.className = `stat-card stat-${tone}`;
    addText(stat, "span", "stat-label", label);
    addText(stat, "strong", "stat-value", String(value));
    summaryStats.append(stat);
  });
  for (const button of severityFilters.querySelectorAll(".filter-chip")) {
    const severity = button.dataset.severity;
    const count = severity === "all" ? allCount : lastFindings.filter((finding) => finding.severity === severity).length;
    const label = severity === "all" ? "All" : `${severity[0].toUpperCase()}${severity.slice(1)}`;
    button.textContent = `${label} (${count})`;
    const selected = severity === activeSeverity;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }

  for (const result of responseResults) {
    const visibleFindings = result.findings.filter((finding) => (
      (activeSeverity === "all" || finding.severity === activeSeverity) && matchesQuery({ file: result.name, ...finding })
    ));
    if (normalizedQuery && !result.name.toLocaleLowerCase().includes(normalizedQuery)
      && visibleFindings.length === 0) continue;
    if (!visibleFindings.length && result.findings.length) continue;
    const section = document.createElement("section");
    section.className = "file-result";
    addText(section, "div", "file-result-name", result.name);
    addText(section, "p", "summary", result.summary);
    if (result.findings.length === 0) {
      addText(section, "article", "result-card", "No actionable syntax or security issues were identified.");
    } else {
      for (const finding of visibleFindings) section.append(renderFinding({ file: result.name, ...finding }));
    }

    const actions = document.createElement("div");
    actions.className = "result-actions";
    addText(actions, "p", "", "Generate a suggested patch, then review it before applying.");
    const fixButton = document.createElement("button");
    fixButton.type = "button";
    fixButton.className = "button button-secondary";
    fixButton.textContent = "Suggest a fix";
    fixButton.addEventListener("click", () => suggestFix(result, section, fixButton));
    actions.append(fixButton);
    section.append(actions);
    resultsContainer.append(section);
  }
  if (matchingCount === 0) {
    addText(resultsContainer, "p", "summary empty-filter", "No findings match this severity filter.");
  }
  resultsSection.hidden = false;
}

function downloadReport() {
  const report = {
    format: "patchpilot-scan-report",
    version: 1,
    generatedAt: new Date().toISOString(),
    provider: scanProvider,
    model: scanModel,
    findingCount: lastFindings.length,
    findingsBySeverity: Object.fromEntries(
      ["critical", "high", "medium", "low", "info"].map((severity) => [
        severity,
        lastFindings.filter((finding) => finding.severity === severity).length,
      ]),
    ),
    files: lastResults.map((result) => ({
      name: result.name,
      summary: result.summary,
      findings: result.findings,
    })),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `patchpilot-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

severityFilters.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-severity]");
  if (!button) return;
  activeSeverity = button.dataset.severity;
  renderResults(lastResults);
});
findingSearch.addEventListener("input", () => {
  findingQuery = findingSearch.value;
  renderResults(lastResults);
});
document.addEventListener("keydown", (event) => {
  const target = event.target;
  const isTyping = target instanceof HTMLElement
    && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
  if (event.key === "/" && !isTyping && !resultsSection.hidden) {
    event.preventDefault();
    findingSearch.focus();
  } else if (event.key === "Escape" && target === findingSearch) {
    findingSearch.value = "";
    findingQuery = "";
    renderResults(lastResults);
    findingSearch.blur();
  }
});
downloadReportButton.addEventListener("click", downloadReport);
logicMapChartSelect.addEventListener("change", () => {
  const chart = activeLogicMap?.charts[Number(logicMapChartSelect.value)];
  if (chart) renderLogicChart(chart);
});
document.querySelector("#close-logic-map").addEventListener("click", () => {
  logicMapSection.hidden = true;
});
downloadLogicMapButton.addEventListener("click", () => {
  const svg = logicMapCanvas.querySelector("svg");
  if (!svg) return;
  const content = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([content], { type: "image/svg+xml;charset=utf-8" }));
  const link = document.createElement("a");
  const safeName = activeLogicMap.file.replace(/[^a-z0-9._-]/gi, "_");
  const chartName = activeLogicMap.charts[Number(logicMapChartSelect.value)].name.replace(/[^a-z0-9._-]/gi, "_");
  link.href = url;
  link.download = `${safeName}-${chartName}-flowchart.svg`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
downloadMermaidButton.addEventListener("click", () => {
  const chart = activeLogicMap?.charts[Number(logicMapChartSelect.value)];
  if (!chart) return;
  const url = URL.createObjectURL(new Blob([chart.mermaid], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  const safeName = activeLogicMap.file.replace(/[^a-z0-9._-]/gi, "_");
  const chartName = chart.name.replace(/[^a-z0-9._-]/gi, "_");
  link.href = url;
  link.download = `${safeName}-${chartName}-flowchart.mmd`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
clearFilesButton.addEventListener("click", () => {
  files.clear();
  renderFiles();
  showNotice("Selected files cleared.");
});

async function suggestFix(result, section, button) {
  button.disabled = true;
  button.textContent = "Generating…";
  showNotice("");
  try {
    const response = await post("/api/fix", {
      files: [{ name: result.name, content: files.get(result.name).content }],
      findings: lastFindings.filter((finding) => finding.file === result.name),
    });
    const fixed = response.results[0];
    const preview = document.createElement("div");
    preview.className = "fix-preview";
    addText(preview, "p", "summary", `${fixed.summary} Review the complete file below before applying.`);
    const textarea = document.createElement("textarea");
    textarea.setAttribute("aria-label", `Suggested code for ${result.name}`);
    textarea.spellcheck = false;
    textarea.value = fixed.fixedCode;
    preview.append(textarea);
    const fixActions = document.createElement("div");
    fixActions.className = "fix-actions";
    const download = document.createElement("button");
    download.type = "button";
    download.className = "button button-secondary";
    download.textContent = "Download patch";
    download.addEventListener("click", () => {
      const url = URL.createObjectURL(new Blob([textarea.value], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `fixed-${result.name}`;
      link.click();
      URL.revokeObjectURL(url);
    });
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "button button-primary";
    apply.textContent = "Use suggested code";
    apply.addEventListener("click", () => {
      const original = files.get(result.name);
      files.set(result.name, { ...original, content: textarea.value, size: new Blob([textarea.value]).size });
      renderFiles();
      showNotice(`Suggested code applied to the in-memory preview for ${result.name}. The original file on disk was not changed.`);
      apply.disabled = true;
      apply.textContent = "Applied";
    });
    fixActions.append(download, apply);
    preview.append(fixActions);
    section.querySelector(".fix-preview")?.remove();
    section.append(preview);
    preview.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Suggest a fix";
  }
}

fileInput.addEventListener("change", async () => {
  await addFiles(fileInput.files);
  fileInput.value = "";
});
dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});
for (const eventName of ["dragenter", "dragover"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
  });
}
dropzone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));
scanButton.addEventListener("click", async () => {
  scanButton.disabled = true;
  const scanLabel = scanButton.querySelector("span");
  const startedAt = Date.now();
  scanLabel.textContent = "Scanning · 0s";
  const totalFiles = files.size;
  let completedFiles = 0;
  let currentFile = "";
  const scanResults = [];
  scanModel = "";
  scanProvider = "";
  const progressTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    scanLabel.textContent = `Scanning · ${elapsed}s`;
    if (elapsed >= 20) {
      showNotice(
        `${scanProvider === "groq" ? "GroqCloud" : "Gemini"} is still analyzing${currentFile ? ` ${currentFile}` : " your files"} (${completedFiles} of ${totalFiles} complete). Large files or a slow API response can take a while.`,
      );
    }
  }, 1000);
  showNotice("");
  try {
    await scanWithProgress({ files: [...files.values()] }, (event) => {
      if (event.type === "file-start") {
        currentFile = event.name;
        scanModel = event.model;
        scanProvider = event.provider;
        scanLabel.textContent = `Scanning ${event.completed + 1}/${event.total}`;
        showNotice(`Sending ${event.name} to ${formatModelLabel(event.provider, event.model)} for analysis. Results will appear as each file finishes.`);
      } else if (event.type === "file-result") {
        completedFiles = event.completed;
        currentFile = "";
        scanResults.push({ name: event.name, ...event.result });
        showNotice(`Scanned ${completedFiles} of ${event.total} files. ${event.name} is ready.`);
        if (completedFiles === event.total) renderResults(scanResults);
      } else if (event.type === "model-progress") {
        currentFile = event.name;
        showNotice(`${formatModelLabel(event.provider || scanProvider, event.model || scanModel)} is analyzing ${event.name}…`);
      }
    });
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    clearInterval(progressTimer);
    scanButton.disabled = files.size === 0;
    scanLabel.textContent = "Scan code";
  }
});

settingsButton.addEventListener("click", () => {
  settingsPanel.hidden = !settingsPanel.hidden;
  if (!settingsPanel.hidden) apiKeyInput.focus();
});
document.querySelector("#close-settings").addEventListener("click", () => {
  settingsPanel.hidden = true;
});
settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  settingsMessage.textContent = "";
  const saveButton = settingsForm.querySelector("button[type=submit]");
  saveButton.disabled = true;
  try {
    const provider = providerSelect.value;
    if (isWebDeployment && !window.patchPilot) {
      const apiKey = apiKeyInput.value.trim();
      if (apiKey.length < 10 || apiKey.length > 512) {
        throw new Error("Enter a valid API key for the selected provider.");
      }
      sessionApiKey = apiKey;
      sessionProvider = provider;
      settingsMessage.textContent = `${provider === "groq" ? "GroqCloud" : "Gemini"} key is held in memory for this tab only.`;
      setKeyStatus(true, provider);
    } else {
      if (!window.patchPilot) throw new Error("Persistent API-key storage is available in the installed desktop app.");
      await window.patchPilot.saveApiKey({ provider, apiKey: apiKeyInput.value });
      settingsMessage.textContent = `${provider === "groq" ? "GroqCloud" : "Gemini"} API key saved securely on this PC.`;
      setKeyStatus(true, provider);
    }
    apiKeyInput.value = "";
    settingsPanel.hidden = true;
  } catch (error) {
    settingsMessage.textContent = error.message;
  } finally {
    saveButton.disabled = false;
  }
});
removeKeyButton.addEventListener("click", async () => {
  if (isWebDeployment && !window.patchPilot) {
    sessionApiKey = "";
    setKeyStatus(false, sessionProvider);
    settingsMessage.textContent = "The key was cleared from this tab.";
    return;
  }
  if (!window.patchPilot) return;
  try {
    await window.patchPilot.clearApiKey();
    setKeyStatus(false);
    settingsMessage.textContent = "Saved API key removed from this PC.";
  } catch (error) {
    settingsMessage.textContent = error.message;
  }
});

localAuditForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!localAuditForm.reportValidity()) return;
  pendingLocalAuditUrl = localAuditUrl.value.trim();
  if (isWebDeployment) {
    prepareSiteOwnershipChallenge();
    return;
  }
  openAuditConfirmation();
});

function openAuditConfirmation() {
  confirmTarget.textContent = pendingLocalAuditUrl;
  const phrase = isWebDeployment ? "I OWN THIS SITE" : "LOCALHOST ONLY";
  confirmSummary.replaceChildren(
    document.createTextNode(isWebDeployment
      ? "The passive check will make up to 8 GET requests to "
      : "The audit will make up to 25 GET requests to "),
    confirmTarget,
    document.createTextNode(isWebDeployment
      ? ", at most two link levels deep. It reads response headers and HTML only."
      : ", at most two link levels deep. It reads response headers and HTML only."),
  );
  confirmOwnership.checked = false;
  confirmPassive.checked = false;
  confirmPhrase.value = "";
  const phraseLabel = document.createElement("strong");
  phraseLabel.textContent = phrase;
  confirmPhraseLabel.replaceChildren(
    document.createTextNode("Type "),
    phraseLabel,
    document.createTextNode(" to enable the check"),
  );
  confirmLocalAuditButton.disabled = true;
  localAuditDialog.showModal();
}

function addCopyRow(parent, label, value) {
  const row = document.createElement("div");
  row.className = "audit-copy-row";
  addText(row, "strong", "", label);
  const code = document.createElement("code");
  code.textContent = value;
  row.append(code);
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "button button-secondary";
  copy.textContent = "Copy";
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(value);
      copy.textContent = "Copied";
    } catch (error) {
      addText(parent, "p", "audit-error", `Could not copy to clipboard: ${error.message}`);
    }
  });
  row.append(copy);
  parent.append(row);
}

async function prepareSiteOwnershipChallenge() {
  localAuditReviewButton.disabled = true;
  localAuditReviewButton.textContent = "Preparing verification…";
  localAuditResults.replaceChildren();
  try {
    pendingSiteChallenge = {
      ...(await post("/api/site-audit/challenge", { url: pendingLocalAuditUrl }, false)),
      url: pendingLocalAuditUrl,
    };
    addText(localAuditResults, "p", "audit-note", "To verify that you control this domain, add the following temporary DNS TXT record. DNS changes may take a few minutes to appear.");
    addCopyRow(localAuditResults, "Record name", pendingSiteChallenge.recordName);
    addCopyRow(localAuditResults, "TXT value", pendingSiteChallenge.recordValue);
    addText(localAuditResults, "p", "audit-note", "After the check finishes, remove this TXT record to revoke the verification proof.");
    const verifyButton = document.createElement("button");
    verifyButton.type = "button";
    verifyButton.className = "button button-primary";
    verifyButton.id = "verify-site-ownership";
    verifyButton.textContent = "Verify DNS ownership";
    verifyButton.addEventListener("click", verifySiteOwnership);
    localAuditResults.append(verifyButton);
  } catch (error) {
    pendingSiteChallenge = null;
    addText(localAuditResults, "p", "audit-error", error.message);
  } finally {
    localAuditReviewButton.disabled = false;
    localAuditReviewButton.textContent = "Prepare ownership verification";
  }
}

async function verifySiteOwnership() {
  if (!pendingSiteChallenge || pendingSiteChallenge.url !== pendingLocalAuditUrl) {
    showNotice("Prepare a new DNS verification record for this website URL.", true);
    return;
  }
  const verifyButton = document.querySelector("#verify-site-ownership");
  verifyButton.disabled = true;
  verifyButton.textContent = "Verifying DNS…";
  try {
    await post("/api/site-audit/verify", {
      url: pendingLocalAuditUrl,
      token: pendingSiteChallenge.token,
    }, false);
    showNotice("Domain ownership verified. Confirm the passive check to continue.");
    openAuditConfirmation();
  } catch (error) {
    addText(localAuditResults, "p", "audit-error", error.message);
    verifyButton.disabled = false;
    verifyButton.textContent = "Verify DNS ownership";
  }
}
for (const element of [confirmOwnership, confirmPassive, confirmPhrase]) {
  element.addEventListener("input", updateLocalAuditConfirmation);
  element.addEventListener("change", updateLocalAuditConfirmation);
}
document.querySelector("#cancel-local-audit").addEventListener("click", () => localAuditDialog.close("cancel"));
localAuditConfirmForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (
    !confirmOwnership.checked
    || !confirmPassive.checked
    || confirmPhrase.value.trim() !== (isWebDeployment ? "I OWN THIS SITE" : "LOCALHOST ONLY")
  ) return;
  localAuditDialog.close("confirmed");
  await runLocalAudit();
});

function updateLocalAuditConfirmation() {
  confirmLocalAuditButton.disabled = !confirmOwnership.checked
    || !confirmPassive.checked
    || confirmPhrase.value.trim() !== (isWebDeployment ? "I OWN THIS SITE" : "LOCALHOST ONLY");
}

async function runLocalAudit() {
  localAuditReviewButton.disabled = true;
  localAuditReviewButton.textContent = "Auditing…";
  localAuditResults.replaceChildren();
  addText(localAuditResults, "p", "audit-note", isWebDeployment
    ? "Checking public HTTPS pages and response headers…"
    : "Checking localhost pages and response headers…");
  try {
    const audit = await post(isWebDeployment ? "/api/site-audit" : "/api/local-audit", {
      url: pendingLocalAuditUrl,
      confirmLocalOwnership: confirmOwnership.checked,
      confirmNoPayloads: confirmPassive.checked,
      confirmationText: confirmPhrase.value.trim(),
      ...(isWebDeployment ? { verificationToken: pendingSiteChallenge?.token } : {}),
    }, !isWebDeployment);
    renderLocalAudit(audit);
    pendingSiteChallenge = null;
  } catch (error) {
    localAuditResults.replaceChildren();
    addText(localAuditResults, "p", "audit-error", error.message);
  } finally {
    localAuditReviewButton.disabled = false;
    localAuditReviewButton.textContent = isWebDeployment ? "Review permission & continue" : "Review safety & continue";
  }
}

function updateProviderLabels() {
  const groq = providerSelect.value === "groq";
  apiKeyLabel.textContent = groq ? "GroqCloud API key" : "Google AI Studio API key";
  apiKeyInput.placeholder = groq ? "Paste your Groq API key" : "Paste your Gemini API key";
}

providerSelect.addEventListener("change", () => {
  updateProviderLabels();
  if (isWebDeployment && sessionApiKey && providerSelect.value !== sessionProvider) {
    sessionApiKey = "";
    setKeyStatus(false, providerSelect.value);
    settingsMessage.textContent = "The key was cleared because the provider changed. Enter a key for the selected provider.";
  }
});

function setKeyStatus(configured, provider = "gemini") {
  const providerName = provider === "groq" ? "Groq" : "Gemini";
  configStatus.textContent = configured
    ? `${providerName} key ${isWebDeployment ? "ready for this tab" : "saved"}`
    : "AI provider key not configured";
  providerSelect.value = provider;
  updateProviderLabels();
  document.querySelector(".status-dot").classList.toggle("ready", configured);
  removeKeyButton.textContent = isWebDeployment ? "Clear this tab's key" : "Remove saved key";
  removeKeyButton.hidden = !configured;
  if (!configured) settingsPanel.hidden = false;
}

Promise.all([
  fetch("/api/health").then((response) => response.json()),
  window.patchPilot?.getKeyStatus() || Promise.resolve(null),
])
  .then(([health, desktopStatus]) => {
    isWebDeployment = Boolean(health.webDeployment && !window.patchPilot);
    localAuditPanel.hidden = isWebDeployment
      ? !health.siteAuditAvailable
      : !health.localAuditAvailable;
    if (isWebDeployment) {
      settingsCopy.textContent = "Choose your provider and enter your own API key. It is held in this tab's memory and sent over HTTPS to PatchPilot, then to the provider for your requests. PatchPilot does not save it; reloading or closing the tab clears it.";
      privacyNote.textContent = "Files are sent to the selected AI provider · Not saved by PatchPilot";
      localAuditUrl.placeholder = "https://example.com";
      localAuditUrlLabel.textContent = "Public HTTPS website URL";
      localAuditPanel.querySelector(".workspace-head .file-limit").textContent = "PUBLIC HTTPS · PASSIVE GET ONLY";
      siteAuditCopy.textContent = "Check a public HTTPS website that you own or have permission to assess. PatchPilot checks basic response security headers and cookie settings, follows same-origin links only, and never submits forms or sends exploit payloads. Hosted mode cannot reach localhost or private networks.";
      localAuditReviewButton.textContent = "Prepare ownership verification";
      confirmBadge.textContent = "PUBLIC WEBSITE SAFETY CHECK";
      document.querySelector("#local-audit-confirm-title").textContent = "Confirm permission to check this website";
      confirmWarning.textContent = "It will not submit forms, try passwords, or send attack/injection payloads. Redirects and links outside this exact origin are not followed. Requests are limited to public HTTPS websites and may still have side effects on poorly designed sites.";
      confirmOwnershipLabel.lastChild.textContent = " I own this website or have permission to check it.";
      confirmPassiveLabel.lastChild.textContent = " I understand this is a passive, GET-only check with no payloads or form submissions.";
      confirmLocalAuditButton.textContent = "Start passive check";
    }
    const settings = desktopStatus || health;
    setKeyStatus(settings.configured, settings.provider);
    if (!health.configured) {
      showNotice(window.patchPilot
        ? "Save a Gemini or Groq API key in API key settings to start scanning."
        : isWebDeployment
          ? "Enter your own Gemini or Groq API key in API key settings to start scanning."
          : "Set GEMINI_API_KEY or GROQ_API_KEY on the server to enable AI scans.", true);
    }
  })
  .catch(() => {
    configStatus.textContent = "Scanner unavailable";
    showNotice("Could not reach the local scanner. Restart PatchPilot and try again.", true);
  });
