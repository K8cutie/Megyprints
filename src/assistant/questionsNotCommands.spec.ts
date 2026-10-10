import { describe, it, expect } from 'vitest';
import { parseIntent, INFO_QUESTION } from './intentParser';
import { TEXT_HELP } from './actionEngine';

/* ══════════════════════════════════════════════════════════════════════════
   A QUESTION IS NOT A COMMAND (1-star testers round 2, PI-5): "How do I edit
   the text box on this page?" made Megy reply "Text added. Double-click it on
   the canvas to edit." and drop a "Double click to edit" box that ran off the
   page — add_text's "text box" tied help's "how do i" and won the tie.
   ══════════════════════════════════════════════════════════════════════════ */

describe('a how / what / why question is answered, never acted on', () => {
  it.each([
    'How do I edit the text box on this page?',
    'how can I add a caption?',
    'What does shuffle layout do?',
    'Why is there an empty frame here?',
    'how to delete a page',
    'Hi Megy, how do I change the background?',
  ])('"%s" → help, not a change', (q) => {
    const { intent } = parseIntent(q);
    expect(intent.type).toBe('help');
  });
  it('the text-box question gets the text-box answer', () => {
    const { intent } = parseIntent('How do I edit the text box on this page?');
    expect(intent.payload?.topic).toBe('text');
    expect(TEXT_HELP).toMatch(/^To edit a text box, tap it on the page/);
  });
});

describe('commands — and requests phrased as questions — still act', () => {
  it.each([
    ['add a text box', 'add_text'],
    ['Can you add a text box here?', 'add_text'],
    ['please shuffle the layout', 'shuffle_layout'],
    ['delete page', 'delete_page'],
    ['undo', 'undo'],
  ])('"%s" → %s', (msg, type) => {
    expect(parseIntent(msg).intent.type).toBe(type);
  });
  it('a question that only moves around still moves: "where is page 5?"', () => {
    const { intent } = parseIntent('where is page 5?');
    expect(intent.type).toBe('go_to_page');
    expect(intent.payload?.pageIndex).toBe(4);
  });
  it('the question pattern itself', () => {
    expect(INFO_QUESTION.test('how do i edit this')).toBe(true);
    expect(INFO_QUESTION.test('can you add a caption')).toBe(false);
    expect(INFO_QUESTION.test('howdy add text')).toBe(false); // whole words only
  });
});
