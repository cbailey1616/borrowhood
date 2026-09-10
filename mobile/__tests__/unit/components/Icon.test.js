import React from 'react';
import { render } from '@testing-library/react-native';

describe('Icon', () => {
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

  it('uses native symbols only for platform biometric branding', () => {
    const fs = require('fs');
    const path = require('path');
    const scan = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const file = path.join(dir, entry.name);
      return entry.isDirectory() ? scan(file) : /\.[jt]sx?$/.test(file) ? [file] : [];
    });
    for (const file of scan(path.resolve(__dirname, '../../../src'))) {
      if (path.basename(file) === 'BiometricIcon.js') continue;
      expect(fs.readFileSync(file, 'utf8')).not.toMatch(/(?:from\s*|require\s*\(\s*)['"](?:@expo\/vector-icons|react-native-vector-icons|expo-symbols)/);
    }
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
