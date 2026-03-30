# ABAP Remote FS Workspaces

This extension separates the standalone workspace-management feature from the main ABAP Remote FS extension.

It reads connection definitions from `abapfs.remote`, lets you assign shared and per-connection local folders, generates one `.code-workspace` file per connection, and can open those workspaces directly from the ABAP FS connections view.

## Features

- Workspace Manager webview for configuring output location, shared folders, and per-connection folders.
- Dedicated sidebar entry in the activity bar for managing workspaces without opening a separate editor panel.
- One-click generation of `.code-workspace` files for every user-level ABAP connection.
- Inline `Open Connection Workspace` action in the `abapfs.connections` view.
- Automatic fallback import of legacy settings from `abapfs.workspaceManager` if the new extension has not been configured yet.

## Requirements

- The ABAP Remote FS extension must be installed and configured because this extension reads `abapfs.remote` and generates workspaces containing `adt://` folders.
- Connections that should work in standalone workspaces must be stored in user settings, not workspace settings.

## Commands

- `ABAP Remote FS Workspaces: Workspace Manager`
- `ABAP Remote FS Workspaces: Open Connection Workspace`

## Settings

This extension contributes:

- `abapRemoteFsWorkspaces.manager.storagePath`: Absolute output folder for generated `.code-workspace` files.
- `abapRemoteFsWorkspaces.manager.globalFolders`: Local folders included in every generated workspace.
- `abapRemoteFsWorkspaces.manager.connections`: Per-connection workspace name overrides and local folders.

## Notes

- Generated workspaces include the ABAP connection as `adt://<connection-id>` plus the selected local folders.
- If a connection exists only in workspace settings, generation is blocked because the standalone workspace would not be able to resolve it reliably.
