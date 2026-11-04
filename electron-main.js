const { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createServer } = require("./server");

let server;
let serverUrl;
let mainWindow;
const settingsPath = () => path.join(app.getPath("userData"), "settings.json");

async function readSavedApiSettings() {
  try {
    const settings = JSON.parse(await fs.readFile(settingsPath(), "utf8"));
    if (typeof settings.encryptedApiKey !== "string") return null;
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Windows secure storage is unavailable. Your saved API key cannot be safely read.");
    }
    return {
      provider: settings.provider === "groq" ? "groq" : "gemini",
      apiKey: safeStorage.decryptString(Buffer.from(settings.encryptedApiKey, "base64")),
    };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function verifyTrustedSender(event) {
  if (!serverUrl || !event.senderFrame?.url.startsWith(serverUrl)) {
    throw new Error("Settings are only available to the PatchPilot desktop window.");
  }
}

ipcMain.handle("settings:status", (event) => {
  verifyTrustedSender(event);
  return {
    configured: Boolean(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY),
    provider: process.env.PATCHPILOT_PROVIDER || (process.env.GROQ_API_KEY ? "groq" : "gemini"),
  };
});

ipcMain.handle("settings:save-key", async (event, settings) => {
  verifyTrustedSender(event);
  if (!settings || !["gemini", "groq"].includes(settings.provider)) {
    throw new Error("Choose Gemini or Groq for this API key.");
  }
  if (typeof settings.apiKey !== "string" || settings.apiKey.trim().length < 10 || settings.apiKey.trim().length > 512) {
    throw new Error("Enter a valid API key for the selected provider.");
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Windows secure storage is unavailable, so the API key cannot be saved safely.");
  }
  const apiKey = settings.apiKey.trim();
  const encryptedApiKey = safeStorage.encryptString(apiKey).toString("base64");
  const pathToSettings = settingsPath();
  await fs.mkdir(path.dirname(pathToSettings), { recursive: true });
  const temporaryPath = `${pathToSettings}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify({ provider: settings.provider, encryptedApiKey }), { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporaryPath, pathToSettings);
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  process.env[settings.provider === "groq" ? "GROQ_API_KEY" : "GEMINI_API_KEY"] = apiKey;
  process.env.PATCHPILOT_PROVIDER = settings.provider;
  return { configured: true, provider: settings.provider };
});

ipcMain.handle("settings:clear-key", async (event) => {
  verifyTrustedSender(event);
  try {
    await fs.unlink(settingsPath());
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.PATCHPILOT_PROVIDER;
  return { configured: false, provider: "gemini" };
});

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 760,
    minHeight: 640,
    title: "PatchPilot",
    backgroundColor: "#101216",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (!targetUrl.startsWith(serverUrl)) event.preventDefault();
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  await mainWindow.loadURL(serverUrl);
}

app.whenReady().then(async () => {
  try {
    Menu.setApplicationMenu(null);
    const savedSettings = await readSavedApiSettings();
    if (savedSettings) {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GROQ_API_KEY;
      process.env[savedSettings.provider === "groq" ? "GROQ_API_KEY" : "GEMINI_API_KEY"] = savedSettings.apiKey;
      process.env.PATCHPILOT_PROVIDER = savedSettings.provider;
    }
    server = createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    serverUrl = `http://127.0.0.1:${server.address().port}`;
    await createMainWindow();
  } catch (error) {
    console.error("Could not start PatchPilot:", error);
    dialog.showErrorBox("PatchPilot could not start", error.message);
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverUrl) createMainWindow();
});

app.on("before-quit", () => {
  if (server?.listening) server.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
