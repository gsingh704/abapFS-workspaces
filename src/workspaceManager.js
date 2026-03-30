const path = require('path');
const { homedir } = require('os');
const vscode = require('vscode');
const { renderWorkspaceManagerView } = require('./view/workspaceManagerView');

const EXTENSION_PREFIX = 'abapFS-workspaces';
const CONFIG_ROOT = 'abapFsWorkspaces';
const WORKSPACE_MANAGER_KEY = 'manager';
const LEGACY_CONFIG_ROOT = 'abapfs';
const LEGACY_WORKSPACE_MANAGER_KEY = 'workspaceManager';
const ABAP_CONFIG_ROOT = 'abapfs';
const ABAP_REMOTE_KEY = 'remote';
const INVALID_WORKSPACE_NAME = /[<>:"/\\|?*]/;

const formatKey = raw => String(raw || '').toLowerCase();

const normalizeFsPath = value => path.normalize(String(value || '').trim());

const normalizePathList = value => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const folders = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }

    const normalized = normalizeFsPath(entry);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    folders.push(normalized);
  }

  return folders;
};

const normalizeWorkspaceSettings = value => {
  const source = value && typeof value === 'object' ? value : {};
  const sourceConnections = source.connections && typeof source.connections === 'object'
    ? source.connections
    : {};

  const connections = Object.entries(sourceConnections).reduce((result, [connectionId, connectionValue]) => {
    const normalizedName = typeof connectionValue?.workspaceName === 'string'
      ? connectionValue.workspaceName.trim()
      : '';

    result[connectionId] = {
      workspaceName: normalizedName || undefined,
      folders: normalizePathList(connectionValue?.folders)
    };

    return result;
  }, {});

  return {
    storagePath: typeof source.storagePath === 'string' && source.storagePath.trim()
      ? normalizeFsPath(source.storagePath)
      : '',
    globalFolders: normalizePathList(source.globalFolders),
    connections
  };
};

const isSettingsEmpty = settings => {
  const normalized = normalizeWorkspaceSettings(settings);
  return !normalized.storagePath
    && normalized.globalFolders.length === 0
    && Object.keys(normalized.connections).length === 0;
};

const getWorkspaceManagerSettings = () => {
  const config = vscode.workspace.getConfiguration(CONFIG_ROOT);
  const current = normalizeWorkspaceSettings(config.get(WORKSPACE_MANAGER_KEY));
  if (!isSettingsEmpty(current)) {
    return current;
  }

  const legacyConfig = vscode.workspace.getConfiguration(LEGACY_CONFIG_ROOT);
  return normalizeWorkspaceSettings(legacyConfig.get(LEGACY_WORKSPACE_MANAGER_KEY));
};

const getAvailableConnections = () => {
  const config = vscode.workspace.getConfiguration(ABAP_CONFIG_ROOT);
  const inspect = config.inspect(ABAP_REMOTE_KEY);
  const connections = [];
  const seen = new Set();

  const addConnections = (remotes, target) => {
    for (const [id, remote] of Object.entries(remotes || {})) {
      const key = formatKey(id);
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      connections.push({ id, remote, target });
    }
  };

  addConnections(inspect?.globalValue, 'user');
  addConnections(inspect?.workspaceValue, 'workspace');
  addConnections(inspect?.workspaceFolderValue, 'workspace');
  addConnections(config.get(ABAP_REMOTE_KEY), 'workspace');

  return connections.sort((left, right) => left.id.localeCompare(right.id));
};

const getWorkspaceName = (connectionId, settings) =>
  settings.connections?.[connectionId]?.workspaceName?.trim() || connectionId;

const getWorkspaceFilePath = (connectionId, settings) => {
  const storagePath = settings.storagePath?.trim();
  if (!storagePath) {
    return '';
  }

  return path.join(storagePath, `${getWorkspaceName(connectionId, settings)}.code-workspace`);
};

const pathExists = async fsPath => {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(fsPath));
    return true;
  } catch {
    return false;
  }
};

const validateDirectoryPath = async (folderPath, label) => {
  if (!path.isAbsolute(folderPath)) {
    return `${label} must be an absolute path`;
  }

  try {
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(folderPath));
    if ((stat.type & vscode.FileType.Directory) === 0) {
      return `${label} must point to a folder`;
    }
  } catch {
    return `${label} does not exist`;
  }

  return undefined;
};

const validateWorkspaceManagerState = async (settings, connections) => {
  const errors = [];
  const storagePath = settings.storagePath?.trim();

  if (!storagePath) {
    errors.push('Save location is required');
  } else if (!path.isAbsolute(storagePath)) {
    errors.push('Save location must be an absolute path');
  }

  for (const [index, folder] of (settings.globalFolders || []).entries()) {
    const error = await validateDirectoryPath(folder, `Global folder ${index + 1}`);
    if (error) {
      errors.push(error);
    }
  }

  const usedNames = new Map();
  for (const connection of connections) {
    if (connection.target !== 'user') {
      errors.push(
        `Connection ${connection.id} is stored in workspace settings. Move it to user settings before generating a standalone workspace.`
      );
      continue;
    }

    const workspaceName = getWorkspaceName(connection.id, settings);
    if (!workspaceName.trim()) {
      errors.push(`Workspace name is required for ${connection.id}`);
      continue;
    }

    if (INVALID_WORKSPACE_NAME.test(workspaceName)) {
      errors.push(`Workspace name for ${connection.id} contains invalid Windows filename characters`);
    }

    const key = workspaceName.toLowerCase();
    const duplicate = usedNames.get(key);
    if (duplicate) {
      errors.push(`Workspace names must be unique. ${duplicate} and ${connection.id} collide`);
    } else {
      usedNames.set(key, connection.id);
    }

    const folders = settings.connections?.[connection.id]?.folders || [];
    for (const [index, folder] of folders.entries()) {
      const error = await validateDirectoryPath(folder, `${connection.id} folder ${index + 1}`);
      if (error) {
        errors.push(error);
      }
    }
  }

  return errors;
};

const buildWorkspacePayload = (connection, settings) => {
  const globalFolders = settings.globalFolders || [];
  const connectionFolders = settings.connections?.[connection.id]?.folders || [];
  const localFolders = [...globalFolders, ...connectionFolders];
  const seen = new Set();

  return {
    folders: [
      {
        name: `${connection.id}(ABAP)`,
        uri: `adt://${formatKey(connection.id)}`
      },
      ...localFolders.reduce((result, folder) => {
        const key = folder.toLowerCase();
        if (seen.has(key)) {
          return result;
        }

        seen.add(key);
        result.push({ path: folder });
        return result;
      }, [])
    ]
  };
};

const writeWorkspaceFile = async (connection, settings) => {
  const filePath = getWorkspaceFilePath(connection.id, settings);
  const storagePath = settings.storagePath || '';
  if (!filePath || !storagePath) {
    throw new Error(`No workspace save location configured for ${connection.id}`);
  }

  await vscode.workspace.fs.createDirectory(vscode.Uri.file(storagePath));
  const payload = buildWorkspacePayload(connection, settings);
  const json = JSON.stringify(payload, null, 2);
  await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(json, 'utf8'));
  return filePath;
};

const createWorkspaceFiles = async settings => {
  const connections = getAvailableConnections();
  const errors = await validateWorkspaceManagerState(settings, connections);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  const createdFiles = [];
  for (const connection of connections) {
    createdFiles.push(await writeWorkspaceFile(connection, settings));
  }

  return createdFiles;
};

const buildViewState = async (settings = getWorkspaceManagerSettings()) => {
  const connections = getAvailableConnections();
  const resolvedConnections = [];
  const currentWorkspaceFile = vscode.workspace.workspaceFile?.fsPath || '';
  const normalizedCurrentWorkspaceFile = currentWorkspaceFile
    ? path.normalize(currentWorkspaceFile).toLowerCase()
    : '';

  for (const connection of connections) {
    const filePath = getWorkspaceFilePath(connection.id, settings);
    const normalizedFilePath = filePath ? path.normalize(filePath).toLowerCase() : '';
    resolvedConnections.push({
      id: connection.id,
      client: connection.remote?.client || '',
      target: connection.target,
      url: connection.remote?.url || '',
      workspaceName: getWorkspaceName(connection.id, settings),
      folders: settings.connections?.[connection.id]?.folders || [],
      filePath,
      exists: filePath ? await pathExists(filePath) : false,
      isCurrentWorkspace: !!normalizedCurrentWorkspaceFile && normalizedCurrentWorkspaceFile === normalizedFilePath
    });
  }

  return {
    storagePath: settings.storagePath || '',
    globalFolders: settings.globalFolders || [],
    connections: resolvedConnections
  };
};

class WorkspaceListItem extends vscode.TreeItem {
  constructor(connection) {
    super(connection.workspaceName || connection.id, vscode.TreeItemCollapsibleState.None);
    this.connectionId = connection.id;
    this.description = connection.exists
      ? `${connection.client || ''}${connection.isCurrentWorkspace ? ' • current' : ''}`
      : 'not generated';
    this.tooltip = `${connection.id}\n${connection.filePath || 'No workspace file path configured'}`;
    this.contextValue = 'workspaceConnection';
    this.iconPath = connection.exists
      ? new vscode.ThemeIcon(connection.isCurrentWorkspace ? 'folder-active' : 'folder-opened')
      : new vscode.ThemeIcon('warning');
    this.command = {
      command: `${EXTENSION_PREFIX}.openConnectionWorkspace`,
      title: 'Open Connection Workspace',
      arguments: [connection.id]
    };
  }
}

class WorkspaceListProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.disposables = [
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration(CONFIG_ROOT) || event.affectsConfiguration(ABAP_CONFIG_ROOT)) {
          this.refresh();
        }
      })
    ];
  }

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  async getChildren(element) {
    if (element) {
      return [];
    }

    const state = await buildViewState();
    return state.connections.map(connection => new WorkspaceListItem(connection));
  }

  getTreeItem(element) {
    return element;
  }

  dispose() {
    this._onDidChangeTreeData.dispose();
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }
}

const updateWorkspaceManagerSettings = async settings => {
  const normalized = normalizeWorkspaceSettings(settings);
  await vscode.workspace
    .getConfiguration(CONFIG_ROOT)
    .update(WORKSPACE_MANAGER_KEY, normalized, vscode.ConfigurationTarget.Global);
  return normalized;
};

const openWorkspaceUri = async (workspaceUri, forceNewWindow = false) => {
  await vscode.commands.executeCommand('vscode.openFolder', workspaceUri, forceNewWindow);
};

const ensureWorkspaceFile = async connectionId => {
  const settings = getWorkspaceManagerSettings();
  if (!settings.storagePath) {
    throw new Error('Workspace save location is not configured');
  }

  const connection = getAvailableConnections().find(entry => entry.id === connectionId);
  if (!connection) {
    throw new Error(`Connection ${connectionId} was not found`);
  }

  const errors = await validateWorkspaceManagerState(settings, [connection]);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  const filePath = await writeWorkspaceFile(connection, settings);
  return vscode.Uri.file(filePath);
};

const defaultLocalFolderUri = () =>
  vscode.workspace.workspaceFolders?.find(folder => folder.uri.scheme === 'file')?.uri
  || vscode.Uri.file(homedir());

class WorkspaceManagerPanel {
  static currentPanel;

  constructor(panel, focusConnectionId) {
    this.panel = panel;
    this.disposables = [];
    this.pendingFocusConnectionId = focusConnectionId;
    this.statusMessage = undefined;

    void this.update();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(message => this.handleMessage(message), null, this.disposables);
  }

  static createOrShow(options = {}) {
    const column = vscode.ViewColumn.One;
    if (WorkspaceManagerPanel.currentPanel) {
      WorkspaceManagerPanel.currentPanel.panel.reveal(column);
      WorkspaceManagerPanel.currentPanel.pendingFocusConnectionId = options.focusConnectionId;
      void WorkspaceManagerPanel.currentPanel.update();
      return WorkspaceManagerPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel('workspaceManager', 'Workspace Manager', column, {
      enableScripts: true,
      retainContextWhenHidden: false
    });

    WorkspaceManagerPanel.currentPanel = new WorkspaceManagerPanel(panel, options.focusConnectionId);
    return WorkspaceManagerPanel.currentPanel;
  }

  async handleMessage(message) {
    switch (message.type) {
      case 'refresh':
        await this.update();
        break;
      case 'pickStoragePath':
        await this.pickStoragePath(message.currentPath);
        break;
      case 'pickGlobalFolder':
        await this.pickGlobalFolder();
        break;
      case 'pickConnectionFolder':
        await this.pickConnectionFolder(message.connectionId);
        break;
      case 'saveSettings':
        await this.saveSettings(message.state);
        break;
      case 'openWorkspace':
        await this.openWorkspace(message.connectionId);
        break;
      default:
        break;
    }
  }

  postMessage(message) {
    void this.panel.webview.postMessage(message);
  }

  async pickFolder(title, currentPath) {
    const defaultUri = currentPath?.trim()
      ? vscode.Uri.file(path.isAbsolute(currentPath) ? currentPath : path.resolve(currentPath))
      : defaultLocalFolderUri();

    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select Folder',
      title,
      defaultUri
    });

    const selected = picked?.[0];
    if (!selected) {
      return undefined;
    }

    if (selected.scheme !== 'file') {
      await vscode.window.showErrorMessage('Select a local folder. Remote ABAP folders are not supported here.');
      return undefined;
    }

    return selected.fsPath;
  }

  async pickStoragePath(currentPath) {
    const folderPath = await this.pickFolder('Select workspace output folder', currentPath);
    if (!folderPath) {
      return;
    }

    this.postMessage({ type: 'pickedStoragePath', path: folderPath });
  }

  async pickGlobalFolder() {
    const folderPath = await this.pickFolder('Select global folder');
    if (!folderPath) {
      return;
    }

    this.postMessage({ type: 'pickedGlobalFolder', path: folderPath });
  }

  async pickConnectionFolder(connectionId) {
    if (!connectionId) {
      return;
    }

    const folderPath = await this.pickFolder(`Select folder for ${connectionId}`);
    if (!folderPath) {
      return;
    }

    this.postMessage({ type: 'pickedConnectionFolder', connectionId, path: folderPath });
  }

  async saveSettings(state) {
    const normalized = normalizeWorkspaceSettings(state);
    try {
      const savedSettings = await updateWorkspaceManagerSettings(normalized);
      const createdFiles = await createWorkspaceFiles(savedSettings);
      this.statusMessage = {
        type: 'success',
        text: `Saved workspace manager settings and generated ${createdFiles.length} workspace file(s)`
      };
      await this.update(savedSettings);
    } catch (error) {
      console.error(`[${EXTENSION_PREFIX}] Error saving workspace manager settings`, error);
      this.statusMessage = { type: 'error', text: `${error}` };
      await this.update(normalized);
    }
  }

  async openWorkspace(connectionId) {
    try {
      const workspaceUri = await ensureWorkspaceFile(connectionId);
      await openWorkspaceUri(workspaceUri);
    } catch (error) {
      this.statusMessage = { type: 'error', text: `${error}` };
      this.pendingFocusConnectionId = connectionId;
      await this.update();
    }
  }

  async update(settings) {
    const state = await buildViewState(settings);
    this.panel.webview.html = renderWorkspaceManagerView(
      this.panel.webview,
      state,
      this.statusMessage,
      this.pendingFocusConnectionId
    );
    this.pendingFocusConnectionId = undefined;
  }

  dispose() {
    WorkspaceManagerPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }
}

let workspaceListProvider;

const createWorkspaceListProvider = () => {
  if (!workspaceListProvider) {
    workspaceListProvider = new WorkspaceListProvider();
  }

  return workspaceListProvider;
};

const extractConnectionId = item => {
  if (typeof item === 'string') {
    return item;
  }

  if (typeof item?.connectionId === 'string' && item.connectionId.trim()) {
    return item.connectionId;
  }

  return item?.connectionItem?.connection?.name
    || item?.connection?.name
    || (typeof item?.label === 'string' ? item.label : '')
    || item?.name
    || '';
};

const openWorkspaceManager = async (options = {}) => {
  try {
    WorkspaceManagerPanel.createOrShow(options);
  } catch (error) {
    console.error(`[${EXTENSION_PREFIX}] Failed to open workspace manager`, error);
    await vscode.window.showErrorMessage(`Failed to open workspace manager: ${error}`);
  }
};

const openConnectionWorkspace = async (item, options = {}) => {
  const connectionId = extractConnectionId(item);
  if (!connectionId) {
    await openWorkspaceManager(options);
    return;
  }

  try {
    const workspaceUri = await ensureWorkspaceFile(connectionId);
    await openWorkspaceUri(workspaceUri);
    createWorkspaceListProvider().refresh();
  } catch (error) {
    console.error(`[${EXTENSION_PREFIX}] Failed to open workspace for ${connectionId}`, error);
    WorkspaceManagerPanel.createOrShow({
      focusConnectionId: options.focusConnectionId || connectionId
    });
    await vscode.window.showWarningMessage(`${error}`);
  }
};

const openConnectionWorkspaceInNewWindow = async (item, options = {}) => {
  const connectionId = extractConnectionId(item);
  if (!connectionId) {
    await openWorkspaceManager(options);
    return;
  }

  try {
    const workspaceUri = await ensureWorkspaceFile(connectionId);
    await openWorkspaceUri(workspaceUri, true);
    createWorkspaceListProvider().refresh();
  } catch (error) {
    console.error(`[${EXTENSION_PREFIX}] Failed to open workspace in new window for ${connectionId}`, error);
    WorkspaceManagerPanel.createOrShow({
      focusConnectionId: options.focusConnectionId || connectionId
    });
    await vscode.window.showWarningMessage(`${error}`);
  }
};

const editConnectionWorkspaceFile = async (item, options = {}) => {
  const connectionId = extractConnectionId(item);
  if (!connectionId) {
    await openWorkspaceManager(options);
    return;
  }

  try {
    const workspaceUri = await ensureWorkspaceFile(connectionId);
    const document = await vscode.workspace.openTextDocument(workspaceUri);
    await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
    createWorkspaceListProvider().refresh();
  } catch (error) {
    console.error(`[${EXTENSION_PREFIX}] Failed to edit workspace file for ${connectionId}`, error);
    WorkspaceManagerPanel.createOrShow({
      focusConnectionId: options.focusConnectionId || connectionId
    });
    await vscode.window.showWarningMessage(`${error}`);
  }
};

module.exports = {
  createWorkspaceListProvider,
  openWorkspaceManager,
  openConnectionWorkspace,
  openConnectionWorkspaceInNewWindow,
  editConnectionWorkspaceFile
};