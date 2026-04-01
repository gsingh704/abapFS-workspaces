const CONFIG_ROOT = 'abapFsWorkspaces';
const WORKSPACE_COLORS_KEY = 'workspaceColors';
const WORKSPACE_BADGES_KEY = 'workspaceBadges';

const CONNECTION_COLOR_PRESETS = Object.freeze([
  {
    id: 'charts.red',
    label: 'Red',
    description: 'Red connection accent'
  },
  {
    id: 'charts.green',
    label: 'Green',
    description: 'Green connection accent'
  },
  {
    id: 'charts.blue',
    label: 'Blue',
    description: 'Blue connection accent'
  },
  {
    id: 'charts.yellow',
    label: 'Yellow',
    description: 'Yellow connection accent'
  },
  {
    id: 'charts.orange',
    label: 'Orange',
    description: 'Orange connection accent'
  },
  {
    id: 'charts.purple',
    label: 'Purple',
    description: 'Purple connection accent'
  }
]);

const COLOR_LOOKUP = new Map(CONNECTION_COLOR_PRESETS.map(color => [color.id, color]));

const CONNECTION_BADGE_PRESETS = Object.freeze([
  {
    id: 'dot',
    symbol: '•',
    label: 'Dot'
  },
  {
    id: 'circle',
    symbol: '●',
    label: 'Circle'
  },
  {
    id: 'ring',
    symbol: '◉',
    label: 'Ring'
  },
  {
    id: 'hollow-circle',
    symbol: '○',
    label: 'Hollow Circle'
  },
  {
    id: 'square',
    symbol: '■',
    label: 'Square'
  },
  {
    id: 'hollow-square',
    symbol: '□',
    label: 'Hollow Square'
  },
  {
    id: 'triangle',
    symbol: '▲',
    label: 'Triangle'
  },
  {
    id: 'hollow-triangle',
    symbol: '△',
    label: 'Hollow Triangle'
  },
  {
    id: 'diamond',
    symbol: '◆',
    label: 'Diamond'
  },
  {
    id: 'hollow-diamond',
    symbol: '◇',
    label: 'Hollow Diamond'
  },
  {
    id: 'star',
    symbol: '★',
    label: 'Star'
  },
  {
    id: 'hollow-star',
    symbol: '☆',
    label: 'Hollow Star'
  },
  {
    id: 'spark',
    symbol: '✦',
    label: 'Spark'
  },
  {
    id: 'plus',
    symbol: '✚',
    label: 'Plus'
  },
  {
    id: 'cross',
    symbol: '✖',
    label: 'Cross'
  },
  {
    id: 'clover',
    symbol: '✤',
    label: 'Clover'
  },
  {
    id: 'sun',
    symbol: '☀',
    label: 'Sun'
  },
  {
    id: 'cloud',
    symbol: '☁',
    label: 'Cloud'
  },
  {
    id: 'flag',
    symbol: '⚑',
    label: 'Flag'
  },
  {
    id: 'bolt',
    symbol: '⚡',
    label: 'Bolt'
  },
  {
    id: 'anchor',
    symbol: '⚓',
    label: 'Anchor'
  },
  {
    id: 'rocket',
    symbol: '🚀',
    label: 'Rocket'
  },
  {
    id: 'fire',
    symbol: '🔥',
    label: 'Fire'
  },
  {
    id: 'leaf',
    symbol: '🍃',
    label: 'Leaf'
  },
  {
    id: 'bug',
    symbol: '🐛',
    label: 'Bug'
  },
  {
    id: 'gear',
    symbol: '⚙️',
    label: 'Gear'
  },
  {
    id: 'lock',
    symbol: '🔒',
    label: 'Lock'
  },
  {
    id: 'key',
    symbol: '🔑',
    label: 'Key'
  },
  {
    id: 'globe',
    symbol: '🌍',
    label: 'Globe'
  },
  {
    id: 'lightbulb',
    symbol: '💡',
    label: 'Lightbulb'
  },
  {
    id: 'hammer',
    symbol: '🔨',
    label: 'Hammer'
  },
  {
    id: 'package',
    symbol: '📦',
    label: 'Package'
  },
  {
    id: 'pin',
    symbol: '📌',
    label: 'Pin'
  },
  {
    id: 'shield',
    symbol: '🛡️',
    label: 'Shield'
  }
]);

const BADGE_LOOKUP = new Map(CONNECTION_BADGE_PRESETS.map(badge => [badge.id, badge]));

const normalizeSettingMap = (value, normalizer) => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.entries(value).reduce((result, [connectionId, settingValue]) => {
    const normalized = normalizer(settingValue);
    if (!normalized) {
      return result;
    }

    result[connectionId] = normalized;
    return result;
  }, {});
};

const normalizeConnectionColor = value => {
  const colorId = typeof value === 'string' ? value.trim() : '';
  return COLOR_LOOKUP.has(colorId) ? colorId : '';
};

const getConnectionColorPreset = value => {
  const colorId = normalizeConnectionColor(value);
  return colorId ? COLOR_LOOKUP.get(colorId) : undefined;
};

const getConnectionColorLabel = value => getConnectionColorPreset(value)?.label || 'Not set';

const normalizeConnectionBadge = value => {
  const badgeId = typeof value === 'string' ? value.trim() : '';
  return BADGE_LOOKUP.has(badgeId) ? badgeId : '';
};

const getConnectionBadgePreset = value => {
  const badgeId = normalizeConnectionBadge(value);
  return badgeId ? BADGE_LOOKUP.get(badgeId) : undefined;
};

const getConnectionBadgeLabel = value => getConnectionBadgePreset(value)?.label || 'Not set';

const getConnectionBadgeSymbol = value => getConnectionBadgePreset(value)?.symbol || undefined;

const normalizeWorkspaceColorMap = value => normalizeSettingMap(value, normalizeConnectionColor);

const normalizeWorkspaceBadgeMap = value => normalizeSettingMap(value, normalizeConnectionBadge);

module.exports = {
  CONFIG_ROOT,
  WORKSPACE_COLORS_KEY,
  WORKSPACE_BADGES_KEY,
  CONNECTION_COLOR_PRESETS,
  CONNECTION_BADGE_PRESETS,
  normalizeConnectionColor,
  getConnectionColorPreset,
  getConnectionColorLabel,
  normalizeWorkspaceColorMap,
  normalizeConnectionBadge,
  getConnectionBadgePreset,
  getConnectionBadgeLabel,
  getConnectionBadgeSymbol,
  normalizeWorkspaceBadgeMap
};