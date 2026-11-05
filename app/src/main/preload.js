// Bridge between pages and the main process. Only the channels listed here are reachable.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const INVOKE = new Set([
  'app:info', 'app:changelog', 'app:open-data-folder', 'service:print',
  'settings:get', 'settings:set', 'displays:list', 'windows:state',
  'songs:search', 'songs:get', 'songs:linked', 'songs:save', 'songs:delete', 'songs:folders',
  'themes:list', 'themes:save', 'themes:delete',
  'media:list', 'media:import', 'media:delete', 'media:add-paths',
  'service:autosave', 'service:load-autosave', 'services:list', 'services:save', 'services:get', 'services:delete',
  'packs:list', 'packs:import', 'packs:export',
  'import:pick', 'import:parse', 'import:commit',
  'updates:status', 'updates:check', 'updates:download-app', 'updates:apply-app', 'updates:cancel',
  'updates:install-pack', 'updates:rollback',
  'ai:status', 'ai:background', 'ai:find-songs', 'ai:find-readings', 'ai:plan-service', 'ai:notes-to-slides',
  'decks:list', 'decks:import', 'decks:slides', 'decks:delete', 'decks:refresh',
  'web:open', 'web:close', 'web:navigate', 'web:back', 'web:forward', 'web:reload', 'web:state', 'web:show', 'web:hide', 'web:audience',
  'bible:list', 'bible:structure', 'bible:chapter', 'bible:passage', 'bible:search', 'bible:remove', 'bible:pick', 'bible:install-pending',
]);
const EVENTS = new Set(['output:render', 'windows:state', 'updates:progress', 'updates:outcome', 'updates:auto', 'content:changed', 'web:state', 'web:error', 'decks:progress']);

contextBridge.exposeInMainWorld('rg', {
  invoke(channel, ...args) {
    if (!INVOKE.has(channel)) throw new Error(`Blocked IPC channel: ${channel}`);
    return ipcRenderer.invoke(channel, ...args);
  },
  on(channel, cb) {
    if (!EVENTS.has(channel)) throw new Error(`Blocked IPC event: ${channel}`);
    const fn = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  },
  sendOutput(payload) {
    ipcRenderer.send('output:send', payload);
  },
});

/*
 * Where a dropped file actually is on disk.
 *
 * Electron took File.path away from renderers, and a File object alone is useless to the main
 * process — it cannot copy what it cannot find. webUtils.getPathForFile is the supported way
 * to ask, and it lives here, in the preload, rather than giving the page any wider reach.
 */
contextBridge.exposeInMainWorld('rgFilePath', (file) => {
  try {
    return webUtils.getPathForFile(file);
  } catch (_) {
    return '';
  }
});
