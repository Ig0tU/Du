import { describe, it, expect, beforeEach } from 'vitest';
import { HeuristicPlanner } from '../planner';

describe('HeuristicPlanner', () => {
  let planner: HeuristicPlanner;

  beforeEach(() => {
    planner = new HeuristicPlanner();
  });

  describe('plan()', () => {
    it('creates a navigation plan for URL goals', async () => {
      const plan = await planner.plan({ description: 'Go to https://example.com' });
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].type).toBe('navigate');
      expect(plan.steps[0].params.url).toBe('https://example.com');
    });

    it('creates a search plan', async () => {
      const plan = await planner.plan({ description: 'Search for pizza' });
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].type).toBe('type');
      expect(plan.steps[0].params.text).toBe('pizza');
    });

    it('uses observations for smarter planning', async () => {
      const observation = {
        url: 'https://example.com',
        title: 'Example Domain',
        text: 'This is an example domain. More information...',
        elements: [
          { role: 'link', text: 'More information', selector: 'a', rect: { x: 0, y: 0, width: 100, height: 20 } }
        ]
      };

      const plan = await planner.plan({ description: 'Click on More information' }, observation);
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].type).toBe('click');
      expect(plan.steps[0].params.locator).toEqual({ by: 'selector', value: 'a' });
    });
  });

  describe('reason()', () => {
    it('provides reasoning and recommendation', async () => {
      const observation = {
        url: 'https://test.com',
        title: 'Test',
        text: 'Hello world',
        elements: []
      };

      const result = await planner.reason({ description: 'verify hello' }, observation);
      expect(result.thought).toContain('Found "hello"');
      expect(result.recommendation).toBeNull();
    });
  });
});
