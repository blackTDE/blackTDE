import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { isMermaidClass } from '../src/markdown.ts';

test('renders GitHub-flavored Markdown tables', () => {
  const markdown = '| A | B |\n|---|---|\n| 1 | 2 |';
  const html = renderToStaticMarkup(
    createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, markdown),
  );
  assert.match(html, /<table>/);
  assert.match(html, /<td>1<\/td>/);
});

test('recognizes only fenced Mermaid code blocks', () => {
  assert.equal(isMermaidClass('language-mermaid'), true);
  assert.equal(isMermaidClass('language-typescript'), false);
  assert.equal(isMermaidClass(undefined), false);
});
