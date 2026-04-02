'use strict';

const fc = require('fast-check');
const { describe, test, expect, beforeEach, afterEach, jest: jestGlobal } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

function loadAnalysisPanel() {
  delete global.AnalysisPanel;
  delete global.window.AnalysisPanel;
  const code = fs.readFileSync(path.join(__dirname, '../src/ui/analysis-panel.js'), 'utf8');
  eval(code);
}

// Arbitrary for generating category objects
const categoryArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }).map(s => 'cat-' + s.replace(/[^a-zA-Z0-9]/g, 'x')),
  name: fc.string({ minLength: 1, maxLength: 20 }).map(s => s.replace(/[<>&"]/g, 'x')),
  emoji: fc.constantFrom('📧', '🛒', '💼', '🔒', '📦'),
  color: fc.constantFrom('#4285f4', '#e65100', '#00897b', '#d32f2f'),
  bgColor: fc.constantFrom('#e8f0fe', '#ffe0b2', '#e0f2f1', '#ffebee')
});

// Arbitrary for generating email objects
const emailArb = fc.record({
  id: fc.integer({ min: 0, max: 999 }).map(n => String(n)),
  subject: fc.string({ minLength: 1, maxLength: 40 }).map(s => s.replace(/[<>&"]/g, 'x')),
  sender: fc.string({ minLength: 1, maxLength: 20 }).map(s => s.replace(/[<>&"]/g, 'x')),
  senderEmail: fc.string({ minLength: 1, maxLength: 30 }).map(s => s.replace(/[<>&"@]/g, 'x') + '@test.com'),
  row: fc.constant(null)
});

// Generate a Map of groups (categoryId → { category, emails })
const groupsArb = fc.array(
  fc.tuple(categoryArb, fc.array(emailArb, { minLength: 1, maxLength: 10 })),
  { minLength: 0, maxLength: 5 }
).map(pairs => {
  const m = new Map();
  pairs.forEach(([cat, emails]) => {
    m.set(cat.id, { category: cat, emails });
  });
  return m;
});

describe('AnalysisPanel Property Tests', () => {
  let mockPlatform;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    delete global.AnalysisPanel;
    delete global.window.AnalysisPanel;
    delete global.window.getPopupIconSvg;

    mockPlatform = {
      getName: () => 'Gmail',
      deleteEmails: jestGlobal.fn().mockResolvedValue(true),
      moveToLabel: jestGlobal.fn().mockResolvedValue(true)
    };

    loadAnalysisPanel();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ── Property 5: Loading indicator presence matches isLoading flag ──────
  // **Validates: Requirements 3.2, 3.3**
  describe('Property 5: Loading indicator presence matches isLoading flag', () => {
    test('loading indicator present iff isLoading is true', () => {
      fc.assert(
        fc.property(
          groupsArb,
          fc.boolean(),
          (groups, isLoading) => {
            document.body.innerHTML = '';
            loadAnalysisPanel();

            const panel = new AnalysisPanel(mockPlatform);
            panel.show(groups, [], { isLoading });

            const loadingRow = document.querySelector('.aegis-loading-row');
            const emptyLoading = document.querySelector('.aegis-empty-state');

            if (groups.size === 0) {
              // Empty state: loading shown via empty-state div with animation
              if (isLoading) {
                expect(emptyLoading).not.toBeNull();
                expect(emptyLoading.innerHTML).toContain('分類');
              }
              // No loading row when empty
            } else {
              // Non-empty: loading row present iff isLoading
              if (isLoading) {
                expect(loadingRow).not.toBeNull();
              } else {
                expect(loadingRow).toBeNull();
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ── Property 6: Scroll position and checkbox state preserved across re-renders ──
  // **Validates: Requirements 3.4**
  describe('Property 6: Scroll position and checkbox state preserved across re-renders', () => {
    test('scroll position and checkbox states preserved after re-render', () => {
      fc.assert(
        fc.property(
          // Generate non-empty groups for meaningful checkbox tests
          fc.array(
            fc.tuple(categoryArb, fc.array(emailArb, { minLength: 1, maxLength: 5 })),
            { minLength: 1, maxLength: 3 }
          ).map(pairs => {
            const m = new Map();
            pairs.forEach(([cat, emails]) => m.set(cat.id, { category: cat, emails }));
            return m;
          }),
          fc.integer({ min: 0, max: 500 }),
          (groups, scrollPos) => {
            document.body.innerHTML = '';
            loadAnalysisPanel();

            const panel = new AnalysisPanel(mockPlatform);

            // First render
            panel.show(groups, [], { isLoading: true });

            const body = document.querySelector('#aegis-panel-body');
            if (!body) return; // skip if no body

            // Set scroll position
            // jsdom doesn't truly scroll, but scrollTop is settable
            body.scrollTop = scrollPos;

            // Set random checkbox states
            const savedStates = new Map();
            const checkboxes = document.querySelectorAll('.aegis-email-item');
            checkboxes.forEach(item => {
              const cb = item.querySelector('.aegis-email-checkbox');
              const id = item.dataset.emailId;
              if (cb && id) {
                const checked = Math.random() > 0.5;
                cb.checked = checked;
                savedStates.set(id, checked);
              }
            });

            // Re-render with same groups (incremental update)
            panel.show(groups, [], { isLoading: false });

            // Verify scroll position preserved
            const newBody = document.querySelector('#aegis-panel-body');
            if (newBody) {
              expect(newBody.scrollTop).toBe(scrollPos);
            }

            // Verify checkbox states preserved for emails that still exist
            const newCheckboxes = document.querySelectorAll('.aegis-email-item');
            newCheckboxes.forEach(item => {
              const cb = item.querySelector('.aegis-email-checkbox');
              const id = item.dataset.emailId;
              if (cb && id && savedStates.has(id)) {
                expect(cb.checked).toBe(savedStates.get(id));
              }
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
