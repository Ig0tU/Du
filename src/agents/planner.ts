import type { WorkflowStep } from '../workflow/engine';
import { createLogger } from '../utils/logger';

const log = createLogger('HeuristicPlanner');

export interface Goal {
  description: string;
  url?: string;
  priority?: number;
}

export interface Plan {
  goal: Goal;
  steps: WorkflowStep[];
  estimatedDifficulty: 'low' | 'medium' | 'high';
}

/**
 * HeuristicPlanner — Translates high-level user commands into executable browser plans.
 *
 * This is a rule-based heuristic engine that uses pattern matching and
 * browser context awareness to decompose goals.
 */
export class HeuristicPlanner {
  /**
   * Decompose a goal into a sequence of workflow steps.
   */
  async plan(goal: Goal, _context?: unknown): Promise<Plan> {
    log.info(`Planning for goal: ${goal.description}`);

    const steps: WorkflowStep[] = [];
    const desc = goal.description.toLowerCase();

    // Heuristic 1: Navigation
    if (goal.url || desc.includes('go to') || desc.includes('open') || desc.includes('visit')) {
      const url = goal.url || this.extractUrl(goal.description);
      if (url) {
        steps.push({
          id: 'nav-step-1',
          type: 'navigate',
          params: { url, waitForLoad: true },
          description: `Navigate to ${url}`
        });
      }
    }

    // Heuristic 2: Searching
    if (desc.includes('search for') || desc.includes('find')) {
      const query = this.extractSearchQuery(goal.description);
      if (query) {
        steps.push({
          id: 'search-step-1',
          type: 'type',
          params: {
            locator: { by: 'placeholder', value: 'Search' },
            text: query,
            submit: true
          },
          description: `Search for "${query}"`
        });
      }
    }

    // Heuristic 3: Authentication
    if (desc.includes('login') || desc.includes('sign in')) {
      steps.push({
        id: 'auth-step-1',
        type: 'wait',
        params: { duration: 5000, condition: 'element', selector: 'input[type="password"]' },
        description: 'Wait for login form'
      });
      // Further steps would be dynamically generated after observing the page
    }

    // Heuristic 4: Data Extraction
    if (desc.includes('extract') || desc.includes('get') || desc.includes('read')) {
       steps.push({
         id: 'extract-step-1',
         type: 'extract',
         params: { saveAs: 'extracted_content' },
         description: 'Extract page content'
       });
    }

    return {
      goal,
      steps,
      estimatedDifficulty: steps.length > 3 ? 'medium' : 'low'
    };
  }

  private extractUrl(text: string): string | undefined {
    const match = text.match(/https?:\/\/[^\s]+/);
    return match ? match[0] : undefined;
  }

  private extractSearchQuery(text: string): string | undefined {
    const markers = ['search for', 'find', 'look for'];
    for (const marker of markers) {
      const idx = text.toLowerCase().indexOf(marker);
      if (idx !== -1) {
        return text.substring(idx + marker.length).trim();
      }
    }
    return undefined;
  }
}
