const { getWorkspaceManagerScript } = require('./workspaceManagerScript');

const escapeHtml = value => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const renderFolderRows = (folders, type, connectionId) => folders
  .map(folder => `<div
      class="folder-entry"
      data-role="${type === 'global' ? 'global-folder' : 'connection-folder'}"
      ${connectionId ? `data-connection-id="${escapeHtml(connectionId)}"` : ''}
      data-path="${escapeHtml(folder)}"
      title="${escapeHtml(folder)}"
    >
      <span>${escapeHtml(folder)}</span>
      <button
        data-action="${type === 'global' ? 'remove-global-folder' : 'remove-connection-folder'}"
        ${connectionId ? `data-connection-id="${escapeHtml(connectionId)}"` : ''}
      >×</button>
    </div>`)
  .join('');

const renderConnections = (state, focusConnectionId) => {
  if (state.connections.length === 0) {
    return '<div class="muted">No connections found in abapfs.remote.</div>';
  }

  return state.connections
    .map(connection => {
      const focus = connection.id === focusConnectionId;
      const scopeLabel = connection.target === 'user' ? 'User settings' : 'Workspace settings';
      return `<article class="connection-card" data-connection-id="${escapeHtml(connection.id)}" ${focus ? 'data-focus="true"' : ''}>
          <div class="connection-topline">
            <input class="workspace-title-input" type="text" data-role="workspace-name" data-connection-id="${escapeHtml(connection.id)}" value="${escapeHtml(connection.workspaceName)}">
            <span class="muted connection-meta">${escapeHtml(connection.url || '')} / ${escapeHtml(connection.client || '')} / ${escapeHtml(scopeLabel)}</span>
            <a href="#" class="file-link" data-action="open-workspace" data-connection-id="${escapeHtml(connection.id)}">${escapeHtml(connection.filePath || 'Set save location')}</a>
            <button class="link plus-button compact-plus" data-action="add-connection-folder" data-connection-id="${escapeHtml(connection.id)}">+</button>
          </div>
          <div class="connection-folders-row">
            <div class="folder-list connection-folder-list" data-connection-id="${escapeHtml(connection.id)}">${renderFolderRows(connection.folders, 'connection', connection.id)}</div>
          </div>
        </article>`;
    })
    .join('');
};

function renderWorkspaceManagerView(webview, state, statusMessage, focusConnectionId) {
  const nonce = getNonce();
  const statusHtml = statusMessage
    ? `<div class="message visible ${statusMessage.type}">${escapeHtml(statusMessage.text)}</div>`
    : '<div class="message"></div>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Workspace Manager</title>
  <style nonce="${nonce}">
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 8px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    .container {
      max-width: 980px;
      margin: 0 auto;
      display: grid;
      gap: 6px;
    }
    .page-header {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
    }
    .panel {
      background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 8px;
      display: grid;
      gap: 6px;
    }
    .section-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
    }
    .section-title h2 {
      margin: 0;
      font-size: 13px;
    }
    .field {
      display: grid;
      gap: 4px;
    }
    label {
      font-weight: 600;
    }
    input[type="text"] {
      width: 100%;
      min-height: 28px;
      padding: 4px 6px;
      border-radius: 6px;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
    }
    input[type="text"]:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    .folder-list {
      display: grid;
      gap: 4px;
      min-width: 0;
      width: 100%;
    }
    .folder-entry {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 6px;
      width: 100%;
      min-width: 0;
      padding: 3px 6px;
      border-radius: 4px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-input-background);
      color: var(--vscode-foreground);
      font-size: 11px;
    }
    .folder-entry span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .folder-entry button {
      min-height: auto;
      min-width: auto;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--vscode-descriptionForeground);
      font-size: 13px;
      line-height: 1;
    }
    .connection-grid {
      display: grid;
      gap: 6px;
    }
    .connection-card {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 8px;
      background: var(--vscode-editor-background);
      display: grid;
      gap: 6px;
    }
    .connection-card[data-focus="true"] {
      border-color: var(--vscode-focusBorder);
      box-shadow: 0 0 0 1px var(--vscode-focusBorder);
    }
    .connection-topline {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      width: 100%;
    }
    .connection-folders-row {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      min-width: 0;
    }
    .workspace-title-input {
      width: 10ch;
      min-width: 10ch;
      max-width: 10ch;
      flex: 0 0 10ch;
      font-weight: 600;
    }
    .muted {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }
    .connection-meta {
      flex: 0 0 auto;
      white-space: nowrap;
    }
    .file-link {
      display: block;
      flex: 1 1 220px;
      min-width: 0;
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .file-link:hover {
      text-decoration: underline;
    }
    .button-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    button {
      min-height: 26px;
      padding: 0 8px;
      border: 1px solid transparent;
      border-radius: 6px;
      cursor: pointer;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      font-size: 12px;
    }
    button.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    button.link {
      background: transparent;
      color: var(--vscode-textLink-foreground);
      border-color: var(--vscode-panel-border);
    }
    .plus-button {
      min-width: 26px;
      padding: 0;
      font-size: 16px;
      line-height: 1;
    }
    .compact-plus {
      flex: 0 0 auto;
      margin-left: auto;
      align-self: center;
    }
    .message {
      padding: 6px 8px;
      border-radius: 8px;
      border: 1px solid var(--vscode-panel-border);
      display: none;
      white-space: pre-wrap;
      font-size: 12px;
    }
    .message.visible { display: block; }
    .message.success {
      border-color: rgba(64, 168, 85, 0.4);
      background: rgba(64, 168, 85, 0.12);
    }
    .message.error {
      border-color: rgba(210, 65, 65, 0.45);
      background: rgba(210, 65, 65, 0.14);
    }
    @media (max-width: 640px) {
      body { padding: 6px; }
      .page-header, .connection-topline, .connection-folders-row {
        display: grid;
        grid-template-columns: 1fr;
      }
      .workspace-title-input {
        width: 100%;
        min-width: 0;
        max-width: none;
        flex: none;
      }
      .compact-plus {
        justify-self: start;
        margin-left: 0;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="page-header">
      <div class="button-row">
        <button id="refreshBtn">Reload</button>
        <button id="saveBtn" class="primary">Save And Generate</button>
      </div>
    </div>

    ${statusHtml}

    <section class="panel">
      <div class="section-title">
        <h2>Workspace Files</h2>
        <button id="browseStoragePathBtn" class="link">Browse</button>
      </div>
      <div class="field">
        <label for="storagePath">Save At</label>
        <input id="storagePath" type="text" placeholder="C:\\workspaces\\abap" value="${escapeHtml(state.storagePath)}">
      </div>
    </section>

    <section class="panel">
      <div class="section-title">
        <h2>Global Folders</h2>
        <button id="addGlobalFolderBtn" class="link plus-button">+</button>
      </div>
      <div id="globalFolders" class="folder-list">${renderFolderRows(state.globalFolders, 'global')}</div>
    </section>

    <section class="panel">
      <div class="section-title">
        <h2>Connections</h2>
      </div>
      <div id="connections" class="connection-grid">${renderConnections(state, focusConnectionId)}</div>
    </section>
  </div>

  <script nonce="${nonce}">
${getWorkspaceManagerScript()}
  </script>
</body>
</html>`;
}

function getNonce() {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let index = 0; index < 32; index += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

module.exports = {
  renderWorkspaceManagerView
};