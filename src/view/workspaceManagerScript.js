function getWorkspaceManagerScript() {
  return String.raw`
    const vscode = acquireVsCodeApi();
    const normalizePath = value => (value || '').trim().toLowerCase();

    const createFolderChip = (type, connectionId = '', value = '') => {
      const chip = document.createElement('div');
      chip.className = 'folder-entry';
      chip.dataset.role = type === 'global' ? 'global-folder' : 'connection-folder';
      chip.dataset.path = value;
      chip.title = value;
      if (connectionId) chip.dataset.connectionId = connectionId;

      const text = document.createElement('span');
      text.textContent = value;

      const button = document.createElement('button');
      button.textContent = '×';
      button.dataset.action = type === 'global' ? 'remove-global-folder' : 'remove-connection-folder';
      if (connectionId) button.dataset.connectionId = connectionId;

      chip.appendChild(text);
      chip.appendChild(button);
      return chip;
    };

    const collectValues = elements => elements
      .map(element => (element.dataset.path || '').trim())
      .filter(Boolean);

    const appendFolderChip = (target, type, connectionId, value) => {
      if (!target) return;
      const normalizedValue = normalizePath(value);
      if (!normalizedValue) return;

      const selector = type === 'global' ? '[data-role="global-folder"]' : '[data-role="connection-folder"]';
      const existing = Array.from(target.querySelectorAll(selector))
        .some(chip => normalizePath(chip.dataset.path) === normalizedValue);
      if (existing) return;

      target.appendChild(createFolderChip(type, connectionId, value));
    };

    const collectState = () => {
      const connections = {};
      document.querySelectorAll('.connection-card').forEach(card => {
        const connectionId = card.dataset.connectionId || '';
        const workspaceName = card.querySelector('[data-role="workspace-name"]').value.trim();
        const folders = collectValues(Array.from(card.querySelectorAll('[data-role="connection-folder"]')));
        connections[connectionId] = { workspaceName, folders };
      });

      return {
        storagePath: document.getElementById('storagePath').value.trim(),
        globalFolders: collectValues(Array.from(document.querySelectorAll('[data-role="global-folder"]'))),
        connections
      };
    };

    window.addEventListener('DOMContentLoaded', () => {
      const focused = document.querySelector('.connection-card[data-focus="true"]');
      if (focused) {
        focused.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'pickedStoragePath') {
        document.getElementById('storagePath').value = message.path || '';
      } else if (message.type === 'pickedGlobalFolder') {
        appendFolderChip(document.getElementById('globalFolders'), 'global', '', message.path || '');
      } else if (message.type === 'pickedConnectionFolder') {
        const target = document.querySelector('.connection-folder-list[data-connection-id="' + (message.connectionId || '') + '"]');
        appendFolderChip(target, 'connection', message.connectionId || '', message.path || '');
      }
    });

    document.addEventListener('click', event => {
      const link = event.target.closest('[data-action="open-workspace"]');
      if (link && !event.target.closest('button')) {
        event.preventDefault();
        vscode.postMessage({ type: 'openWorkspace', connectionId: link.dataset.connectionId || '' });
        return;
      }

      const button = event.target.closest('button');
      if (!button) return;

      const action = button.dataset.action || button.id;
      const connectionId = button.dataset.connectionId || '';

      if (button.id === 'saveBtn') {
        vscode.postMessage({ type: 'saveSettings', state: collectState() });
      } else if (button.id === 'refreshBtn') {
        vscode.postMessage({ type: 'refresh' });
      } else if (button.id === 'browseStoragePathBtn') {
        vscode.postMessage({
          type: 'pickStoragePath',
          currentPath: document.getElementById('storagePath').value
        });
      } else if (button.id === 'addGlobalFolderBtn') {
        vscode.postMessage({ type: 'pickGlobalFolder' });
      } else if (action === 'remove-global-folder' || action === 'remove-connection-folder') {
        button.closest('.folder-entry')?.remove();
      } else if (action === 'add-connection-folder') {
        vscode.postMessage({ type: 'pickConnectionFolder', connectionId });
      }
    });
  `;
}

module.exports = {
  getWorkspaceManagerScript
};