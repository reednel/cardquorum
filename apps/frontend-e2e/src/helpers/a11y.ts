import { AxeBuilder } from '@axe-core/playwright';
import { Page } from '@playwright/test';

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;

/**
 * Run axe-core WCAG 2.1 AA audit on the current page.
 * Returns the full axe results for assertion in tests.
 */
export async function checkAccessibility(page: Page): Promise<AxeResults> {
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag21aa']).analyze();
}

/**
 * Format axe violations into a readable string for test failure messages.
 */
export function formatViolations(violations: AxeResults['violations']): string {
  return violations
    .map((violation) => {
      const nodes = violation.nodes.map((node) => `    - ${node.html}`).join('\n');
      return `  Rule: ${violation.id} (${violation.impact})\n  Help: ${violation.help}\n  Affected elements:\n${nodes}`;
    })
    .join('\n\n');
}
