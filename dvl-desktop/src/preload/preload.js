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
  deleteSecret: (name) => ipcRenderer.invoke('dvl:delete-secret', name),
  getReadContext: () => ipcRenderer.invoke('dvl:reader:context'),
  listDirectory: request => ipcRenderer.invoke('dvl:reader:listDirectory', request),
  readTextFile: request => ipcRenderer.invoke('dvl:reader:readTextFile', request),
  searchText: request => ipcRenderer.invoke('dvl:reader:searchText', request),
  cancelRead: request => ipcRenderer.invoke('dvl:reader:cancel', request),
  onReaderState: callback => {
    if (typeof callback !== 'function') throw new TypeError('Callback required');
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('dvl:reader:state', listener);
    return () => ipcRenderer.removeListener('dvl:reader:state', listener);
  }
});
