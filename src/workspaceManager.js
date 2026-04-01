const path = require('path');
const { homedir } = require('os');
const vscode = require('vscode');

const EXTENSION_PREFIX = 'abapFS-workspaces';
const CONFIG_ROOT = 'abapFsWorkspaces';
const WORKSPACE_MANAGER_KEY = 'manager';
const LEGACY_CONFIG_ROOT = 'abapfs';
const LEGACY_WORKSPACE_MANAGER_KEY = 'workspaceManager';
const ABAP_CONFIG_ROOT = 'abapfs';
const ABAP_REMOTE_KEY = 'remote';
const INVALID_WORKSPACE_NAME = /[<>:"/\\|?*]/;
const CUSTOM_WORKSPACE_ID_PREFIX = 'workspace';

const formatKey = raw => String(raw || '').toLowerCase();
const normalizeFsPath = value => path.normalize(String(value || '').trim());

let workspaceListProvider;
let workspaceManagerProvider;
let workspaceManagerTreeView;

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

const normalizeConnectionIdList = value => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const connectionIds = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }

    const connectionId = entry.trim();
    const key = formatKey(connectionId);
    if (!connectionId || seen.has(key)) {
      continue;
    }

    seen.add(key);
    connectionIds.push(connectionId);
  }

  return connectionIds;
};

const createUniqueWorkspaceId = (rawValue, usedIds, fallbackIndex) => {
  const normalizedBase = String(rawValue || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const base = normalizedBase || `${CUSTOM_WORKSPACE_ID_PREFIX}-${fallbackIndex}`;
  let candidate = base;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
};

const normalizeCustomWorkspaces = value => {
  if (!Array.isArray(value)) {
    return [];
  }

  const usedIds = new Set();
  return value.reduce((result, entry, index) => {
    const workspaceName = typeof entry?.workspaceName === 'string'
      ? entry.workspaceName.trim()
      : '';
    const connectionIds = normalizeConnectionIdList(entry?.connectionIds);

    result.push({
      id: createUniqueWorkspaceId(
        typeof entry?.id === 'string' ? entry.id : workspaceName || connectionIds[0],
        usedIds,
        index + 1
      ),
      workspaceName,
      connectionIds,
      folders: normalizePathList(entry?.folders)
    });

    return result;
  }, []);
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
    connections,
    workspaces: normalizeCustomWorkspaces(source.workspaces)
  };
};

const cloneWorkspaceSettings = settings => JSON.parse(JSON.stringify(normalizeWorkspaceSettings(settings)));

const isSettingsEmpty = settings => {
  const normalized = normalizeWorkspaceSettings(settings);
  return !normalized.storagePath
    && normalized.globalFolders.length === 0
    && Object.keys(normalized.connections).length === 0
    && normalized.workspaces.length === 0;
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

const getCustomWorkspaceName = workspace => workspace?.workspaceName?.trim() || '';

const getGeneratedWorkspaceFilePath = (workspaceName, settings) => {
  const storagePath = settings.storagePath?.trim();
  if (!storagePath || !workspaceName?.trim()) {
    return '';
  }

  return path.join(storagePath, `${workspaceName}.code-workspace`);
};

const getWorkspaceFilePath = (connectionId, settings) => {
  return getGeneratedWorkspaceFilePath(getWorkspaceName(connectionId, settings), settings);
};

const getCustomWorkspaceFilePath = (workspace, settings) =>
  getGeneratedWorkspaceFilePath(getCustomWorkspaceName(workspace), settings);

const buildConnectionWorkspaceEntry = (connection, settings) => ({
  kind: 'connection',
  id: connection.id,
  workspaceName: getWorkspaceName(connection.id, settings),
  connectionIds: [connection.id],
  folders: settings.connections?.[connection.id]?.folders || [],
  client: connection.remote?.client || '',
  target: connection.target,
  url: connection.remote?.url || ''
});

const buildCustomWorkspaceEntry = (workspace, settings) => ({
  kind: 'workspace',
  id: workspace.id,
  workspaceName: getCustomWorkspaceName(workspace),
  connectionIds: workspace.connectionIds || [],
  folders: workspace.folders || [],
  filePath: getCustomWorkspaceFilePath(workspace, settings)
});

const buildGeneratedWorkspaceEntries = (settings, availableConnections = getAvailableConnections()) => ([
  ...settings.workspaces.map(workspace => buildCustomWorkspaceEntry(workspace, settings)),
  ...availableConnections.map(connection => buildConnectionWorkspaceEntry(connection, settings))
]);

const validateWorkspaceName = (workspaceName, label, errors, usedNames) => {
  if (!workspaceName.trim()) {
    errors.push(`${label} requires a workspace name`);
    return;
  }

  if (INVALID_WORKSPACE_NAME.test(workspaceName)) {
    errors.push(`${label} contains invalid Windows filename characters`);
  }

  const key = workspaceName.toLowerCase();
  const duplicate = usedNames.get(key);
  if (duplicate) {
    errors.push(`Workspace names must be unique. ${duplicate} and ${label} collide`);
    return;
  }

  usedNames.set(key, label);
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
  const connectionLookup = new Map(connections.map(connection => [formatKey(connection.id), connection]));

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
    validateWorkspaceName(workspaceName, connection.id, errors, usedNames);

    const folders = settings.connections?.[connection.id]?.folders || [];
    for (const [index, folder] of folders.entries()) {
      const error = await validateDirectoryPath(folder, `${connection.id} folder ${index + 1}`);
      if (error) {
        errors.push(error);
      }
    }
  }

  for (const workspace of settings.workspaces || []) {
    const workspaceName = getCustomWorkspaceName(workspace);
    const label = `Workspace ${workspaceName || workspace.id}`;
    validateWorkspaceName(workspaceName, label, errors, usedNames);

    if ((workspace.connectionIds || []).length === 0) {
      errors.push(`${label} must include at least one ABAP connection`);
    }

    for (const connectionId of workspace.connectionIds || []) {
      const connection = connectionLookup.get(formatKey(connectionId));
      if (!connection) {
        errors.push(`${label} references unknown connection ${connectionId}`);
        continue;
      }

      if (connection.target !== 'user') {
        errors.push(
          `${label} uses ${connectionId}, which is stored in workspace settings. Move it to user settings before generating a standalone workspace.`
        );
      }
    }

    for (const [index, folder] of (workspace.folders || []).entries()) {
      const error = await validateDirectoryPath(folder, `${label} folder ${index + 1}`);
      if (error) {
        errors.push(error);
      }
    }
  }

  return errors;
};

const buildWorkspacePayload = (workspaceEntry, settings) => {
  const globalFolders = settings.globalFolders || [];
  const localFolders = [...globalFolders, ...(workspaceEntry.folders || [])];
  const seen = new Set();
  const seenConnections = new Set();

  return {
    folders: [
      ...(workspaceEntry.connectionIds || []).reduce((result, connectionId) => {
        const key = formatKey(connectionId);
        if (seenConnections.has(key)) {
          return result;
        }

        seenConnections.add(key);
        result.push({
          name: `${connectionId}(ABAP)`,
          uri: `adt://${key}`
        });
        return result;
      }, []),
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

const writeWorkspaceFile = async (workspaceEntry, settings) => {
  const filePath = getGeneratedWorkspaceFilePath(workspaceEntry.workspaceName, settings);
  const storagePath = settings.storagePath || '';
  if (!filePath || !storagePath) {
    throw new Error(`No workspace save location configured for ${workspaceEntry.workspaceName || workspaceEntry.id}`);
  }

  await vscode.workspace.fs.createDirectory(vscode.Uri.file(storagePath));
  const payload = buildWorkspacePayload(workspaceEntry, settings);
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
  for (const workspaceEntry of buildGeneratedWorkspaceEntries(settings, connections)) {
    createdFiles.push(await writeWorkspaceFile(workspaceEntry, settings));
  }

  return createdFiles;
};

const buildViewState = async (settings = getWorkspaceManagerSettings()) => {
  const connections = getAvailableConnections();
  const resolvedConnections = [];
  const resolvedWorkspaces = [];
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

  for (const workspace of settings.workspaces || []) {
    const filePath = getCustomWorkspaceFilePath(workspace, settings);
    const normalizedFilePath = filePath ? path.normalize(filePath).toLowerCase() : '';
    resolvedWorkspaces.push({
      id: workspace.id,
      workspaceName: getCustomWorkspaceName(workspace),
      connectionIds: workspace.connectionIds || [],
      folders: workspace.folders || [],
      filePath,
      exists: filePath ? await pathExists(filePath) : false,
      isCurrentWorkspace: !!normalizedCurrentWorkspaceFile && normalizedCurrentWorkspaceFile === normalizedFilePath
    });
  }

  return {
    storagePath: settings.storagePath || '',
    globalFolders: settings.globalFolders || [],
    connections: resolvedConnections,
    workspaces: resolvedWorkspaces,
    availableConnections: connections.map(connection => ({
      id: connection.id,
      client: connection.remote?.client || '',
      url: connection.remote?.url || '',
      target: connection.target,
      selectable: connection.target === 'user'
    }))
  };
};

class WorkspaceListItem extends vscode.TreeItem {
  constructor(workspaceEntry) {
    super(workspaceEntry.workspaceName || workspaceEntry.id, vscode.TreeItemCollapsibleState.None);
    this.workspaceKind = workspaceEntry.kind;
    this.connectionId = workspaceEntry.kind === 'connection' ? workspaceEntry.id : undefined;
    this.workspaceId = workspaceEntry.kind === 'workspace' ? workspaceEntry.id : undefined;
    this.description = workspaceEntry.exists
      ? workspaceEntry.kind === 'workspace'
        ? `${workspaceEntry.connectionIds.length} connection(s)${workspaceEntry.isCurrentWorkspace ? ' • current' : ''}`
        : `${workspaceEntry.client || ''}${workspaceEntry.isCurrentWorkspace ? ' • current' : ''}`
      : 'not generated';
    this.tooltip = workspaceEntry.kind === 'workspace'
      ? `${workspaceEntry.connectionIds.join(', ') || 'No connections selected'}\n${workspaceEntry.filePath || 'No workspace file path configured'}`
      : `${workspaceEntry.id}\n${workspaceEntry.filePath || 'No workspace file path configured'}`;
    this.contextValue = 'workspaceConnection';
    this.iconPath = workspaceEntry.exists
      ? new vscode.ThemeIcon(
        workspaceEntry.isCurrentWorkspace
          ? 'folder-active'
          : workspaceEntry.kind === 'workspace'
            ? 'folder-library'
            : 'database'
      )
      : new vscode.ThemeIcon('warning');
    this.command = {
      command: `${EXTENSION_PREFIX}.openConnectionWorkspace`,
      title: 'Open Connection Workspace',
      arguments: [{
        workspaceKind: workspaceEntry.kind,
        connectionId: workspaceEntry.kind === 'connection' ? workspaceEntry.id : undefined,
        workspaceId: workspaceEntry.kind === 'workspace' ? workspaceEntry.id : undefined
      }]
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
    return [
      ...state.workspaces.map(workspace => new WorkspaceListItem({ kind: 'workspace', ...workspace })),
      ...state.connections.map(connection => new WorkspaceListItem({ kind: 'connection', ...connection }))
    ];
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

const createNode = ({
  id,
  label,
  description,
  tooltip,
  contextValue,
  iconPath,
  collapsibleState = vscode.TreeItemCollapsibleState.None,
  command,
  nodeType,
  ...data
}) => ({
  id,
  label,
  description,
  tooltip,
  contextValue,
  iconPath,
  collapsibleState,
  command,
  nodeType,
  ...data
});

const createPlaceholderNode = (id, label) => createNode({
  id,
  label,
  description: '',
  tooltip: label,
  contextValue: 'managerPlaceholder',
  iconPath: new vscode.ThemeIcon('info'),
  nodeType: 'placeholder'
});

const createWorkspaceFileNode = workspaceEntry => createNode({
  id: `generated-file:${workspaceEntry.kind}:${workspaceEntry.id}`,
  label: `Generated File: ${workspaceEntry.filePath || 'Not configured'}`,
  description: '',
  tooltip: workspaceEntry.filePath || 'Configure a save location to generate this workspace file.',
  contextValue: 'managerGeneratedFile',
  iconPath: new vscode.ThemeIcon(workspaceEntry.exists ? 'file-code' : 'warning'),
  command: {
    command: `${EXTENSION_PREFIX}.openConnectionWorkspace`,
    title: 'Open Generated Workspace',
    arguments: [{
      workspaceKind: workspaceEntry.kind,
      connectionId: workspaceEntry.kind === 'connection' ? workspaceEntry.id : undefined,
      workspaceId: workspaceEntry.kind === 'workspace' ? workspaceEntry.id : undefined
    }]
  },
  nodeType: 'generatedFile',
  workspaceKind: workspaceEntry.kind,
  connectionId: workspaceEntry.kind === 'connection' ? workspaceEntry.id : undefined,
  workspaceId: workspaceEntry.kind === 'workspace' ? workspaceEntry.id : undefined
});

const createFolderNode = ({ scope, ownerId, folderPath }) => createNode({
  id: `folder:${scope}:${ownerId || 'global'}:${folderPath.toLowerCase()}`,
  label: path.basename(folderPath) || folderPath,
  description: folderPath,
  tooltip: folderPath,
  contextValue: scope === 'global'
    ? 'managerGlobalFolder'
    : scope === 'workspace'
      ? 'managerCustomWorkspaceFolder'
      : 'managerConnectionFolder',
  iconPath: new vscode.ThemeIcon('folder'),
  nodeType: 'folder',
  scope,
  ownerId,
  folderPath
});

const createWorkspaceMemberNode = ({ workspaceId, connectionId, state }) => {
  const connection = state.availableConnections.find(entry => formatKey(entry.id) === formatKey(connectionId));
  const details = [connection?.client || '', connection?.url || ''].filter(Boolean).join(' / ');
  return createNode({
    id: `workspace-connection:${workspaceId}:${formatKey(connectionId)}`,
    label: connectionId,
    description: details,
    tooltip: details || connectionId,
    contextValue: 'managerCustomWorkspaceConnection',
    iconPath: new vscode.ThemeIcon('plug'),
    nodeType: 'workspaceConnection',
    workspaceId,
    connectionId
  });
};

const createConnectionNode = connection => createNode({
  id: `connection:${connection.id}`,
  label: connection.id,
  description: [connection.client || '', connection.target === 'user' ? 'user' : 'workspace']
    .filter(Boolean)
    .join(' / '),
  tooltip: `${connection.url || connection.id}\n${connection.filePath || 'No workspace file path configured'}`,
  contextValue: 'managerConnection',
  iconPath: new vscode.ThemeIcon(
    connection.isCurrentWorkspace
      ? 'folder-active'
      : connection.target === 'user'
        ? 'database'
        : 'warning'
  ),
  collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
  nodeType: 'connection',
  connectionId: connection.id
});

const createCustomWorkspaceNode = workspace => createNode({
  id: `workspace:${workspace.id}`,
  label: workspace.workspaceName || workspace.id,
  description: `${workspace.connectionIds.length} connection(s)${workspace.isCurrentWorkspace ? ' • current' : ''}`,
  tooltip: `${workspace.connectionIds.join(', ') || 'No connections selected'}\n${workspace.filePath || 'No workspace file path configured'}`,
  contextValue: 'managerCustomWorkspace',
  iconPath: new vscode.ThemeIcon(workspace.isCurrentWorkspace ? 'folder-active' : 'folder-library'),
  collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
  nodeType: 'workspace',
  workspaceId: workspace.id
});

class WorkspaceManagerProvider {
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
    const state = await buildViewState();
    if (!element) {
      return [
        createNode({
          id: 'manager-storage-path',
          label: 'Save Location',
          description: state.storagePath || 'Not configured',
          tooltip: state.storagePath || 'Select the folder where generated .code-workspace files should be written.',
          contextValue: 'managerStoragePath',
          iconPath: new vscode.ThemeIcon('folder-library'),
          command: {
            command: `${EXTENSION_PREFIX}.selectStoragePath`,
            title: 'Choose Save Location'
          },
          nodeType: 'storagePath'
        }),
        createNode({
          id: 'manager-global-folders',
          label: 'Global Folders',
          description: `${state.globalFolders.length}`,
          tooltip: 'Folders included in every generated workspace.',
          contextValue: 'managerGlobalFoldersRoot',
          iconPath: new vscode.ThemeIcon('folder'),
          collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
          nodeType: 'globalFoldersRoot'
        }),
        createNode({
          id: 'manager-custom-workspaces',
          label: 'Custom Workspaces',
          description: `${state.workspaces.length}`,
          tooltip: 'Grouped workspaces that can include multiple ABAP connections and local folders.',
          contextValue: 'managerCustomWorkspacesRoot',
          iconPath: new vscode.ThemeIcon('folder-library'),
          collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
          nodeType: 'customWorkspacesRoot'
        }),
        createNode({
          id: 'manager-connections',
          label: 'Connections',
          description: `${state.connections.length}`,
          tooltip: 'Per-connection workspace settings derived from abapfs.remote.',
          contextValue: 'managerConnectionsRoot',
          iconPath: new vscode.ThemeIcon('plug'),
          collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
          nodeType: 'connectionsRoot'
        })
      ];
    }

    if (element.nodeType === 'globalFoldersRoot') {
      return state.globalFolders.length > 0
        ? state.globalFolders.map(folderPath => createFolderNode({ scope: 'global', folderPath }))
        : [createPlaceholderNode('placeholder:global-folders', 'No global folders configured')];
    }

    if (element.nodeType === 'customWorkspacesRoot') {
      return state.workspaces.length > 0
        ? state.workspaces.map(createCustomWorkspaceNode)
        : [createPlaceholderNode('placeholder:custom-workspaces', 'No custom workspaces configured')];
    }

    if (element.nodeType === 'connectionsRoot') {
      return state.connections.length > 0
        ? state.connections.map(createConnectionNode)
        : [createPlaceholderNode('placeholder:connections', 'No ABAP FS connections found')];
    }

    if (element.nodeType === 'connection') {
      const connection = state.connections.find(entry => entry.id === element.connectionId);
      if (!connection) {
        return [];
      }

      const children = [
        createNode({
          id: `connection-workspace-name:${connection.id}`,
          label: 'Workspace Name',
          description: connection.workspaceName,
          tooltip: 'Click to change the generated workspace file name for this connection.',
          contextValue: 'managerConnectionWorkspaceName',
          iconPath: new vscode.ThemeIcon('edit'),
          command: {
            command: `${EXTENSION_PREFIX}.editConnectionWorkspaceName`,
            title: 'Edit Workspace Name',
            arguments: [{ connectionId: connection.id }]
          },
          nodeType: 'connectionWorkspaceName',
          connectionId: connection.id
        }),
        createWorkspaceFileNode({ kind: 'connection', ...connection })
      ];

      if (connection.folders.length === 0) {
        children.push(createPlaceholderNode(`placeholder:connection-folders:${connection.id}`, 'No local folders configured'));
      } else {
        children.push(...connection.folders.map(folderPath => createFolderNode({
          scope: 'connection',
          ownerId: connection.id,
          folderPath
        })));
      }

      return children;
    }

    if (element.nodeType === 'workspace') {
      const workspace = state.workspaces.find(entry => entry.id === element.workspaceId);
      if (!workspace) {
        return [];
      }

      const children = [
        createNode({
          id: `custom-workspace-name:${workspace.id}`,
          label: 'Workspace Name',
          description: workspace.workspaceName || 'Not configured',
          tooltip: 'Click to change the grouped workspace file name.',
          contextValue: 'managerCustomWorkspaceName',
          iconPath: new vscode.ThemeIcon('edit'),
          command: {
            command: `${EXTENSION_PREFIX}.editCustomWorkspaceName`,
            title: 'Edit Custom Workspace Name',
            arguments: [{ workspaceId: workspace.id }]
          },
          nodeType: 'customWorkspaceName',
          workspaceId: workspace.id
        }),
        createWorkspaceFileNode({ kind: 'workspace', ...workspace })
      ];

      if (workspace.connectionIds.length === 0) {
        children.push(createPlaceholderNode(`placeholder:workspace-connections:${workspace.id}`, 'No ABAP connections selected'));
      } else {
        children.push(...workspace.connectionIds.map(connectionId => createWorkspaceMemberNode({
          workspaceId: workspace.id,
          connectionId,
          state
        })));
      }

      if (workspace.folders.length === 0) {
        children.push(createPlaceholderNode(`placeholder:workspace-folders:${workspace.id}`, 'No local folders configured'));
      } else {
        children.push(...workspace.folders.map(folderPath => createFolderNode({
          scope: 'workspace',
          ownerId: workspace.id,
          folderPath
        })));
      }

      return children;
    }

    return [];
  }

  getTreeItem(element) {
    const item = new vscode.TreeItem(element.label, element.collapsibleState);
    item.id = element.id;
    item.description = element.description;
    item.tooltip = element.tooltip;
    item.contextValue = element.contextValue;
    item.iconPath = element.iconPath;
    item.command = element.command;
    return item;
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

const refreshViews = () => {
  createWorkspaceListProvider().refresh();
  createWorkspaceManagerProvider().refresh();
};

const persistWorkspaceManagerSettings = async (settings, statusMessage) => {
  const savedSettings = await updateWorkspaceManagerSettings(settings);

  if (statusMessage) {
    void vscode.window.setStatusBarMessage(statusMessage, 3000);
  }

  refreshViews();

  return savedSettings;
};

const withWorkspaceManagerMutation = async (mutator, statusMessage) => {
  const draft = cloneWorkspaceSettings(getWorkspaceManagerSettings());
  const result = await mutator(draft);
  if (result === false) {
    return undefined;
  }

  return persistWorkspaceManagerSettings(draft, statusMessage);
};

const openWorkspaceUri = async (workspaceUri, forceNewWindow = false) => {
  await vscode.commands.executeCommand('vscode.openFolder', workspaceUri, forceNewWindow);
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

const extractWorkspaceId = item => {
  if (typeof item?.workspaceId === 'string' && item.workspaceId.trim()) {
    return item.workspaceId;
  }

  return '';
};

const resolveWorkspaceRequest = item => {
  if (typeof item === 'string' && item.trim()) {
    return { kind: 'connection', id: item.trim() };
  }

  if (typeof item?.workspaceKind === 'string') {
    if (item.workspaceKind === 'workspace' && typeof item?.workspaceId === 'string' && item.workspaceId.trim()) {
      return { kind: 'workspace', id: item.workspaceId.trim() };
    }

    if (item.workspaceKind === 'connection' && typeof item?.connectionId === 'string' && item.connectionId.trim()) {
      return { kind: 'connection', id: item.connectionId.trim() };
    }
  }

  const workspaceId = extractWorkspaceId(item);
  if (workspaceId) {
    return { kind: 'workspace', id: workspaceId };
  }

  const connectionId = extractConnectionId(item);
  if (!connectionId) {
    return undefined;
  }

  return { kind: 'connection', id: connectionId };
};

const ensureWorkspaceFile = async request => {
  const settings = getWorkspaceManagerSettings();
  if (!settings.storagePath) {
    throw new Error('Workspace save location is not configured');
  }

  const connections = getAvailableConnections();
  const generatedEntries = buildGeneratedWorkspaceEntries(settings, connections);
  const workspaceEntry = generatedEntries.find(entry => entry.kind === request.kind && entry.id === request.id);
  if (!workspaceEntry) {
    throw new Error(
      request.kind === 'workspace'
        ? `Workspace ${request.id} was not found`
        : `Connection ${request.id} was not found`
    );
  }

  const errors = await validateWorkspaceManagerState(settings, connections);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  const filePath = await writeWorkspaceFile(workspaceEntry, settings);
  return vscode.Uri.file(filePath);
};

const defaultLocalFolderUri = () =>
  vscode.workspace.workspaceFolders?.find(folder => folder.uri.scheme === 'file')?.uri
  || vscode.Uri.file(homedir());

const pickFolder = async (title, currentPath) => {
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
};

const promptWorkspaceName = async ({ title, value = '', allowEmpty = false, prompt }) => {
  return vscode.window.showInputBox({
    title,
    prompt,
    value,
    ignoreFocusOut: true,
    validateInput: input => {
      const trimmed = input.trim();
      if (!allowEmpty && !trimmed) {
        return 'Workspace name is required.';
      }

      if (trimmed && INVALID_WORKSPACE_NAME.test(trimmed)) {
        return 'Workspace names cannot contain Windows-invalid filename characters.';
      }

      return undefined;
    }
  });
};

const showConnectionQuickPick = async (selectedConnectionIds = []) => {
  const selected = new Set(selectedConnectionIds.map(connectionId => formatKey(connectionId)));
  const items = getAvailableConnections()
    .filter(connection => connection.target === 'user' && !selected.has(formatKey(connection.id)))
    .map(connection => ({
      label: connection.id,
      description: [connection.remote?.client || '', connection.remote?.url || ''].filter(Boolean).join(' / ')
    }));

  if (items.length === 0) {
    await vscode.window.showInformationMessage('No additional user-scoped ABAP FS connections are available.');
    return undefined;
  }

  return vscode.window.showQuickPick(items, {
    title: 'Add ABAP connection',
    placeHolder: 'Select a connection to include in the grouped workspace',
    ignoreFocusOut: true
  });
};

const createWorkspaceListProvider = () => {
  if (!workspaceListProvider) {
    workspaceListProvider = new WorkspaceListProvider();
  }

  return workspaceListProvider;
};

const createWorkspaceManagerProvider = () => {
  if (!workspaceManagerProvider) {
    workspaceManagerProvider = new WorkspaceManagerProvider();
  }

  return workspaceManagerProvider;
};

const registerWorkspaceManagerTreeView = treeView => {
  workspaceManagerTreeView = treeView;
};

const focusManagerView = async () => {
  try {
    await vscode.commands.executeCommand('workbench.view.extension.abapFsWorkspaces');
  } catch {
    // Ignore if the container command is unavailable and fall back to the view focus command.
  }

  try {
    await vscode.commands.executeCommand('abapFsWorkspaces.workspaceManager.focus');
  } catch {
    if (workspaceManagerTreeView) {
      workspaceManagerTreeView.show?.(true);
    }
  }
};

const openWorkspaceManager = async () => {
  try {
    await focusManagerView();
    refreshViews();
  } catch (error) {
    console.error(`[${EXTENSION_PREFIX}] Failed to focus workspace manager`, error);
    await vscode.window.showErrorMessage(`Failed to focus workspace manager: ${error}`);
  }
};

const refreshWorkspaceViews = async () => {
  refreshViews();
};

const generateWorkspaceFilesCommand = async () => {
  try {
    const settings = getWorkspaceManagerSettings();
    const createdFiles = await createWorkspaceFiles(settings);
    refreshViews();
    void vscode.window.setStatusBarMessage(`Generated ${createdFiles.length} workspace file(s)`, 4000);
  } catch (error) {
    console.error(`[${EXTENSION_PREFIX}] Failed to generate workspace files`, error);
    await vscode.window.showWarningMessage(`${error}`);
  }
};

const selectStoragePath = async () => {
  const currentSettings = getWorkspaceManagerSettings();
  const folderPath = await pickFolder('Select workspace output folder', currentSettings.storagePath);
  if (!folderPath) {
    return;
  }

  await withWorkspaceManagerMutation(settings => {
    settings.storagePath = normalizeFsPath(folderPath);
  }, 'Updated workspace save location');
};

const clearStoragePath = async () => {
  await withWorkspaceManagerMutation(settings => {
    settings.storagePath = '';
  }, 'Cleared workspace save location');
};

const addGlobalFolder = async () => {
  const folderPath = await pickFolder('Select global folder');
  if (!folderPath) {
    return;
  }

  await withWorkspaceManagerMutation(settings => {
    settings.globalFolders = normalizePathList([...settings.globalFolders, folderPath]);
  }, 'Added global folder');
};

const removeGlobalFolder = async item => {
  if (!item?.folderPath) {
    return;
  }

  await withWorkspaceManagerMutation(settings => {
    const folderKey = item.folderPath.toLowerCase();
    settings.globalFolders = settings.globalFolders.filter(folder => folder.toLowerCase() !== folderKey);
  }, 'Removed global folder');
};

const addCustomWorkspace = async () => {
  const workspaceName = await promptWorkspaceName({
    title: 'Add Custom Workspace',
    prompt: 'Enter the file name to use for the grouped .code-workspace file.'
  });
  if (workspaceName === undefined) {
    return;
  }

  const selectedConnection = await showConnectionQuickPick();

  await withWorkspaceManagerMutation(settings => {
    const usedIds = new Set(settings.workspaces.map(workspace => workspace.id));
    settings.workspaces.push({
      id: createUniqueWorkspaceId(workspaceName, usedIds, settings.workspaces.length + 1),
      workspaceName: workspaceName.trim(),
      connectionIds: selectedConnection ? [selectedConnection.label] : [],
      folders: []
    });
  }, 'Added custom workspace');

  await focusManagerView();
};

const editCustomWorkspaceName = async item => {
  const workspaceId = extractWorkspaceId(item);
  if (!workspaceId) {
    return;
  }

  const settings = getWorkspaceManagerSettings();
  const workspace = settings.workspaces.find(entry => entry.id === workspaceId);
  if (!workspace) {
    return;
  }

  const workspaceName = await promptWorkspaceName({
    title: 'Edit Custom Workspace Name',
    value: workspace.workspaceName,
    prompt: 'Update the file name used for this grouped workspace.'
  });
  if (workspaceName === undefined) {
    return;
  }

  await withWorkspaceManagerMutation(nextSettings => {
    const target = nextSettings.workspaces.find(entry => entry.id === workspaceId);
    if (!target) {
      return false;
    }

    target.workspaceName = workspaceName.trim();
    return true;
  }, 'Updated custom workspace name');
};

const removeCustomWorkspace = async item => {
  const workspaceId = extractWorkspaceId(item);
  if (!workspaceId) {
    return;
  }

  await withWorkspaceManagerMutation(settings => {
    settings.workspaces = settings.workspaces.filter(workspace => workspace.id !== workspaceId);
  }, 'Removed custom workspace');
};

const addCustomWorkspaceConnection = async item => {
  const workspaceId = extractWorkspaceId(item);
  if (!workspaceId) {
    return;
  }

  const settings = getWorkspaceManagerSettings();
  const workspace = settings.workspaces.find(entry => entry.id === workspaceId);
  if (!workspace) {
    return;
  }

  const selectedConnection = await showConnectionQuickPick(workspace.connectionIds);
  if (!selectedConnection) {
    return;
  }

  await withWorkspaceManagerMutation(nextSettings => {
    const target = nextSettings.workspaces.find(entry => entry.id === workspaceId);
    if (!target) {
      return false;
    }

    target.connectionIds = normalizeConnectionIdList([...target.connectionIds, selectedConnection.label]);
    return true;
  }, 'Added connection to custom workspace');
};

const removeCustomWorkspaceConnection = async item => {
  const workspaceId = extractWorkspaceId(item);
  const connectionId = extractConnectionId(item);
  if (!workspaceId || !connectionId) {
    return;
  }

  await withWorkspaceManagerMutation(settings => {
    const workspace = settings.workspaces.find(entry => entry.id === workspaceId);
    if (!workspace) {
      return false;
    }

    const connectionKey = formatKey(connectionId);
    workspace.connectionIds = workspace.connectionIds.filter(entry => formatKey(entry) !== connectionKey);
    return true;
  }, 'Removed connection from custom workspace');
};

const addCustomWorkspaceFolder = async item => {
  const workspaceId = extractWorkspaceId(item);
  if (!workspaceId) {
    return;
  }

  const folderPath = await pickFolder('Select folder for grouped workspace');
  if (!folderPath) {
    return;
  }

  await withWorkspaceManagerMutation(settings => {
    const workspace = settings.workspaces.find(entry => entry.id === workspaceId);
    if (!workspace) {
      return false;
    }

    workspace.folders = normalizePathList([...workspace.folders, folderPath]);
    return true;
  }, 'Added local folder to custom workspace');
};

const removeCustomWorkspaceFolder = async item => {
  const workspaceId = extractWorkspaceId(item);
  if (!workspaceId || !item?.folderPath) {
    return;
  }

  await withWorkspaceManagerMutation(settings => {
    const workspace = settings.workspaces.find(entry => entry.id === workspaceId);
    if (!workspace) {
      return false;
    }

    const folderKey = item.folderPath.toLowerCase();
    workspace.folders = workspace.folders.filter(folder => folder.toLowerCase() !== folderKey);
    return true;
  }, 'Removed custom workspace folder');
};

const editConnectionWorkspaceName = async item => {
  const connectionId = extractConnectionId(item);
  if (!connectionId) {
    return;
  }

  const settings = getWorkspaceManagerSettings();
  const currentName = settings.connections?.[connectionId]?.workspaceName || '';
  const workspaceName = await promptWorkspaceName({
    title: 'Edit Connection Workspace Name',
    value: currentName,
    allowEmpty: true,
    prompt: 'Leave empty to use the connection name as the generated workspace file name.'
  });
  if (workspaceName === undefined) {
    return;
  }

  await withWorkspaceManagerMutation(nextSettings => {
    nextSettings.connections[connectionId] = {
      workspaceName: workspaceName.trim() || undefined,
      folders: nextSettings.connections?.[connectionId]?.folders || []
    };
  }, 'Updated connection workspace name');
};

const addConnectionFolder = async item => {
  const connectionId = extractConnectionId(item);
  if (!connectionId) {
    return;
  }

  const folderPath = await pickFolder(`Select folder for ${connectionId}`);
  if (!folderPath) {
    return;
  }

  await withWorkspaceManagerMutation(settings => {
    const current = settings.connections?.[connectionId] || { workspaceName: undefined, folders: [] };
    settings.connections[connectionId] = {
      workspaceName: current.workspaceName,
      folders: normalizePathList([...(current.folders || []), folderPath])
    };
  }, 'Added connection folder');
};

const removeConnectionFolder = async item => {
  const connectionId = extractConnectionId(item);
  if (!connectionId || !item?.folderPath) {
    return;
  }

  await withWorkspaceManagerMutation(settings => {
    const current = settings.connections?.[connectionId];
    if (!current) {
      return false;
    }

    const folderKey = item.folderPath.toLowerCase();
    settings.connections[connectionId] = {
      workspaceName: current.workspaceName,
      folders: (current.folders || []).filter(folder => folder.toLowerCase() !== folderKey)
    };
    return true;
  }, 'Removed connection folder');
};

const openConnectionWorkspace = async item => {
  const request = resolveWorkspaceRequest(item);
  if (!request) {
    await openWorkspaceManager();
    return;
  }

  try {
    const workspaceUri = await ensureWorkspaceFile(request);
    await openWorkspaceUri(workspaceUri);
    refreshViews();
  } catch (error) {
    console.error(`[${EXTENSION_PREFIX}] Failed to open workspace`, error);
    await focusManagerView();
    await vscode.window.showWarningMessage(`${error}`);
  }
};

const openConnectionWorkspaceInNewWindow = async item => {
  const request = resolveWorkspaceRequest(item);
  if (!request) {
    await openWorkspaceManager();
    return;
  }

  try {
    const workspaceUri = await ensureWorkspaceFile(request);
    await openWorkspaceUri(workspaceUri, true);
    refreshViews();
  } catch (error) {
    console.error(`[${EXTENSION_PREFIX}] Failed to open workspace in new window`, error);
    await focusManagerView();
    await vscode.window.showWarningMessage(`${error}`);
  }
};

const editConnectionWorkspaceFile = async item => {
  const request = resolveWorkspaceRequest(item);
  if (!request) {
    await openWorkspaceManager();
    return;
  }

  try {
    const workspaceUri = await ensureWorkspaceFile(request);
    const document = await vscode.workspace.openTextDocument(workspaceUri);
    await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
    refreshViews();
  } catch (error) {
    console.error(`[${EXTENSION_PREFIX}] Failed to edit workspace file`, error);
    await focusManagerView();
    await vscode.window.showWarningMessage(`${error}`);
  }
};

const initializeWorkspaceManager = () => {
  // No-op: the manager now renders entirely with native VS Code tree views.
};

module.exports = {
  initializeWorkspaceManager,
  createWorkspaceListProvider,
  createWorkspaceManagerProvider,
  registerWorkspaceManagerTreeView,
  openWorkspaceManager,
  refreshWorkspaceViews,
  generateWorkspaceFilesCommand,
  selectStoragePath,
  clearStoragePath,
  addGlobalFolder,
  removeGlobalFolder,
  addCustomWorkspace,
  editCustomWorkspaceName,
  removeCustomWorkspace,
  addCustomWorkspaceConnection,
  removeCustomWorkspaceConnection,
  addCustomWorkspaceFolder,
  removeCustomWorkspaceFolder,
  editConnectionWorkspaceName,
  addConnectionFolder,
  removeConnectionFolder,
  openConnectionWorkspace,
  openConnectionWorkspaceInNewWindow,
  editConnectionWorkspaceFile
};
