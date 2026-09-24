import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(file) : file.endsWith('.tsx') ? [file] : [];
  });
}
test('native layout containers do not contain literal text children', () => {
  const issues = [];
  for (const file of [...filesIn('app'), ...filesIn('src')]) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isJsxElement(node)) {
        const tag = node.openingElement.tagName.getText(source);
        if (!['Text', 'Label', 'Animated.Text'].includes(tag)) {
          for (const child of node.children) {
            const literal = ts.isJsxText(child) ? child.text.trim().length > 0 :
              ts.isJsxExpression(child) && child.expression &&
              (ts.isStringLiteral(child.expression) || ts.isNumericLiteral(child.expression));
            if (literal) { const location = source.getLineAndCharacterOfPosition(child.getStart(source)); issues.push(`${file}:${location.line + 1} text directly inside ${tag}`); }
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(issues, [], issues.join('\n'));
});
