# ABAP FS Workspaces

Manage Remote ABAP connections as reusable VS Code workspaces.

This extension reads your configured `abapfs.remote` connections, generates one `.code-workspace` file per connection, and gives you a dedicated view to open, refresh, and maintain those workspaces.

## Features

- Shows all detected ABAP Remote FS connections in a dedicated Activity Bar view.
- Generates a standalone `.code-workspace` file for each connection.
- Opens a connection workspace in the current window or a new window.
- Lets you define a custom workspace file name per connection.
- Supports shared local folders included in every generated workspace.
- Supports connection-specific local folders added only to selected workspaces.
- Lets you open and edit an already generated workspace file directly.
- Detects the ABAP Remote FS connection manager command and links to it when available.
- Validates paths, duplicate workspace names, and Windows-invalid file names before generating files.

## How It Works

Each generated workspace includes:

- The remote ABAP connection as an `adt://<connection>` folder.
- Any global local folders you want in every workspace.
- Any local folders assigned only to that connection.

This makes it easy to keep one VS Code workspace per SAP system or client, while still attaching related local project folders.

## Requirements

- VS Code `1.80.0` or newer.
- The ABAP Remote FS extension installed and configured.
- Connections defined in `abapfs.remote`.

Important limitation:

- Connections must be stored in user settings, not workspace settings, before this extension will generate standalone workspace files for them.

## Usage

1. Configure your ABAP connections in `abapfs.remote`.
2. Open the `ABAP FS Workspaces` view from the Activity Bar.
3. Run `Workspace Manager`.
4. Choose a save location for generated `.code-workspace` files.
5. Optionally add global folders and per-connection folders.
6. Save the configuration to generate workspace files.
7. Open a generated connection workspace from the tree view.

## Commands

The extension contributes these commands:

- `ABAP FS Workspaces: Workspace Manager`
- `ABAP FS Workspaces: Open ABAP FS Connection Manager`
- `ABAP FS Workspaces: Refresh Workspace List`
- `ABAP FS Workspaces: Open Connection Workspace`
- `ABAP FS Workspaces: Open Connection Workspace In New Window`
- `ABAP FS Workspaces: Edit Connection Workspace File`

## Configuration

The extension stores its settings in `abapFsWorkspaces.manager`.

```json
{
	"abapFsWorkspaces.manager": {
		"storagePath": "C:\\Workspaces\\ABAP",
		"globalFolders": [
			"C:\\Projects\\shared-tools"
		],
		"connections": {
			"DEV100": {
				"workspaceName": "DEV100",
				"folders": [
					"C:\\Projects\\dev100-local"
				]
			},
			"QAS200": {
				"workspaceName": "QAS200",
				"folders": []
			}
		}
	}
}
```

### Setting Reference

- `storagePath`: Absolute folder where generated `.code-workspace` files are written.
- `globalFolders`: Local folders included in every generated workspace.
- `connections.<id>.workspaceName`: Optional workspace file name without the `.code-workspace` extension.
- `connections.<id>.folders`: Local folders included only for that connection.

## Generated Workspace Example

```json
{
	"folders": [
		{
			"name": "DEV100(ABAP)",
			"uri": "adt://dev100"
		},
		{
			"path": "C:\\Projects\\shared-tools"
		},
		{
			"path": "C:\\Projects\\dev100-local"
		}
	]
}
```

## Notes

- Duplicate local folders are automatically removed when a workspace file is generated.
- Workspace file names must be unique across connections.
- Invalid or non-existent folder paths are rejected during validation.

## License

MIT
