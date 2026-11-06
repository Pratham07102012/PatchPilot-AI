# PatchPilot

PatchPilot is a Windows desktop app for reviewing source files with Google Gemini or GroqCloud. It reports AI-identified syntax and security findings, generates suggested replacements, and lets you review and download changes without modifying the original files on disk.

## Build the Windows installer

The installer bundles the desktop runtime; people installing it do not need to install Node.js, npm, or a browser separately.

To build it from source, install Node.js 20 or newer on the build computer, open PowerShell in this folder, and run:

```powershell
npm.cmd install
npm.cmd run dist
```

The Windows x64 installer is written to `dist\PatchPilot-Setup-1.7.0.exe`. Share that installer with your hackathon judges. When they install it and open PatchPilot, the app runs in its own desktop window without the native File/View/Edit menu bar.

Scan results include severity filters, a live search across file names and finding details, summary counts, and a one-click copy action for each finding. Selected files can be cleared together, and reports can be downloaded as JSON. Reports include findings and model metadata, but never include uploaded source code.

JavaScript (`.js`, `.cjs`) and JSON files also receive a local syntax parse check. The app parses but never executes uploaded code.

Choose **Flowchart** beside any uploaded text file to build a local diagram. JavaScript (`.js`, `.cjs`, `.mjs`) gets an AST-based map with module statements and separate charts for up to 20 functions. Other extensions (including Python, Java, C/C++, C#, Go, Rust, PHP, Ruby, Swift, Kotlin, SQL, shell, and configuration/text files) get a best-effort, line-based chart that recognizes common control-flow keywords. Select charts and download them as SVG or Mermaid (`.mmd`) diagrams. All maps are local and never execute code. The non-JavaScript chart is approximate and does not fully parse language grammar; inspect it against the source before relying on branch/loop paths. Maps are limited to 150 nodes per chart.

## First launch

1. Create an API key with [Google AI Studio](https://aistudio.google.com/apikey) or [GroqCloud](https://console.groq.com/keys).
2. Open PatchPilot and choose **API key settings**.
3. Select the provider that issued the key, paste it, and choose **Save key**. PatchPilot stores it encrypted using Windows secure storage on that PC, so it remains available on future launches.
4. Upload source files and choose **Scan code**.

API keys are provider-specific; selecting a provider does not make its key work with another provider. Desktop keys are not bundled into the installer or exposed to browser code. A saved desktop key is specific to the Windows user and computer; entering it once does not transfer it to another computer. You can replace or remove it from the same settings panel.

## Development and tests

Run the desktop app from source with `npm.cmd start`. To run the standalone local web server instead, set `$env:GEMINI_API_KEY` and run `npm.cmd run start:web`. Run `node --test` to execute the built-in tests.

## Deploy a public web demo

The repository includes a Render Blueprint in `render.yaml`. To deploy it, push the project to a GitHub repository, sign in to Render, choose **New → Blueprint**, connect that repository, and apply the `patchpilot-web` service. Render will build the app and provide an HTTPS URL when deployment finishes. The source folder must be in a GitHub repository for this setup; a URL is not created until the service is deployed.

The hosted app does not use a shared provider API key. Each visitor enters their own Gemini or Groq key in **API key settings**; the key stays in that browser tab's memory and is sent to the app over HTTPS for AI requests. It is not stored by the app, and reloading or closing the tab clears it. Source files are relayed to the chosen AI provider for review. Do not configure `GEMINI_API_KEY` or `GROQ_API_KEY` as public service secrets. Render's free service may sleep when idle and take extra time to start.

The default models are `gemini-3.8-flash` for Gemini and `openai/gpt-oss-20b` for GroqCloud. For Groq, `openai/` identifies the model publisher/namespace; requests are still sent to GroqCloud using your Groq API key. The UI labels this explicitly as “GroqCloud · GPT-OSS 20B (OpenAI model).” Set `$env:GEMINI_MODEL` or `$env:GROQ_MODEL` before launch to override them. The server uses the selected provider's API and does not save uploaded source files. Gemini requests set `store: false`.

## Important limitations

Uploaded code is sent to the selected provider (Google or Groq) for analysis. Review that provider's privacy and free-tier policies, and do not upload code you are not allowed to share with it. Free tiers have rate limits and may be temporarily unavailable. AI findings and patches can be incomplete or incorrect; this app is not a substitute for compilers, tests, dependency auditing, or security review. Review and test every suggested change. The app does not execute uploaded code.
