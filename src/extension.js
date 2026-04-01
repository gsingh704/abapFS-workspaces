const vscode = require('vscode');
const {
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
} = require('./workspaceManager');

const EXTENSION_PREFIX = 'abapFS-workspaces';
const ABAP_FS_CONNECTION_MANAGER_COMMAND = 'abapfs.connectionManager';

const updateAbapFsCommandContext = async () => {
  const commands = await vscode.commands.getCommands(true);
  const hasConnectionManager = commands.includes(ABAP_FS_CONNECTION_MANAGER_COMMAND);
  await vscode.commands.executeCommand(
    'setContext',
    `${EXTENSION_PREFIX}.hasAbapFsConnectionManager`,
    hasConnectionManager
  );
};

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  initializeWorkspaceManager(context.extensionUri);
  const workspaceListProvider = createWorkspaceListProvider();
  const workspaceManagerProvider = createWorkspaceManagerProvider();
  const workspaceManagerTreeView = vscode.window.createTreeView('abapFsWorkspaces.workspaceManager', {
    treeDataProvider: workspaceManagerProvider,
    showCollapseAll: true
  });

  registerWorkspaceManagerTreeView(workspaceManagerTreeView);

  void updateAbapFsCommandContext();

  context.subscriptions.push(
    workspaceManagerTreeView,
    vscode.window.registerTreeDataProvider('abapFsWorkspaces.workspaceList', workspaceListProvider),
    workspaceListProvider,
    workspaceManagerProvider,
    vscode.commands.registerCommand(`${EXTENSION_PREFIX}.workspaceManager`, () => openWorkspaceManager()),
    vscode.commands.registerCommand(`${EXTENSION_PREFIX}.openAbapFsConnectionManager`, async () => {
      const commands = await vscode.commands.getCommands(true);
      const hasConnectionManager = commands.includes(ABAP_FS_CONNECTION_MANAGER_COMMAND);
      await vscode.commands.executeCommand(
        'setContext',
        `${EXTENSION_PREFIX}.hasAbapFsConnectionManager`,
        hasConnectionManager
      );

      if (!hasConnectionManager) {
        await vscode.window.showWarningMessage('ABAP Remote FS is not installed or its connection manager command is unavailable.');
        return;
      }

      return vscode.commands.executeCommand(ABAP_FS_CONNECTION_MANAGER_COMMAND);
    }),
    vscode.commands.registerCommand(`${EXTENSION_PREFIX}.refreshWorkspaceList`, () => refreshWorkspaceViews()),
    vscode.commands.registerCommand(`${EXTENSION_PREFIX}.generateWorkspaceFiles`, () => generateWorkspaceFilesCommand()),
    vscode.commands.registerCommand(`${EXTENSION_PREFIX}.selectStoragePath`, () => selectStoragePath()),
    vscode.commands.registerCommand(`${EXTENSION_PREFIX}.clearStoragePath`, item => clearStoragePath(item)),
    vscode.commands.registerCommand(`${EXTENSION_PREFIX}.addGlobalFolder`, () => addGlobalFolder()),
    vscode.commands.registerCommand(`${EXTENSION_PREFIX}.removeGlobalFolder`, item => removeGlobalFolder(item)),
    vscode.commands.registerCommand(`${EXTENSION_PREFIX}.addCustomWorkspace`, () => addCustomWorkspace()),
    vscode.commands.registerCommand(`${EXTENSION_PREFIX}.editCustomWorkspaceName`, item => editCustomWorkspaceName(item)),
    vscode.commands.registerCommand(`${EXTENSION_PREFIX}.removeCustomWorkspace`, item => removeCustomWorkspace(item)),
    vscode.commands.registerCommand(
      `${EXTENSION_PREFIX}.addCustomWorkspaceConnection`,
      item => addCustomWorkspaceConnection(item)
    ),
    vscode.commands.registerCommand(
      `${EXTENSION_PREFIX}.removeCustomWorkspaceConnection`,
      item => removeCustomWorkspaceConnection(item)
    ),
    vscode.commands.registerCommand(`${EXTENSION_PREFIX}.addCustomWorkspaceFolder`, item => addCustomWorkspaceFolder(item)),
    vscode.commands.registerCommand(
      `${EXTENSION_PREFIX}.removeCustomWorkspaceFolder`,
      item => removeCustomWorkspaceFolder(item)
    ),
    vscode.commands.registerCommand(
      `${EXTENSION_PREFIX}.editConnectionWorkspaceName`,
      item => editConnectionWorkspaceName(item)
    ),
    vscode.commands.registerCommand(`${EXTENSION_PREFIX}.addConnectionFolder`, item => addConnectionFolder(item)),
    vscode.commands.registerCommand(`${EXTENSION_PREFIX}.removeConnectionFolder`, item => removeConnectionFolder(item)),
    vscode.commands.registerCommand(`${EXTENSION_PREFIX}.openConnectionWorkspace`, item => openConnectionWorkspace(item)),
    vscode.commands.registerCommand(
      `${EXTENSION_PREFIX}.openConnectionWorkspaceInNewWindow`,
      item => openConnectionWorkspaceInNewWindow(item)
    ),
    vscode.commands.registerCommand(
      `${EXTENSION_PREFIX}.editConnectionWorkspaceFile`,
      item => editConnectionWorkspaceFile(item)
    )
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};