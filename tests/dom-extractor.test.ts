import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { extractionFunction } from '../src/server/dom-extractor.js';
import type { CursorState } from '../src/server/types.js';

function withDom(
  html: string,
  options: { approveTextMatch?: string[]; rejectTextMatch?: string[] } = {}
): CursorState {
  const dom = new JSDOM(html);
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const nodeDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Node');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: dom.window.document,
  });
  Object.defineProperty(globalThis, 'Node', {
    configurable: true,
    value: dom.window.Node,
  });
  try {
    const state = extractionFunction(
      ['#root'],
      [],
      options.approveTextMatch ?? [],
      [],
      options.rejectTextMatch ?? [],
      [],
      [],
      [],
      [],
      [],
      []
    );
    assert.ok(state, 'expected extractionFunction to return state');
    return state;
  } finally {
    if (documentDescriptor) {
      Object.defineProperty(globalThis, 'document', documentDescriptor);
    } else {
      delete globalThis.document;
    }
    if (nodeDescriptor) {
      Object.defineProperty(globalThis, 'Node', nodeDescriptor);
    } else {
      delete globalThis.Node;
    }
  }
}

describe('extractionFunction', () => {
  it('emits Cursor 3.8 activity tool-placeholder rows without data-message-role', () => {
    const state = withDom(`
      <main id="root">
        <div data-find-row-key="tool-placeholder:call-1">
          <article data-flat-index="0" data-react-transcript-row-kind="activity" data-message-id="m-tool">
            <div data-tool-call-id="call-1" data-tool-status="completed">
              <span class="ui-tool-call-line-action">Read</span>
              <span class="ui-tool-call-line-details">src/server/dom-extractor.ts</span>
            </div>
          </article>
        </div>
      </main>
    `);

    const tool = state.messages.find((message) => message.type === 'tool');

    assert.ok(tool, 'expected a tool element to be emitted');
    assert.equal(tool.toolCallId, 'call-1');
    assert.equal(tool.action, 'Read');
  });

  it('uses anchored selector paths for data-click-ready questionnaire actions', () => {
    const state = withDom(`
      <main id="root"></main>
      <div id="composer-toolbar-section">
        <div class="composer-questionnaire-toolbar">
          <div class="composer-questionnaire-toolbar-stepper-label">1 of 1</div>
          <section class="composer-questionnaire-toolbar-actions">
            <div data-click-ready="true">
              <span><span class="truncate">Skip</span></span>
            </div>
            <div class="shortcut">Esc</div>
            <div data-click-ready="true" data-disabled="true">
              <span><span class="truncate">Continue</span></span>
            </div>
          </section>
        </div>
      </div>
    `);

    assert.ok(state.questionnaire);
    assert.equal(
      state.questionnaire.skipSelectorPath,
      '.composer-questionnaire-toolbar-actions > div[data-click-ready]:nth-child(1)'
    );
    assert.equal(
      state.questionnaire.continueSelectorPath,
      '.composer-questionnaire-toolbar-actions > div[data-click-ready]:nth-child(3)'
    );
    assert.equal(state.questionnaire.continueDisabled, true);
  });

  it('emits anchored option-row selector paths for questionnaire options (public#50)', () => {
    const state = withDom(`
      <main id="root"></main>
      <div id="composer-toolbar-section">
        <div class="composer-questionnaire-toolbar">
          <div class="composer-questionnaire-toolbar-stepper-label">1 of 1</div>
          <div class="composer-questionnaire-toolbar-questions">
            <div class="composer-questionnaire-toolbar-question composer-questionnaire-toolbar-question-active">
              <div class="composer-questionnaire-toolbar-question-number">1.</div>
              <div class="composer-questionnaire-toolbar-options">
                <div class="composer-questionnaire-toolbar-option" role="button">
                  <button class="composer-questionnaire-toolbar-option-letter" type="button">A</button>
                  <span class="composer-questionnaire-toolbar-option-label">Explore the codebase</span>
                </div>
                <div class="composer-questionnaire-toolbar-option composer-questionnaire-toolbar-option-freeform" role="button">
                  <button class="composer-questionnaire-toolbar-option-letter" type="button">B</button>
                  <textarea class="composer-questionnaire-toolbar-freeform-input"></textarea>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `);

    assert.ok(state.questionnaire);
    const [question] = state.questionnaire.questions;
    assert.equal(question.options.length, 2);
    assert.equal(question.options[0].label, 'Explore the codebase');
    assert.equal(
      question.options[0].selectorPath,
      '.composer-questionnaire-toolbar-question:nth-of-type(1) .composer-questionnaire-toolbar-option:nth-of-type(1)'
    );
    assert.equal(question.options[1].label, 'Other');
    assert.equal(question.options[1].isFreeform, true);
    assert.equal(
      question.options[1].selectorPath,
      '.composer-questionnaire-toolbar-question:nth-of-type(1) .composer-questionnaire-toolbar-option:nth-of-type(2)'
    );
  });

  it('does not treat terminal log buttons as approvals when text contains "running"', () => {
    const state = withDom(
      `
      <main id="root">
        <button>[20] pipeline=2880520367 status=running sha=c5c1e851
[21] pipeline=2880520367 status=running sha=c5c1e851</button>
      </main>
    `,
      { approveTextMatch: ['Accept', 'Approve', 'Run', 'Allow', 'Accept All'] }
    );

    assert.equal(state.pendingApprovals.length, 0);
    assert.notEqual(state.agentStatus, 'waiting_approval');
  });

  it('extracts Build when label includes glued keyboard shortcut (BuildCtrl+⏎)', () => {
    const state = withDom(`
      <main id="root">
        <div class="ui-tool-call-card">
          <div class="ui-tool-call-card__header">Shortcut Build Plan</div>
          <div class="ui-tool-call-card__body">
            <button type="button">View Plan</button>
            <button type="button">BuildCtrl+⏎</button>
          </div>
        </div>
      </main>
    `);

    assert.ok(state.planReview?.buildSelectorPath);
    const plan = state.messages.find((message) => message.type === 'plan');
    assert.ok(plan?.actions?.some((action) => action.type === 'build'));
  });

  it('extracts Build from icon-only sibling button next to View Plan in tool-call-card', () => {
    const state = withDom(`
      <main id="root">
        <div class="ui-tool-call-card">
          <div class="ui-tool-call-card__header">Icon Build Plan</div>
          <div class="ui-tool-call-card__body">
            <div class="ui-action-row">
              <button type="button" aria-label="View Plan">View Plan</button>
              <button type="button" aria-label="Build"><span class="codicon"></span></button>
            </div>
          </div>
        </div>
      </main>
    `);

    assert.ok(state.planReview?.buildSelectorPath);
    const plan = state.messages.find((message) => message.type === 'plan');
    assert.ok(plan?.actions?.some((action) => action.type === 'build'));
  });

  it('extracts plan from Cursor 3.8 ui-tool-call-card with Build and View Plan buttons', () => {
    const state = withDom(`
      <main id="root">
        <div class="virtualized-composer-messages-row" data-find-row-key="activity:plan-1">
          <div class="agent-transcript-row agent-transcript-row-activity">
            <div class="ui-tool-call-card">
              <div class="ui-tool-call-card__header">Say Hi Plan</div>
              <div class="ui-tool-call-card__body">
                <button type="button">View Plan</button>
                <button type="button">Build</button>
              </div>
            </div>
          </div>
        </div>
      </main>
    `);

    assert.ok(state.planReview, 'expected planReview from tool-call-card');
    assert.match(state.planReview!.buildSelectorPath, /button/i);
    const plan = state.messages.find((message) => message.type === 'plan');
    assert.ok(plan, 'expected plan message');
    assert.equal(plan.title, 'Say Hi Plan');
    assert.ok(plan.actions?.some((action) => action.type === 'build'));
    assert.ok(plan.actions?.some((action) => action.type === 'view_plan'));
  });

  it('extracts .plan.md label from tool-call-card text when present', () => {
    const state = withDom(`
      <main id="root">
        <div class="virtualized-composer-messages-row" data-find-row-key="activity:plan-1">
          <div class="agent-transcript-row agent-transcript-row-activity">
            <div class="ui-tool-call-card">
              <div class="ui-tool-call-card__header">Say Hi Plan</div>
              <div class="ui-tool-call-card__body">
                <div class="markdown-root">Saved to say_hi.plan.md</div>
                <button type="button">View Plan</button>
                <button type="button">Build</button>
              </div>
            </div>
          </div>
        </div>
      </main>
    `);

    const plan = state.messages.find((message) => message.type === 'plan');
    assert.ok(plan, 'expected plan message');
    assert.equal(plan!.label, 'say_hi.plan.md');
    assert.ok(state.planReview?.label === 'say_hi.plan.md');
  });

  it('does not set planReview when only View Plan remains after build', () => {
    const state = withDom(`
      <main id="root">
        <div class="virtualized-composer-messages-row" data-find-row-key="activity:plan-1">
          <div class="agent-transcript-row agent-transcript-row-activity">
            <div class="ui-tool-call-card">
              <div class="ui-tool-call-card__header">Say Hi Plan</div>
              <div class="ui-tool-call-card__body">
                <button type="button">View Plan</button>
              </div>
            </div>
          </div>
        </div>
      </main>
    `);

    assert.equal(state.planReview, null);
    const plan = state.messages.find((message) => message.type === 'plan');
    assert.ok(plan, 'expected plan message');
    assert.ok(plan.actions?.some((action) => action.type === 'view_plan'));
    assert.ok(!plan.actions?.some((action) => action.type === 'build'));
  });

  it('extracts planReview from composer toolbar when Build is outside the transcript', () => {
    const state = withDom(`
      <main id="root"></main>
      <div id="composer-toolbar-section">
        <button type="button">View Plan</button>
        <button type="button">Build</button>
      </div>
    `);

    assert.ok(state.planReview, 'expected planReview');
    assert.match(state.planReview!.buildSelectorPath, /button/i);
    assert.match(state.planReview!.viewPlanSelectorPath || '', /button/i);
  });

  it('extracts Build from composer toolbar when plan widget has no classed button', () => {
    const state = withDom(`
      <main id="root">
        <div data-flat-index="1" data-message-role="ai" data-message-kind="tool">
          <div class="composer-create-plan-container">
            <div class="composer-create-plan-title">Auth System</div>
            <div class="composer-create-plan-todo-item">
              <div class="composer-create-plan-todo-content">Add login endpoint</div>
            </div>
          </div>
        </div>
      </main>
      <div id="composer-toolbar-section">
        <button type="button">Build</button>
      </div>
    `);

    const plan = state.messages.find((message) => message.type === 'plan');
    assert.ok(plan, 'expected plan message');
    assert.ok(plan.actions?.some((action) => action.type === 'build'), 'expected Build action');
  });

  it('still matches real Run approval buttons via textMatch fallback', () => {
    const state = withDom(
      `
      <main id="root">
        <button>Run</button>
      </main>
    `,
      { approveTextMatch: ['Run'] }
    );

    assert.equal(state.pendingApprovals.length, 1);
    assert.equal(state.pendingApprovals[0].description, 'Run');
  });

  it('keeps buildSelectorPath selectors for legacy questionnaire actions', () => {
    const state = withDom(`
      <main id="root"></main>
      <div id="composer-toolbar-section">
        <div class="composer-questionnaire-toolbar">
          <section class="composer-questionnaire-toolbar-actions">
            <div class="composer-skip-button">Skip</div>
            <div class="composer-run-button" data-disabled="false">Continue</div>
          </section>
        </div>
      </div>
    `);

    assert.ok(state.questionnaire);
    assert.equal(
      state.questionnaire.skipSelectorPath,
      'div#composer-toolbar-section > div > section > div:nth-of-type(1)'
    );
    assert.equal(
      state.questionnaire.continueSelectorPath,
      'div#composer-toolbar-section > div > section > div:nth-of-type(2)'
    );
    assert.equal(state.questionnaire.continueDisabled, false);
  });
});
