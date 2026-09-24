import 'dotenv/config';
import { loadConfig } from '../src/server/config.js';
import { MODEL_MENU_LOOKUP_JS, MODEL_ITEM_HELPERS_JS } from '../src/server/command-executor.js';

interface CDPTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

// Opens the Cursor model picker via the new + legacy trigger selectors,
// navigates into the Model submenu when needed, then dumps model rows.
//
// Usage: npm run discover -- model-picker
// or:    npx tsx scripts/probe-model-picker.ts [--window <substring>]

const TRIGGER_SELECTORS = [
  '.composer-bar-input-buttons button[aria-haspopup="menu"]',
  '.ui-model-picker__trigger',
  '.composer-unified-dropdown-model',
];

async function main() {
  const args = process.argv.slice(2);
  const windowFilter = args.find((_, i, a) => a[i - 1] === '--window') ?? '';

  const config = loadConfig();
  const resp = await fetch(`${config.cdpUrl}/json`);
  const targets = await resp.json() as CDPTarget[];
  const pages = targets.filter((t) => t.type === 'page' && t.url.includes('workbench'));
  if (pages.length === 0) {
    console.error('[probe-model-picker] No workbench page targets found at', config.cdpUrl);
    process.exit(2);
  }
  let target = pages[0];
  if (windowFilter) {
    const m = pages.find((p) => p.title.toLowerCase().includes(windowFilter.toLowerCase()));
    if (m) target = m;
  }
  console.log(`[probe-model-picker] Probing "${target.title}"`);

  const { CdpClient } = await import('../src/server/cdp-client.js');
  const client = new CdpClient();
  await client.connect(target.webSocketDebuggerUrl!);

  const triggerReport = await client.evaluate(`
    (() => {
      const out = {};
      for (const sel of ${JSON.stringify(TRIGGER_SELECTORS)}) {
        const els = document.querySelectorAll(sel);
        out[sel] = {
          count: els.length,
          first: els[0] ? (els[0].outerHTML || '').slice(0, 400) : null,
          text: els[0] ? (els[0].textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60) : null,
          ariaControls: els[0] ? els[0].getAttribute('aria-controls') : null,
          ariaExpanded: els[0] ? els[0].getAttribute('aria-expanded') : null,
        };
      }
      return out;
    })()
  `) as Record<string, { count: number; first: string | null; text: string | null; ariaControls: string | null; ariaExpanded: string | null }>;
  console.log('\n--- Trigger selectors (before click) ---');
  console.log(JSON.stringify(triggerReport, null, 2));

  const clicked = await client.evaluate(`
    (() => {
      for (const sel of ${JSON.stringify(TRIGGER_SELECTORS)}) {
        const els = document.querySelectorAll(sel);
        for (const el of Array.from(els)) {
          const cId = el.getAttribute('id') || '';
          if (cId.startsWith('plan-exec-model')) continue;
          el.click();
          return sel;
        }
      }
      return null;
    })()
  `) as string | null;
  console.log(`\nClicked: ${clicked ?? 'NOTHING (no trigger matched)'}`);
  if (!clicked) {
    process.exit(3);
  }

  await new Promise((r) => setTimeout(r, 400));

  const submenuOpened = await client.evaluate(`
    (() => {
      ${MODEL_MENU_LOOKUP_JS}
      if (findModelSelectionMenu()) return 'already-open';
      return openModelSubmenuIfNeeded() ? 'opened-submenu' : 'no-submenu';
    })()
  `) as string;
  console.log(`\nModel submenu: ${submenuOpened}`);
  await new Promise((r) => setTimeout(r, 400));

  const menuReport = await client.evaluate(`
    (() => {
      ${MODEL_MENU_LOOKUP_JS}
      ${MODEL_ITEM_HELPERS_JS}
      const menu = findModelMenu();
      const out = {
        menuFound: !!menu,
        menuLabel: menu ? menu.getAttribute('aria-label') : null,
        options: menu ? collectModelItems(menu) : [],
      };
      return out;
    })()
  `) as { menuFound: boolean; menuLabel: string | null; options: Array<{ id: string; label: string; selected: boolean }> };
  console.log('\n--- Model selection menu ---');
  console.log(JSON.stringify(menuReport, null, 2));

  await client.pressKey('Escape', 'Escape', 27);
  await client.disconnect();
  console.log('\n[probe-model-picker] done.');
}

main().catch((err) => {
  console.error('[probe-model-picker]', err);
  process.exit(1);
});
