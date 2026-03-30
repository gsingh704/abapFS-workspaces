const vscode = require('vscode');
const {
  createWorkspaceListProvider,
  openWorkspaceManager,
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
  const workspaceListProvider = createWorkspaceListProvider();

  void updateAbapFsCommandContext();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('abapRemoteFsWorkspaces.workspaceList', workspaceListProvider),
    workspaceListProvider,
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
    vscode.commands.registerCommand(`${EXTENSION_PREFIX}.refreshWorkspaceList`, () => workspaceListProvider.refresh()),
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