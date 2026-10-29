import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Children, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../src/components/ui/dialog';

function renderContent(asChild: boolean, showCloseButton: boolean) {
  const content = DialogContent({
    asChild,
    forceMount: true,
    showCloseButton,
    children: createElement('section', { className: 'chatbot-panel' },
      createElement(DialogTitle, null, 'Assistant NLP'),
      createElement(DialogDescription, null, 'Lecture seule')),
  });
  // SSR does not mount portals. Render the actual Content from the wrapper
  // directly under its real Radix context, without a DOM, browser or transport.
  const primitiveContent = Children.toArray(content.props.children)[1];
  return renderToStaticMarkup(createElement(Dialog, { open: true, modal: false }, primitiveContent));
}

test('chatbot asChild content renders its section when the generated close button is disabled', () => {
  const html = renderContent(true, false);
  assert.match(html, /<section[^>]*role="dialog"/);
  assert.match(html, /class="[^"]*chatbot-panel/);
  assert.match(html, /Assistant NLP/);
  assert.doesNotMatch(html, /data-slot="dialog-close"/);
});

test('asChild content can include the generated close button within its single target', () => {
  const html = renderContent(true, true);
  assert.match(html, /<section[^>]*role="dialog"/);
  assert.match(html, /data-slot="dialog-close"/);
});

test('regular dialogs retain their default content and generated close button', () => {
  const html = renderContent(false, true);
  assert.match(html, /<div[^>]*role="dialog"/);
  assert.match(html, /data-slot="dialog-close"/);
});
