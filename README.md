# ABAP FS Workspaces

Manage Remote ABAP connections as reusable VS Code workspaces.

This extension reads your configured `abapfs.remote` connections, generates standalone `.code-workspace` files, and gives you native VS Code sidebar views to open, refresh, and maintain them.

## Features

- Shows all detected ABAP Remote FS connections in a dedicated Activity Bar view.
- Provides a native `Workspace Manager` sidebar view built from VS Code tree items, input boxes, quick picks, and folder pickers.
- Generates a standalone `.code-workspace` file for each connection.
- Lets you create custom workspaces that include multiple ABAP FS connections in one `.code-workspace` file.
- Opens a connection workspace in the current window or a new window.
- Lets you define a custom workspace file name per connection.
- Lets you assign a color preset per connection for native Explorer and editor tab decorations.
- Lets you assign an icon preset per connection for native Explorer and editor tab decorations.
- Supports shared local folders included in every generated workspace.
- Supports connection-specific local folders added only to selected workspaces.
- Supports custom workspace-specific local folders for grouped workspaces.
- Lets you open and edit an already generated workspace file directly.
- Detects the ABAP Remote FS connection manager command and links to it when available.
- Validates paths, duplicate workspace names, and Windows-invalid file names before generating files.

## How It Works

Each generated workspace includes:

- One or more remote ABAP connections as `adt://<connection>` folders.
- Any global local folders you want in every workspace.
- Any local folders assigned only to that generated workspace.

This makes it easy to keep one VS Code workspace per SAP system or client, while still attaching related local project folders.

## Requirements

- VS Code `1.80.0` or newer.
- The ABAP Remote FS extension installed and configured.
- Connections defined in `abapfs.remote`.

Important limitation:

- Connections must be stored in user settings, not workspace settings, before this extension will generate standalone workspace files for them.

## Usage

1. Configure your ABAP connections in `abapfs.remote`.
2. Open the `ABAP FS Workspaces` container from the Activity Bar.
3. Use the `Workspace Manager` sidebar view to choose a save location, add global folders, configure per-connection names and folders, and manage grouped workspaces.
4. Use the inline actions or context menu on tree items to edit names, add folders, and manage grouped workspace connections.
5. Run `Generate Or Regenerate Workspaces` from the view title bar when you want to write or refresh the `.code-workspace` files.
6. Open a generated workspace from either the `Workspace Manager` or `Generated Workspaces` view.

## Commands

The extension contributes these commands:

- `ABAP FS Workspaces: Workspace Manager`
- `ABAP FS Workspaces: Open ABAP FS Connection Manager`
- `ABAP FS Workspaces: Refresh Workspace List`
- `ABAP FS Workspaces: Open Connection Workspace`
- `ABAP FS Workspaces: Open Connection Workspace In New Window`
- `ABAP FS Workspaces: Edit Connection Workspace File`

## Configuration

This extension stores its settings in `abapFsWorkspaces.manager`.

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
				"color": "charts.red",
				"badge": "circle",
				"folders": [
					"C:\\Projects\\dev100-local"
				]
			},
			"QAS200": {
				"workspaceName": "QAS200",
				"color": "charts.green",
				"badge": "triangle",
				"folders": []
			}
		},
		"workspaces": [
			{
				"id": "dev-qas",
				"workspaceName": "DEV-QAS",
				"connectionIds": [
					"DEV100",
					"QAS200"
				],
				"folders": [
					"C:\\Projects\\cross-system-tools"
				]
			}
		]
		}
	}
}
```

### Setting Reference

- `storagePath`: Absolute folder where generated `.code-workspace` files are written.
- `globalFolders`: Local folders included in every generated workspace file.
- `connections.<id>.workspaceName`: Optional workspace file name without the `.code-workspace` extension.
- `connections.<id>.color`: Optional color preset used for native Explorer and editor tab decorations.
- `connections.<id>.badge`: Optional icon preset used for native Explorer and editor tab decorations.
- `connections.<id>.folders`: Local folders included only for that connection.
- `workspaces[].workspaceName`: Required file name for a custom grouped workspace.
- `workspaces[].connectionIds`: One or more ABAP FS connection IDs included in the grouped workspace.
- `workspaces[].folders`: Local folders included only in that grouped workspace.

Available color presets:

- `charts.red`
- `charts.green`
- `charts.blue`
- `charts.yellow`
- `charts.orange`
- `charts.purple`

Available icon presets:

- `dot` (`•`)
- `circle` (`●`)
- `ring` (`◉`)
- `hollow-circle` (`○`)
- `square` (`■`)
- `hollow-square` (`□`)
- `triangle` (`▲`)
- `hollow-triangle` (`△`)
- `diamond` (`◆`)
- `hollow-diamond` (`◇`)
- `star` (`★`)
- `hollow-star` (`☆`)
- `spark` (`✦`)
- `plus` (`✚`)
- `cross` (`✖`)
- `clover` (`✤`)
- `sun` (`☀`)
- `cloud` (`☁`)
- `flag` (`⚑`)
- `bolt` (`⚡`)
- `anchor` (`⚓`)
- `rocket` (`🚀`)
- `fire` (`🔥`)
- `leaf` (`🍃`)
- `bug` (`🐛`)
- `gear` (`⚙️`)
- `lock` (`🔒`)
- `key` (`🔑`)
- `globe` (`🌍`)
- `lightbulb` (`💡`)
- `hammer` (`🔨`)
- `package` (`📦`)
- `pin` (`📌`)
- `shield` (`🛡️`)

## Generated Workspace Example

```json
{
	"folders": [
		{
			"name": "DEV100(ABAP)",
			"uri": "adt://dev100"
		},
		{
			"name": "QAS200(ABAP)",
			"uri": "adt://qas200"
		},
		{
			"path": "C:\\Projects\\shared-tools"
		},
		{
			"path": "C:\\Projects\\cross-system-tools"
		}
	],
	"settings": {
		"abapFsWorkspaces.workspaceColors": {
			"DEV100": "charts.red",
			"QAS200": "charts.green"
		},
		"abapFsWorkspaces.workspaceBadges": {
			"DEV100": "circle",
			"QAS200": "triangle"
		}
	}
}
```

## Notes

- Duplicate local folders are automatically removed when a workspace file is generated.
- Workspace file names must be unique across connections.
- Invalid or non-existent folder paths are rejected during validation.
- Native VS Code decorations can color Explorer items and tab labels, but not per-connection tab-bar backgrounds.
- Native file-decoration badges support text glyphs, not VS Code theme icons or arbitrary custom icons.
- Emoji badges are supported, but many Windows emoji fonts render in their own colors and may not fully adopt the selected connection color.
- Native VS Code Explorer indent guide colors are theme-level, so they cannot be changed per connection.

## License

MIT
