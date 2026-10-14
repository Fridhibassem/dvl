const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dvl', {
  openProject: () => ipcRenderer.invoke('dvl:open-project'),
  getLastProject: () => ipcRenderer.invoke('dvl:get-last-project'),
  listRecentProjects: () => ipcRenderer.invoke('dvl:list-recent-projects'),
  openRecentProject: (projectId) =>
    ipcRenderer.invoke('dvl:open-recent-project', projectId),
  setSetting: (name, value) => ipcRenderer.invoke('dvl:set-setting', name, value),
  getSetting: (name) => ipcRenderer.invoke('dvl:get-setting', name),
  setSecret: (name, value) => ipcRenderer.invoke('dvl:set-secret', name, value),
  hasSecret: (name) => ipcRenderer.invoke('dvl:has-secret', name),
  deleteSecret: (name) => ipcRenderer.invoke('dvl:delete-secret', name)
});
