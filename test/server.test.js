const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createServer,
  validateFiles,
  localSyntaxFindings,
  buildLogicMap,
  logicChartToMermaid,
  validateLocalAuditUrl,
  auditLocalSite,
  extractModelJson,
  extractInteractionText,
  extractGroqText,
  groqResponseFormat,
} = require("../server");

test("validates text source files and limits upload size", () => {
  assert.deepEqual(validateFiles({ files: [{ name: "main.js", content: "const ok = true;" }] }), [
    { name: "main.js", content: "const ok = true;" },
  ]);
  assert.throws(() => validateFiles({ files: [{ name: "..\\secret.js", content: "x" }] }), /File name is invalid/);
  assert.throws(() => validateFiles({ files: [{ name: "data.bin", content: "\u0000" }] }), /binary file/);
  assert.throws(() => validateFiles({ files: [{ name: "a.js", content: "x" }, { name: "a.js", content: "y" }] }), /unique/);
  assert.throws(() => validateFiles({ files: [{ name: "large.js", content: "x".repeat(200 * 1024 + 1) }] }), /200 KB/);
  assert.throws(() => validateFiles({ files: [] }), /Upload between/);
});

test("locally detects JavaScript and JSON syntax errors without executing source", () => {
  assert.deepEqual(localSyntaxFindings({ name: "valid.js", content: "globalThis.pilotTest = true;" }), []);
  assert.deepEqual(localSyntaxFindings({ name: "valid.json", content: '{"ok":true}' }), []);
  assert.deepEqual(localSyntaxFindings({ name: "notes.txt", content: "const = broken" }), []);

  const jsFindings = localSyntaxFindings({ name: "broken.js", content: "const ok = true;\nfunction {" });
  assert.equal(jsFindings.length, 1);
  assert.equal(jsFindings[0].severity, "high");
  assert.equal(jsFindings[0].category, "Local syntax check");
  assert.equal(jsFindings[0].title, "JavaScript syntax error");

  const jsonFindings = localSyntaxFindings({ name: "broken.json", content: '{\n  "ok":,\n}' });
  assert.equal(jsonFindings.length, 1);
  assert.equal(jsonFindings[0].title, "Invalid JSON syntax");
  assert.equal(jsonFindings[0].severity, "high");
});

test("builds static function and control-flow charts from valid JavaScript", () => {
  delete globalThis.patchPilotFlowMapSideEffect;
  const map = buildLogicMap({
    name: "logic.js",
    content: [
      "globalThis.patchPilotFlowMapSideEffect = true;",
      "const active = true;",
      "function decide(value) {",
      "  if (value) return 'yes';",
      "  return 'no';",
      "}",
      "for (const item of items) {",
      "  process(item);",
      "}",
    ].join("\n"),
  });
  assert.equal(map.file, "logic.js");
  assert.equal(map.charts[0].name, "Module");
  assert.equal(map.charts.some((chart) => chart.name === "decide"), true);
  const functionChart = map.charts.find((chart) => chart.name === "decide");
  assert.ok(functionChart.nodes.some((node) => node.type === "decision" && node.label.includes("if (value)")));
  assert.ok(functionChart.edges.some((edge) => edge.label === "Yes"));
  assert.ok(functionChart.edges.some((edge) => edge.label === "No"));
  assert.ok(functionChart.edges.some((edge) => functionChart.nodes.find((node) => node.id === edge.from)?.type === "terminal"
    && functionChart.nodes.find((node) => node.id === edge.to)?.type === "end"));
  assert.ok(map.charts[0].nodes.some((node) => node.type === "decision" && node.label.includes("item of items")));
  assert.equal(globalThis.patchPilotFlowMapSideEffect, undefined);
  assert.match(map.note, /does not execute code/);
  assert.equal(map.mode, "ast");
  assert.match(map.charts[0].mermaid, /^flowchart TD/m);
  assert.match(functionChart.mermaid, /if \(value\)/);
  assert.throws(() => buildLogicMap({ name: "broken.js", content: "function {" }), /syntax is valid/);
  assert.throws(() => buildLogicMap({ name: "large.js", content: `${"work();\n".repeat(160)}` }), /limited to 150 nodes/);
});

test("builds best-effort flowcharts for common non-JavaScript languages", () => {
  const samples = [
    {
      name: "app.py",
      language: "Python",
      content: "def check(value):\n    if value:\n        return True\n    for item in values:\n        print(item)\n    return False",
    },
    {
      name: "Main.java",
      language: "Java",
      content: "class Main {\n  void check(boolean ready) {\n    if (ready) {\n      run();\n    }\n    while (active) {\n      tick();\n    }\n  }\n}",
    },
    {
      name: "main.go",
      language: "Go",
      content: "func main() {\n  if ready {\n    run()\n  }\n  for item := range items {\n    process(item)\n  }\n}",
    },
    {
      name: "main.rs",
      language: "Rust",
      content: "fn main() {\n  if ready {\n    run();\n  }\n  for item in items {\n    process(item);\n  }\n}",
    },
    {
      name: "script.rb",
      language: "Ruby",
      content: "def check(value)\n  if value\n    return true\n  end\n  value.each do |item|\n    puts item\n  end\nend",
    },
  ];
  for (const sample of samples) {
    const map = buildLogicMap(sample);
    assert.equal(map.language, sample.language);
    assert.equal(map.mode, "heuristic");
    assert.equal(map.charts.length, 1);
    assert.match(map.charts[0].mermaid, /^flowchart TD/m);
    assert.ok(map.charts[0].nodes.some((node) => node.type === "decision"), `${sample.name} should have a decision node`);
    assert.match(map.note, /Best-effort/);
    assert.match(map.note, /does not execute code/);
  }
  const dataMap = buildLogicMap({ name: "config.yaml", content: "enabled: true\nif: ready" });
  assert.equal(dataMap.language, "YAML");
  assert.equal(dataMap.mode, "heuristic");
  assert.throws(() => buildLogicMap({ name: "notes.txt", content: `${"statement\n".repeat(160)}` }), /too many visible statements/);
});

test("restricts local website audit URLs to exact loopback hosts", () => {
  assert.equal(validateLocalAuditUrl("http://localhost:3000/app#top").href, "http://localhost:3000/app");
  assert.equal(validateLocalAuditUrl("http://127.0.0.1:8080/").hostname, "127.0.0.1");
  assert.equal(validateLocalAuditUrl("http://[::1]:8080/").hostname, "[::1]");
  for (const value of [
    "https://example.com/",
    "http://127.0.0.2/",
    "http://localhost.evil.test/",
    "file:///etc/passwd",
    "http://user:pass@localhost/",
    "http://localhost./",
  ]) {
    assert.throws(() => validateLocalAuditUrl(value), /Only http/);
  }
});

test("crawls a bounded same-origin localhost site using GET only", async (t) => {
  const requests = [];
  const site = require("node:http").createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Set-Cookie", "session=secret");
    if (request.url === "/") {
      response.end('<title>Local Test</title><a href="/child">Child</a><a href="https://example.com/out">External</a><form method="post" action="/submit"><input name="x"></form>');
    } else {
      response.end("<title>Child page</title><p>Local page</p>");
    }
  });
  await new Promise((resolve) => site.listen(0, "127.0.0.1", resolve));
  t.after(() => site.close());
  const result = await auditLocalSite(`http://127.0.0.1:${site.address().port}/`);
  assert.equal(result.pageCount, 2);
  assert.equal(result.pages[0].title, "Local Test");
  assert.equal(result.pages[1].title, "Child page");
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => request.method === "GET"));
  assert.ok(requests.every((request) => request.url === "/" || request.url === "/child"));
  assert.ok(result.findings.some((finding) => finding.title.includes("HttpOnly")));
  assert.match(result.scope, /No exploit or injection payloads/);

  const localhostResult = await auditLocalSite(`http://localhost:${site.address().port}/`);
  assert.equal(localhostResult.pageCount, 2);
  assert.equal(requests.length, 4);
});

test("local website audit endpoint requires both explicit confirmations", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/local-audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "http://127.0.0.1:1", confirmLocalOwnership: true }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Confirm local ownership/);
});

test("serves generated JavaScript logic maps", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/logic-map`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file: { name: "app.js", content: "if (ready) run();" } }),
  });
  assert.equal(response.status, 200);
  const map = await response.json();
  assert.equal(map.file, "app.js");
  assert.ok(map.charts[0].nodes.some((node) => node.type === "decision"));
  assert.ok(map.charts[0].mermaid.includes("-->"));
});

test("exports Mermaid syntax with escaped labels and labeled branches", () => {
  const source = logicChartToMermaid({
    nodes: [
      { id: "n1", type: "start", label: 'Start "safe" <flow>' },
      { id: "n2", type: "decision", label: "ready | valid" },
      { id: "n3", type: "end", label: "Done" },
    ],
    edges: [
      { from: "n1", to: "n2", label: "" },
      { from: "n2", to: "n3", label: "Yes | continue" },
    ],
  });
  assert.match(source, /n1\(\["Start #quot;safe#quot; #lt;flow#gt;"\]\)/);
  assert.match(source, /n2\{"ready #124; valid"\}/);
  assert.match(source, /n2 -->\|"Yes #124; continue"\| n3/);
});

test("serves best-effort flowcharts for non-JavaScript source files", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/logic-map`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file: { name: "main.py", content: "if ready:\n  run()\nelse:\n  stop()" } }),
  });
  assert.equal(response.status, 200);
  const map = await response.json();
  assert.equal(map.language, "Python");
  assert.equal(map.mode, "heuristic");
  assert.ok(map.charts[0].nodes.some((node) => node.type === "decision"));
});

test("parses plain and fenced model JSON", () => {
  assert.deepEqual(extractModelJson('{"findings":[]}'), { findings: [] });
  assert.deepEqual(extractModelJson('```json\n{"findings":[]}\n```'), { findings: [] });
});

test("extracts output text from raw Interactions API steps", () => {
  assert.equal(extractInteractionText({
    steps: [
      { type: "thought", summary: [{ type: "text", text: "private reasoning" }] },
      { type: "model_output", content: [{ type: "text", text: '{"summary":"done","findings":[]}' }] },
    ],
  }), '{"summary":"done","findings":[]}');
  assert.equal(extractInteractionText({ output_text: "answer" }), "answer");
});

test("extracts Groq completion text and reports empty or refused answers", () => {
  assert.equal(extractGroqText({
    choices: [{ message: { content: '{"summary":"done"}' }, finish_reason: "stop" }],
  }), '{"summary":"done"}');
  assert.equal(extractGroqText({
    choices: [{ message: { content: [{ type: "text", text: '{"summary":' }, { type: "text", text: '"done"}' }] } }],
  }), '{"summary":"done"}');
  assert.throws(() => extractGroqText({ choices: [{ message: { content: "" }, finish_reason: "length" }] }), /smaller file/);
  assert.throws(() => extractGroqText({ choices: [{ message: { content: "", refusal: "not allowed" } }] }), /declined/);
});

test("builds strict Groq schemas with all required fields", () => {
  const scan = groqResponseFormat("scan");
  assert.equal(scan.type, "json_schema");
  assert.equal(scan.json_schema.strict, true);
  assert.deepEqual(scan.json_schema.schema.required, ["summary", "findings"]);
  assert.equal(scan.json_schema.schema.additionalProperties, false);
  assert.deepEqual(scan.json_schema.schema.properties.findings.items.required, [
    "severity", "category", "line", "title", "description", "recommendation",
  ]);
  const fix = groqResponseFormat("fix");
  assert.deepEqual(fix.json_schema.schema.required, ["summary", "findings", "fixedCode"]);
});

test("serves the local UI and reports Gemini configuration without leaking the key", async (t) => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalGroqKey = process.env.GROQ_API_KEY;
  const originalProvider = process.env.PATCHPILOT_PROVIDER;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.PATCHPILOT_PROVIDER;
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.close();
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroqKey;
    if (originalProvider === undefined) delete process.env.PATCHPILOT_PROVIDER;
    else process.env.PATCHPILOT_PROVIDER = originalProvider;
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${base}/api/health`);
  assert.deepEqual(await health.json(), {
    configured: false,
    provider: "gemini",
    model: "gemini-3.8-flash",
    webDeployment: false,
    localAuditAvailable: true,
  });
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-security-policy"), /default-src 'self'/);
  assert.match(await home.text(), /Review every suggested change/);
});

test("supports transient visitor keys in hosted mode and disables localhost auditing", async (t) => {
  const originalFetch = global.fetch;
  const server = createServer({ webDeployment: true });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.close();
    global.fetch = originalFetch;
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const noKeyResponse = await originalFetch(`${base}/api/health`);
  const noKeyHealth = await noKeyResponse.json();
  assert.equal(noKeyHealth.configured, false);
  assert.equal(noKeyHealth.webDeployment, true);
  assert.equal(noKeyHealth.localAuditAvailable, false);

  const visitorKey = "visitor-groq-test-key";
  const healthResponse = await originalFetch(`${base}/api/health`, {
    headers: {
      "X-PatchPilot-API-Key": visitorKey,
      "X-PatchPilot-Provider": "groq",
    },
  });
  const health = await healthResponse.json();
  assert.equal(health.configured, true);
  assert.equal(health.provider, "groq");
  assert.equal(JSON.stringify(health).includes(visitorKey), false);

  let upstreamKey;
  global.fetch = async (url, options) => {
    assert.equal(String(url), "https://api.groq.com/openai/v1/chat/completions");
    upstreamKey = options.headers.Authorization;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ summary: "No issues.", findings: [] }) } }],
    }), { status: 200 });
  };
  const scanResponse = await originalFetch(`${base}/api/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PatchPilot-API-Key": visitorKey,
      "X-PatchPilot-Provider": "groq",
    },
    body: JSON.stringify({ files: [{ name: "app.js", content: "const value = 1;" }] }),
  });
  const scanEvents = (await scanResponse.text())
    .split("\n\n")
    .filter((block) => block.startsWith("data: "))
    .map((block) => JSON.parse(block.slice(6)));
  assert.equal(scanEvents.at(-1).type, "complete");
  assert.equal(upstreamKey, `Bearer ${visitorKey}`);

  const auditResponse = await originalFetch(`${base}/api/local-audit`, { method: "POST" });
  assert.equal(auditResponse.status, 403);
  assert.match((await auditResponse.json()).error, /hosted server cannot access/);
});

test("reports unconfigured Gemini instead of returning fake scan results", async (t) => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalGroqKey = process.env.GROQ_API_KEY;
  const originalProvider = process.env.PATCHPILOT_PROVIDER;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.PATCHPILOT_PROVIDER;
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.close();
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroqKey;
    if (originalProvider === undefined) delete process.env.PATCHPILOT_PROVIDER;
    else process.env.PATCHPILOT_PROVIDER = originalProvider;
  });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: [{ name: "app.js", content: "const value = 1;" }] }),
  });
  assert.equal(response.status, 200);
  const events = (await response.text())
    .split("\n\n")
    .filter((block) => block.startsWith("data: "))
    .map((block) => JSON.parse(block.slice(6)));
  assert.equal(events[0].type, "file-start");
  assert.equal(events[0].model, "gemini-3.8-flash");
  assert.equal(events[1].type, "error");
  assert.match(events[1].message, /Gemini API key/);
});

test("sends source to Gemini server-side and returns scan and fix results", async (t) => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalGroqKey = process.env.GROQ_API_KEY;
  const originalProvider = process.env.PATCHPILOT_PROVIDER;
  const originalFetch = global.fetch;
  let simulateTemporaryOverload = true;
  let geminiRequestCount = 0;
  process.env.GEMINI_API_KEY = "test-only-key";
  delete process.env.GROQ_API_KEY;
  process.env.PATCHPILOT_PROVIDER = "gemini";
  global.fetch = async (url, options) => {
    assert.equal(String(url), "https://generativelanguage.googleapis.com/v1beta/interactions");
    assert.equal(options.headers["x-goog-api-key"], "test-only-key");
    const request = JSON.parse(options.body);
    assert.equal(request.model, "gemini-3.8-flash");
    assert.equal(request.store, false);
    assert.equal(request.stream, true);
    assert.equal(request.generation_config.thinking_level, "low");
    if (request.generation_config.max_output_tokens !== undefined) {
      assert.equal(request.generation_config.max_output_tokens, 2048);
    }
    assert.match(request.input, /const value = 1;/);
    assert.equal(typeof request.system_instruction, "string");
    geminiRequestCount += 1;
    if (simulateTemporaryOverload) {
      simulateTemporaryOverload = false;
      return new Response(JSON.stringify({ error: { message: "Temporarily overloaded." } }), { status: 503 });
    }
    const output = JSON.stringify({
      summary: "One issue found.",
      findings: [{
        severity: "low",
        category: "Syntax",
        line: 1,
        title: "Example finding",
        description: "A test finding.",
        recommendation: "Review this line.",
      }],
      fixedCode: "const value = 2;",
    });
    const split = Math.floor(output.length / 2);
    const stream = [
      `event: step.start\ndata: ${JSON.stringify({ event_type: "step.start", step: { type: "model_output", content: [{ type: "text", text: output.slice(0, split) }] } })}\n\n`,
      `event: step.delta\ndata: ${JSON.stringify({ event_type: "step.delta", delta: { type: "text", text: output.slice(split) } })}\n\n`,
      `event: interaction.completed\ndata: ${JSON.stringify({ event_type: "interaction.completed" })}\n\n`,
      "event: done\ndata: [DONE]\n\n",
    ].join("");
    return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  };

  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.close();
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroqKey;
    if (originalProvider === undefined) delete process.env.PATCHPILOT_PROVIDER;
    else process.env.PATCHPILOT_PROVIDER = originalProvider;
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  const scanResponse = await originalFetch(`${base}/api/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: [{ name: "app.js", content: "const value = 1;" }] }),
  });
  assert.equal(scanResponse.status, 200);
  assert.match(scanResponse.headers.get("content-type"), /text\/event-stream/);
  const scanEvents = (await scanResponse.text())
    .split("\n\n")
    .filter((block) => block.startsWith("data: "))
    .map((block) => JSON.parse(block.slice(6)));
  assert.deepEqual(scanEvents.map((event) => event.type), [
    "file-start",
    "model-progress",
    "model-progress",
    "file-result",
    "complete",
  ]);
  assert.equal(scanEvents[3].result.findings[0].title, "Example finding");

  const fixResponse = await originalFetch(`${base}/api/fix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: [{ name: "app.js", content: "const value = 1;" }] }),
  });
  assert.equal(fixResponse.status, 200);
  const fixedResult = (await fixResponse.json()).results[0];
  assert.equal(fixedResult.findings[0].title, "Example finding");
  assert.equal(fixedResult.fixedCode, "const value = 2;");
  assert.equal(geminiRequestCount, 3);
});

test("uses Groq's OpenAI-compatible API with the selected provider key", async (t) => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGroqKey = process.env.GROQ_API_KEY;
  const originalProvider = process.env.PATCHPILOT_PROVIDER;
  const originalFetch = global.fetch;
  delete process.env.GEMINI_API_KEY;
  process.env.GROQ_API_KEY = "groq-test-only-key";
  process.env.PATCHPILOT_PROVIDER = "groq";
  global.fetch = async (url, options) => {
    assert.equal(String(url), "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(options.headers.Authorization, "Bearer groq-test-only-key");
    const request = JSON.parse(options.body);
    assert.equal(request.model, "openai/gpt-oss-20b");
    assert.equal(request.stream, false);
    assert.equal(request.response_format.type, "json_schema");
    assert.equal(request.response_format.json_schema.strict, true);
    assert.deepEqual(request.response_format.json_schema.schema.required, ["summary", "findings"]);
    assert.match(request.messages[1].content, /const value = 1;/);
    const output = JSON.stringify({
      summary: "Groq scan finished.",
      findings: [{
        severity: "low",
        category: "Review",
        line: 1,
        title: "Example Groq finding",
        description: "A test finding.",
        recommendation: "Review this line.",
      }],
      fixedCode: "const value = 2;",
    });
    return new Response(JSON.stringify({
      choices: [{ message: { role: "assistant", content: output }, finish_reason: "stop" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.close();
    global.fetch = originalFetch;
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroqKey;
    if (originalProvider === undefined) delete process.env.PATCHPILOT_PROVIDER;
    else process.env.PATCHPILOT_PROVIDER = originalProvider;
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await originalFetch(`${base}/api/health`);
  assert.deepEqual(await health.json(), {
    configured: true,
    provider: "groq",
    model: "openai/gpt-oss-20b",
    webDeployment: false,
    localAuditAvailable: true,
  });
  const response = await originalFetch(`${base}/api/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: [{ name: "app.js", content: "const value = 1;" }] }),
  });
  const events = (await response.text())
    .split("\n\n")
    .filter((block) => block.startsWith("data: "))
    .map((block) => JSON.parse(block.slice(6)));
  const result = events.find((event) => event.type === "file-result");
  assert.equal(events[0].model, "openai/gpt-oss-20b");
  assert.equal(result.result.summary, "Groq scan finished.");
  assert.equal(result.result.findings[0].title, "Example Groq finding");
});

test("retries Groq JSON validation failures using JSON object mode", async (t) => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGroqKey = process.env.GROQ_API_KEY;
  const originalProvider = process.env.PATCHPILOT_PROVIDER;
  const originalFetch = global.fetch;
  delete process.env.GEMINI_API_KEY;
  process.env.GROQ_API_KEY = "groq-test-only-key";
  process.env.PATCHPILOT_PROVIDER = "groq";
  let requestCount = 0;
  global.fetch = async (url, options) => {
    requestCount += 1;
    const request = JSON.parse(options.body);
    if (requestCount === 1) {
      assert.equal(String(url), "https://api.groq.com/openai/v1/chat/completions");
      assert.equal(request.response_format.type, "json_schema");
      return new Response(JSON.stringify({
        error: {
          message: "Failed to validate JSON. Please adjust your prompt.",
          code: "json_validate_failed",
        },
      }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    assert.deepEqual(request.response_format, { type: "json_object" });
    assert.match(request.messages[0].content, /JSON/);
    return new Response(JSON.stringify({
      choices: [{
        message: {
          role: "assistant",
          content: JSON.stringify({ summary: "Fallback succeeded.", findings: [] }),
        },
        finish_reason: "stop",
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.close();
    global.fetch = originalFetch;
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroqKey;
    if (originalProvider === undefined) delete process.env.PATCHPILOT_PROVIDER;
    else process.env.PATCHPILOT_PROVIDER = originalProvider;
  });

  const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: [{ name: "app.js", content: "const value = 1;" }] }),
  });
  const events = (await response.text())
    .split("\n\n")
    .filter((block) => block.startsWith("data: "))
    .map((block) => JSON.parse(block.slice(6)));
  const result = events.find((event) => event.type === "file-result");
  assert.equal(result.result.summary, "Fallback succeeded.");
  assert.equal(requestCount, 2);
});
