import React from 'react';
import { render } from '@testing-library/react-native';

describe('Icon', () => {
  it('uses dedicated woodland history and invitation drawings even through older icon names', () => {
    const { hasBorrowhoodIcon, resolveIconName, iconSvg } = require('../../../src/assets/borrowhood-icons');
    for (const name of ['history-ledger-outline', 'neighbor-invite-outline', 'neighbors-manage-outline']) {
      expect(hasBorrowhoodIcon(name)).toBe(true);
    }
    expect(resolveIconName('receipt-outline')).toBe('history-ledger');
    expect(resolveIconName('person-add-outline')).toBe('neighbor-invite');
    const invitation = iconSvg('neighbor-invite', { illustrated: true });
    expect(invitation).toContain('#E7C590');
    expect(invitation).toContain('#ABC5B8');
    expect(invitation).not.toEqual(iconSvg('person', { illustrated: true }));
    expect(iconSvg('neighbors-manage', { illustrated: true })).not.toEqual(iconSvg('shield-checkmark', { illustrated: true }));
  });

  it('draws distinct thumbs and the notification off control instead of fallback tags', () => {
    const { hasBorrowhoodIcon, resolveIconName, iconSvg } = require('../../../src/assets/borrowhood-icons');
    for (const name of ['thumbs-up-outline', 'thumbs-down-outline', 'remove']) {
      expect(hasBorrowhoodIcon(name)).toBe(true);
      expect(resolveIconName(name)).not.toBe('pricetag');
    }
    expect(iconSvg('thumbs-up-outline', { illustrated: true })).not.toEqual(iconSvg('thumbs-down-outline', { illustrated: true }));
  });
  it('warms object icons without recoloring white controls or warnings', () => {
    const { usesWarmIllustration } = require('../../../src/components/Icon');
    expect(usesWarmIllustration('cube-outline', '#42594C')).toBe(true);
    expect(usesWarmIllustration('create-outline', '#42594C')).toBe(true);
    expect(usesWarmIllustration('home', '#fff')).toBe(false);
    expect(usesWarmIllustration('trash', '#B54242')).toBe(false);
    expect(usesWarmIllustration('close', '#42594C')).toBe(false);
  });

  it('keeps an unselected heart unfilled even with the warm illustration palette', () => {
    const { iconSvg } = require('../../../src/assets/borrowhood-icons');
    expect(iconSvg('heart-outline', { illustrated: true, selected: false })).toContain('fill-opacity="0"');
    expect(iconSvg('heart', { illustrated: true, selected: true })).toContain('fill-opacity="1"');
  });

  it('uses only Borrowhood drawings for app icons, including biometrics', () => {
    const fs = require('fs');
    const path = require('path');
    const scan = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const file = path.join(dir, entry.name);
      return entry.isDirectory() ? scan(file) : /\.[jt]sx?$/.test(file) ? [file] : [];
    });
    for (const file of scan(path.resolve(__dirname, '../../../src'))) {
      expect(fs.readFileSync(file, 'utf8')).not.toMatch(/(?:from\s*|require\s*\(\s*)['"](?:@expo\/vector-icons|react-native-vector-icons|expo-symbols)/);
    }
  });
  it('has a themed drawing for every static app icon reference', () => {
    const fs = require('fs');
    const path = require('path');
    const parser = require('@babel/parser');
    const traverse = require('@babel/traverse').default;
    const { hasBorrowhoodIcon } = require('../../../src/assets/borrowhood-icons');
    const missing = [];
    const scan = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const file = path.join(dir, entry.name);
      return entry.isDirectory() ? scan(file) : /\.[jt]sx?$/.test(file) ? [file] : [];
    });
    for (const file of scan(path.resolve(__dirname, '../../../src'))) {
      const ast = parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
      const check = name => { if (name && !hasBorrowhoodIcon(name)) missing.push(`${path.basename(file)}: ${name}`); };
      traverse(ast, {
        StringLiteral({ node }) {
          if (node.value !== '-outline' && node.value.endsWith('-outline')) check(node.value);
        },
        JSXAttribute({ node, parent }) {
          const component = parent.name?.name;
          if (['Icon', 'Ionicons', 'FriendlyIcon', 'HeroIcon', 'ShimmerImage'].includes(component)
            && ['name', 'icon', 'placeholderIcon'].includes(node.name.name)) {
            const value = node.value?.type === 'StringLiteral' ? node.value.value : node.value?.expression?.value;
            check(value);
          }
        },
        ObjectProperty({ node }) {
          if ((node.key.name || node.key.value) === 'icon' && node.value.type === 'StringLiteral') check(node.value.value);
        },
      });
    }
    expect(missing).toEqual([]);
  });
  beforeEach(() => jest.clearAllMocks());

  it('re-exports Ionicons as default and named export', () => {
    const Icon = require('../../../src/components/Icon');
    expect(Icon.default).toBeDefined();
    expect(Icon.Ionicons).toBeDefined();
    expect(Icon.default).toBe(Icon.Ionicons);
  });

  it('renders with name, size, and color props', () => {
    const { Ionicons } = require('../../../src/components/Icon');
    const { toJSON } = render(<Ionicons name="home" size={24} color="#fff" />);
    expect(toJSON()).toBeTruthy();
  });
});
