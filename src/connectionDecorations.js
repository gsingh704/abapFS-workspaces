const vscode = require('vscode');
const {
  CONFIG_ROOT,
  WORKSPACE_COLORS_KEY,
  WORKSPACE_BADGES_KEY,
  normalizeConnectionColor,
  normalizeWorkspaceColorMap,
  normalizeConnectionBadge,
  normalizeWorkspaceBadgeMap,
  getConnectionBadgeSymbol
} = require('./connectionColors');

const WORKSPACE_MANAGER_KEY = 'manager';

const getScopedConnectionValue = (connectionId, source, field, normalizer) => {
  const candidates = [connectionId, connectionId.toUpperCase(), connectionId.toLowerCase()];
  for (const candidate of candidates) {
    const normalized = normalizer(source?.[candidate]?.[field] ?? source?.[candidate]);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
};

const normalizeManagerSettings = value => {
  if (!value || typeof value !== 'object' || !value.connections || typeof value.connections !== 'object') {
    return { connections: {} };
  }

  return {
    connections: Object.entries(value.connections).reduce((result, [connectionId, connectionSettings]) => {
      const color = normalizeConnectionColor(connectionSettings?.color);
      const badge = normalizeConnectionBadge(connectionSettings?.badge);
      if (!color && !badge) {
        return result;
      }

      if (color) {
        result[connectionId] = {
          ...result[connectionId],
          color
        };
      }

      if (badge) {
        result[connectionId] = {
          ...result[connectionId],
          badge
        };
      }

      return result;
    }, {})
  };
};

const getTabUri = tabInput => {
  if (!tabInput || typeof tabInput !== 'object') {
    return undefined;
  }

  if (tabInput.uri instanceof vscode.Uri) {
    return tabInput.uri;
  }

  if (tabInput.modified instanceof vscode.Uri) {
    return tabInput.modified;
  }

  return undefined;
};

class ConnectionDecorationProvider {
  constructor() {
    this._onDidChangeFileDecorations = new vscode.EventEmitter();
    this.onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;
  }

  refresh() {
    const uris = new Map();

    for (const folder of vscode.workspace.workspaceFolders || []) {
      if (folder.uri.scheme === 'adt') {
        uris.set(folder.uri.toString(), folder.uri);
      }
    }

    for (const document of vscode.workspace.textDocuments) {
      if (document.uri.scheme === 'adt') {
        uris.set(document.uri.toString(), document.uri);
      }
    }

    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const uri = getTabUri(tab.input);
        if (uri?.scheme === 'adt') {
          uris.set(uri.toString(), uri);
        }
      }
    }

    this._onDidChangeFileDecorations.fire([...uris.values()]);
  }

  provideFileDecoration(uri) {
    if (uri.scheme !== 'adt') {
      return undefined;
    }

    const workspaceColors = normalizeWorkspaceColorMap(
      vscode.workspace.getConfiguration(CONFIG_ROOT).get(WORKSPACE_COLORS_KEY)
    );
    const workspaceBadges = normalizeWorkspaceBadgeMap(
      vscode.workspace.getConfiguration(CONFIG_ROOT).get(WORKSPACE_BADGES_KEY)
    );
    const managerSettings = normalizeManagerSettings(
      vscode.workspace.getConfiguration(CONFIG_ROOT).get(WORKSPACE_MANAGER_KEY)
    );
    const connectionId = uri.authority || '';
    const colorId = getScopedConnectionValue(connectionId, workspaceColors, undefined, normalizeConnectionColor)
      || getScopedConnectionValue(connectionId, managerSettings.connections, 'color', normalizeConnectionColor);
    const badgeId = getScopedConnectionValue(connectionId, workspaceBadges, undefined, normalizeConnectionBadge)
      || getScopedConnectionValue(connectionId, managerSettings.connections, 'badge', normalizeConnectionBadge);

    if (!colorId && !badgeId) {
      return undefined;
    }

    const decoration = new vscode.FileDecoration(
      getConnectionBadgeSymbol(badgeId),
      `ABAP FS connection: ${connectionId}`,
      colorId ? new vscode.ThemeColor(colorId) : undefined
    );
    decoration.propagate = true;
    return decoration;
  }

  dispose() {
    this._onDidChangeFileDecorations.dispose();
  }
}

const registerConnectionDecorations = context => {
  const provider = new ConnectionDecorationProvider();

  context.subscriptions.push(
    provider,
    vscode.window.registerFileDecorationProvider(provider),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (
        event.affectsConfiguration(`${CONFIG_ROOT}.${WORKSPACE_COLORS_KEY}`)
        || event.affectsConfiguration(`${CONFIG_ROOT}.${WORKSPACE_BADGES_KEY}`)
        || event.affectsConfiguration(`${CONFIG_ROOT}.${WORKSPACE_MANAGER_KEY}`)
      ) {
        provider.refresh();
      }
    }),
    vscode.workspace.onDidOpenTextDocument(document => {
      if (document.uri.scheme === 'adt') {
        provider.refresh();
      }
    }),
    vscode.workspace.onDidCloseTextDocument(document => {
      if (document.uri.scheme === 'adt') {
        provider.refresh();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.refresh()),
    vscode.window.tabGroups.onDidChangeTabs(() => provider.refresh())
  );

  provider.refresh();
};

module.exports = {
  registerConnectionDecorations
};