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
  reasoning?: string;
}

export interface Observation {
  url: string;
  title: string;
  text: string;
  elements: Array<{
    role: string;
    text: string;
    selector: string;
    rect: { x: number; y: number; width: number; height: number };
  }>;
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
  async plan(goal: Goal, observation?: Observation): Promise<Plan> {
    log.info(`Planning for goal: ${goal.description}`);

    const steps: WorkflowStep[] = [];
    const desc = goal.description.toLowerCase();

    // If we have an observation, we can be much smarter
    if (observation) {
      return this.planWithObservation(goal, observation);
    }

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
        // If not on a search engine, navigate to one first or use the current page's search
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

  /**
   * Plan based on what we actually see on the page.
   */
  private async planWithObservation(goal: Goal, obs: Observation): Promise<Plan> {
    const steps: WorkflowStep[] = [];
    const desc = goal.description.toLowerCase();
    let reasoning = `Observing ${obs.url}: ${obs.title}. `;

    // Pattern: Looking for something specific in the text
    if (desc.includes('check if') || desc.includes('verify')) {
      const target = desc.split('verify')[1] || desc.split('check if')[1];
      if (obs.text.toLowerCase().includes(target.trim().toLowerCase())) {
        reasoning += `Found "${target.trim()}" in page content. Goal likely complete.`;
      } else {
        reasoning += `Could not find "${target.trim()}" on current page.`;
        // Suggest scrolling or clicking a link
        const links = obs.elements.filter(e => e.role === 'link');
        if (links.length > 0) {
          steps.push({
            id: 'explore-link-1',
            type: 'click',
            params: { locator: { by: 'text', value: links[0].text } },
            description: `Explore link: ${links[0].text}`
          });
        }
      }
    }

    // Pattern: Click a specific button
    if (desc.includes('click on') || desc.includes('press')) {
      const btnText = desc.split('click on')[1] || desc.split('press')[1];
      const btn = obs.elements.find(e =>
        (e.role === 'button' || e.role === 'link') &&
        e.text.toLowerCase().includes(btnText.trim().toLowerCase())
      );

      if (btn) {
        steps.push({
          id: 'click-step-1',
          type: 'click',
          params: { locator: { by: 'selector', value: btn.selector } },
          description: `Click ${btn.text} (${btn.role})`
        });
      }
    }

    return {
      goal,
      steps,
      estimatedDifficulty: steps.length > 0 ? 'medium' : 'high',
      reasoning
    };
  }

  /**
   * High-level reasoning for the next best action.
   */
  async reason(goal: Goal, observation: Observation): Promise<{ thought: string; recommendation: WorkflowStep | null }> {
    const plan = await this.planWithObservation(goal, observation);
    return {
      thought: plan.reasoning || 'I am analyzing the page to find the next step.',
      recommendation: plan.steps[0] || null
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
