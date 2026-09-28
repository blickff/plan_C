/* The only bridge between the pages and Electron.

   contextIsolation is on and nodeIntegration is off, so the page cannot
   reach Node itself. It gets exactly these few calls and nothing more —
   a page that only tracks habits has no business touching the file
   system, and keeping the surface this small means a mistake in the
   page cannot become a mistake on the machine. */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  openPanel: () => ipcRenderer.invoke('open-panel'),
  toggleOnTop: () => ipcRenderer.invoke('toggle-on-top'),
  toggleAutostart: () => ipcRenderer.invoke('toggle-autostart'),
  getWindowSettings: () => ipcRenderer.invoke('get-window-settings'),
  hideWidget: () => ipcRenderer.invoke('hide-widget'),

  /* One notification, sent by the page when the day is unfinished at
     the hour the person chose. The page decides, because the page is
     the only side that knows what got done. */
  notify: (title, body) => ipcRenderer.invoke('notify', title, body),
  setTrayNote: (text) => ipcRenderer.invoke('tray-note', text),

  /* The vault: the data file in a folder of the person's choosing. */
  vault: {
    info: () => ipcRenderer.invoke('vault-info'),
    read: () => ipcRenderer.invoke('vault-read'),
    write: (text) => ipcRenderer.invoke('vault-write', text),
    stash: (text) => ipcRenderer.invoke('vault-stash', text),
    pick: () => ipcRenderer.invoke('vault-pick'),
    forget: () => ipcRenderer.invoke('vault-forget'),
    reveal: () => ipcRenderer.invoke('vault-reveal')
  }
});
