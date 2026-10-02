import React from 'react';
import fs from 'fs';
import path from 'path';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { getConfig } from '@expo/config';
import { parse } from '@babel/parser';
import AppTextInput from '../../src/components/AppTextInput';
import MessageComposer from '../../src/components/MessageComposer';
import DiscussionComposer from '../../src/components/DiscussionComposer';
import BackHeader from '../../src/components/BackHeader';
import { CARD_SURFACE, COLORS, TYPOGRAPHY } from '../../src/utils/config';

const projectRoot = path.resolve(__dirname, '../..');
const readSource = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

// Audit runtime JavaScript only: native metadata and generated artwork have
// their own serialization requirements; the shared token catalog defines values.
const runtimeModules = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const filename = path.join(directory, entry.name);
  if (entry.isDirectory()) return entry.name === 'assets' ? [] : runtimeModules(filename);
  if (!entry.name.endsWith('.js') || filename.endsWith('/utils/config.js')) return [];
  return [{ filename: path.relative(projectRoot, filename), ast: parse(fs.readFileSync(filename, 'utf8'), { sourceType: 'module', plugins: ['jsx'] }) }];
});
const visit = (node, callback) => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach(child => visit(child, callback));
  if (node.type) callback(node);
  Object.values(node).forEach(child => visit(child, callback));
};

describe('Phase 1 design foundations', () => {
  it('keeps effective Expo appearance and the committed native iOS appearance light', () => {
    // Effective config also catches a future app.config.js overriding app.json.
    const { exp } = getConfig(projectRoot);
    expect(exp.userInterfaceStyle).toBe('light');
    expect(exp.ios?.userInterfaceStyle || exp.userInterfaceStyle).toBe('light');
    expect(exp.backgroundColor).toBe(COLORS.background);
    expect(readSource('ios/Borrowhood/Info.plist')).toMatch(
      /<key>UIUserInterfaceStyle<\/key>\s*<string>Light<\/string>/,
    );
    const nativeBackground = (0xff000000 + parseInt(COLORS.background.slice(1), 16)) >>> 0;
    expect(readSource('ios/Borrowhood/Info.plist')).toContain(`<integer>${nativeBackground}</integer>`);
    const { setStrings, resolveProps } = require('expo-system-ui/plugin/build/withAndroidUserInterfaceStyle');
    const androidStrings = setStrings({ resources: { string: [] } }, resolveProps(exp));
    expect(androidStrings.resources.string).toContainEqual({
      $: { name: 'expo_system_ui_user_interface_style', translatable: 'false' }, _: 'light',
    });
  });

  it.each([
    ['a form input', AppTextInput, { accessibilityLabel: 'Input' }, 'Input'],
    ['a direct or neighborhood message', MessageComposer, {}, 'Message'],
    ['a public comment', DiscussionComposer, {}, 'Comment'],
  ])('uses a native light keyboard for %s without changing text options', (_name, Component, props, label) => {
    const screen = render(<Component value="Draft" onChangeText={jest.fn()} autoCorrect {...props} />);
    const input = screen.getByLabelText(label);
    expect(input.props.keyboardAppearance).toBe('light');
    expect(input.props.maxFontSizeMultiplier).toBe(1.4);
    expect(input.props.value).toBe('Draft');
    expect(input.props.autoCorrect).toBe(true);
  });

  it('uses loaded DM Sans faces with matching weights and consistent semantic roles', () => {
    const fontRegistration = readSource('App.js').match(/useFonts\s*\(\s*\{([\s\S]*?)\}\s*\)/)?.[1];
    expect(fontRegistration).toBeTruthy();
    for (const [name, style] of Object.entries(TYPOGRAPHY)) {
      const face = style.fontFamily?.match(/^DMSans_(400Regular|500Medium|600SemiBold|700Bold)$/);
      expect({ name, face: !!face }).toEqual({ name, face: true });
      expect(style.fontWeight).toBe(face[1].slice(0, 3));
      expect(fontRegistration).toContain(style.fontFamily);
      expect(style.fontSize).toBeGreaterThan(0);
    }
    expect(TYPOGRAPHY.body.fontWeight).toBe('400');
    for (const name of ['headline', 'button', 'buttonSmall', 'buttonCaption', 'label', 'badge']) {
      expect(TYPOGRAPHY[name].fontWeight).toBe('500');
    }
    for (const name of ['largeTitle', 'title2', 'title3', 'h1', 'h2', 'h3']) {
      expect(TYPOGRAPHY[name].fontWeight).toBe('600');
    }
  });

  it('gives the shared card surface a subtle boundary and soft shadow against the page', () => {
    expect(CARD_SURFACE.backgroundColor).toBe(COLORS.surface);
    expect(CARD_SURFACE.backgroundColor).not.toBe(COLORS.background);
    expect(CARD_SURFACE.borderRadius).toBeGreaterThan(0);
    expect(CARD_SURFACE.borderWidth).toBeGreaterThan(0);
    expect(CARD_SURFACE.borderWidth).toBeLessThanOrEqual(1);
    expect([COLORS.border, COLORS.borderLight]).toContain(CARD_SURFACE.borderColor);
    expect(CARD_SURFACE.shadowOpacity).toBeGreaterThan(0);
    expect(CARD_SURFACE.shadowOpacity).toBeLessThanOrEqual(0.15);
  });

  it('keeps runtime font sizes and color values in the shared token catalog', () => {
    const exceptions = [];
    for (const { filename, ast } of runtimeModules(path.join(projectRoot, 'src'))) {
      visit(ast, node => {
        const key = node.key?.name || node.key?.value;
        if (node.type === 'ObjectProperty' && key === 'fontSize' && node.value?.type === 'NumericLiteral') {
          exceptions.push(`${filename}:${node.loc.start.line} raw fontSize`);
        }
        if (node.type === 'StringLiteral' && /^(?:#[0-9a-f]{3,8}$|rgba?\()/i.test(node.value)) {
          exceptions.push(`${filename}:${node.loc.start.line} raw color`);
        }
      });
    }
    expect(exceptions).toEqual([]);
  });

  it('routes native text inputs through the shared keyboard defaults', () => {
    const bypasses = [];
    for (const { filename, ast } of runtimeModules(path.join(projectRoot, 'src'))) {
      if (filename === 'src/components/AppTextInput.js') continue;
      visit(ast, node => {
        if (node.type === 'ImportDeclaration' && node.source.value === 'react-native'
          && node.specifiers.some(specifier => specifier.imported?.name === 'TextInput')) {
          bypasses.push(filename);
        }
      });
    }
    expect(bypasses).toEqual([]);
  });

  it('caps a compact navigation heading while retaining its compact label face', () => {
    const navigation = { canGoBack: () => true, goBack: jest.fn() };
    const screen = render(<BackHeader navigation={navigation} title="Comments" />);
    const title = screen.getByText('Comments');
    expect(title.props.maxFontSizeMultiplier).toBe(1.4);
    expect(StyleSheet.flatten(title.props.style).fontFamily).toBe(TYPOGRAPHY.headline.fontFamily);
    expect(StyleSheet.flatten(title.props.style).fontWeight).toBe('500');
    expect(StyleSheet.flatten(title.props.style).fontSize).toBe(TYPOGRAPHY.headline.fontSize);
  });
});
