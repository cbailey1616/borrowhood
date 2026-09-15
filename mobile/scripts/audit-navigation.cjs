const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

function auditNavigation(root = path.resolve(__dirname, '..')) {
  const visited = new Set();
  const routes = [];
  const calls = [];
  const controls = [];
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const code = fs.readFileSync(file, 'utf8');
    const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
    const location = node => ({ file: path.relative(root, file), line: node.loc.start.line });
    traverse(ast, {
      ImportDeclaration({ node }) {
        if (!node.source.value.startsWith('.')) return;
        const imported = path.resolve(path.dirname(file), node.source.value);
        const resolved = [imported, imported + '.js', path.join(imported, 'index.js')]
          .find(candidate => candidate.endsWith('.js') && fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        if (resolved) visit(resolved);
      },
      JSXOpeningElement({ node }) {
        const attrs = node.attributes.filter(attribute => attribute.type === 'JSXAttribute');
        const attr = name => attrs.find(attribute => attribute.name.name === name)?.value;
        if (node.name.type === 'JSXMemberExpression' && node.name.property.name === 'Screen' && attr('name')?.type === 'StringLiteral') {
          routes.push({ ...location(node), name: attr('name').value, hasIdentity: !!attr('getId') });
        }
        if (node.name.type === 'JSXIdentifier' && /Pressable|Touchable|Button|Swipeable/.test(node.name.name)) {
          controls.push({ ...location(node), component: node.name.name });
        }
      },
      CallExpression({ node }) {
        if (node.callee.type !== 'MemberExpression' || !['navigate', 'replace', 'push'].includes(node.callee.property.name)) return;
        const callee = code.slice(node.callee.start, node.callee.end);
        if (!/\b(navigation|navigationRef|nav)(\.current)?\.(navigate|replace|push)$/.test(callee)) return;
        const params = node.arguments[1];
        calls.push({ ...location(node), method: node.callee.property.name,
          destination: node.arguments[0]?.type === 'StringLiteral' ? node.arguments[0].value : null,
          keys: !params ? [] : params.type === 'ObjectExpression' && !params.properties.some(prop => prop.type === 'SpreadElement')
            ? params.properties.map(prop => prop.key?.name || prop.key?.value) : null,
        });
      },
    });
  }
  visit(path.join(root, 'App.js'));
  const names = new Set(routes.map(route => route.name));
  const required = { ListingDetail: ['id'], RequestDetail: ['id'], TransactionDetail: ['id'], UserProfile: ['id'], RequestQueue: ['listingId'], BorrowRequest: ['listing'], CircleDetail: ['circleId'] };
  const issues = calls.flatMap(call => {
    if (call.destination && !names.has(call.destination)) return [{ ...call, issue: 'Unregistered destination' }];
    if (call.keys && required[call.destination]?.some(key => !call.keys.includes(key))) return [{ ...call, issue: 'Missing required route parameter' }];
    return [];
  });
  return { modules: visited.size, routes, controls: controls.length, navigationCalls: calls.length, dynamicDestinations: calls.filter(call => !call.destination), issues };
}

module.exports = auditNavigation;
if (require.main === module) {
  const result = auditNavigation();
  console.log(JSON.stringify(result, null, 2));
  if (result.issues.length) process.exitCode = 1;
}
