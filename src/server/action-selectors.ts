export const ACTION_SELECTORS: Record<string, string[]> = {
  apr: ['button.ui-shell-tool-call__run-btn', '.composer-tool-call-status-row .anysphere-button.composer-run-button'],
  rej: ['button.ui-shell-tool-call__skip-btn', '.composer-skip-button'],
  all: ['button.ui-shell-tool-call__allowlist-button', '.composer-tool-call-status-row .anysphere-secondary-button.composer-run-button'],
  run: ['button.ui-shell-tool-call__run-btn', '.composer-tool-call-status-row .anysphere-button.composer-run-button'],
  skp: ['button.ui-shell-tool-call__skip-btn', '.composer-skip-button'],
  alw: ['button.ui-shell-tool-call__allowlist-button', '.composer-tool-call-status-row .anysphere-secondary-button.composer-run-button'],
  bld: ['.composer-create-plan-build-button'],
  vpl: ['.composer-create-plan-view-plan-button'],
};

export function resolveStableActionSelector(action: string): string | undefined {
  const candidates = ACTION_SELECTORS[action];
  if (!candidates || candidates.length === 0) return undefined;
  return candidates.join(', ');
}

export function resolveSelectorPath(selectorPath: string): string {
  if (!selectorPath.startsWith('stable:')) return selectorPath;
  return resolveStableActionSelector(selectorPath.slice('stable:'.length)) ?? selectorPath;
}
