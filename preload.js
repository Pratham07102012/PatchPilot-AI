const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("patchPilot", {
  getKeyStatus: () => ipcRenderer.invoke("settings:status"),
  saveApiKey: (settings) => ipcRenderer.invoke("settings:save-key", settings),
  clearApiKey: () => ipcRenderer.invoke("settings:clear-key"),
});
