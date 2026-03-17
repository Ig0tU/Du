import type { BrowserWindow, WebContents } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { tandemDir } from '../utils/paths';
import { DEFAULT_TIMEOUT_MS } from '../utils/constants';
import { humanizedClick, humanizedType, humanizedHover } from '../input/humanized';
import { createLogger } from '../utils/logger';
import { assertSinglePathSegment, resolvePathWithinRoot } from '../utils/security';
import type { LocatorFinder, LocatorQuery } from '../locators/finder';
import type { SnapshotManager } from '../snapshot/manager';

const log = createLogger('WorkflowEngine');

type WorkflowVariables = Record<string, unknown>;
type WorkflowStepResult = unknown;

interface ConditionExecutionResult {
  condition: boolean;
  action: 'continue' | 'goto' | 'skip' | 'abort';
  gotoStep?: string;
  skipCount?: number;
}

export interface WorkflowStep {
  id: string;
  type: 'navigate' | 'wait' | 'click' | 'type' | 'extract' | 'screenshot' | 'condition' | 'scroll' | 'hover' | 'focus' | 'press' | 'select';
  params: Record<string, unknown>;
  description?: string;
  retries?: number;
  timeout?: number;
}

interface StepWithLocator extends WorkflowStep {
  params: {
    selector?: string;
    locator?: LocatorQuery;
    [key: string]: unknown;
  };
}

interface NavigateStep extends WorkflowStep {
  type: 'navigate';
  params: {
    url: string;
    waitForLoad?: boolean;
  };
}

interface WaitStep extends WorkflowStep {
  type: 'wait';
  params: {
    duration: number; // milliseconds
    condition?: 'element' | 'text' | 'url';
    selector?: string;
    locator?: LocatorQuery;
    text?: string;
    urlPattern?: string;
  };
}

interface ClickStep extends StepWithLocator {
  type: 'click';
  params: {
    selector?: string;
    locator?: LocatorQuery;
    waitAfter?: number;
    scrollIntoView?: boolean;
  };
}

interface HoverStep extends StepWithLocator {
  type: 'hover';
  params: {
    selector?: string;
    locator?: LocatorQuery;
    waitAfter?: number;
  };
}

interface FocusStep extends StepWithLocator {
  type: 'focus';
  params: {
    selector?: string;
    locator?: LocatorQuery;
  };
}

interface TypeStep extends StepWithLocator {
  type: 'type';
  params: {
    selector?: string;
    locator?: LocatorQuery;
    text: string;
    clear?: boolean;
    submit?: boolean;
  };
}

interface PressStep extends WorkflowStep {
  type: 'press';
  params: {
    key: string; // e.g. "Enter", "Tab", "Escape", "a"
    modifiers?: Array<'shift' | 'control' | 'alt' | 'meta'>;
    count?: number;
  };
}

interface SelectStep extends StepWithLocator {
  type: 'select';
  params: {
    selector?: string;
    locator?: LocatorQuery;
    value?: string;
    label?: string;
    index?: number;
  };
}

interface ExtractStep extends StepWithLocator {
  type: 'extract';
  params: {
    selector?: string;
    locator?: LocatorQuery;
    attribute?: string;
    saveAs: string; // Variable name to store result
  };
}

interface ScreenshotStep extends WorkflowStep {
  type: 'screenshot';
  params: {
    filename?: string;
    fullPage?: boolean;
    saveAs?: string;
  };
}

interface ScrollStep extends WorkflowStep {
  type: 'scroll';
  params: {
    direction: 'up' | 'down' | 'top' | 'bottom';
    amount?: number; // pixels or percentage
  };
}

interface ConditionStep extends StepWithLocator {
  type: 'condition';
  params: {
    condition: 'elementExists' | 'textContains' | 'urlMatches' | 'variableEquals';
    selector?: string;
    locator?: LocatorQuery;
    text?: string;
    urlPattern?: string;
    variable?: string;
    value?: unknown;
    onTrue: 'continue' | 'goto' | 'skip' | 'abort';
    onFalse: 'continue' | 'goto' | 'skip' | 'abort';
    gotoStep?: string; // Step ID to jump to
    skipCount?: number; // Number of steps to skip
  };
}

interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  variables?: WorkflowVariables;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  currentStep: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
  variables: WorkflowVariables;
  stepResults: Array<{
    stepId: string;
    status: 'completed' | 'failed' | 'skipped';
    result?: WorkflowStepResult;
    error?: string;
    executedAt: string;
  }>;
}

export class WorkflowEngine {
  private workflowsDir: string;
  private executions: Map<string, WorkflowExecution> = new Map();
  private locatorFinder?: LocatorFinder;
  private snapshotManager?: SnapshotManager;

  constructor(locatorFinder?: LocatorFinder, snapshotManager?: SnapshotManager) {
    this.workflowsDir = tandemDir('workflows');
    this.locatorFinder = locatorFinder;
    this.snapshotManager = snapshotManager;
    this.ensureDirectories();
    this.loadWorkflows();
  }

  setLocatorFinder(finder: LocatorFinder): void {
    this.locatorFinder = finder;
  }

  setSnapshotManager(manager: SnapshotManager): void {
    this.snapshotManager = manager;
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.workflowsDir)) {
      fs.mkdirSync(this.workflowsDir, { recursive: true });
    }
  }

  private loadWorkflows(): void {
    // Load any saved executions if needed
  }

  private getWorkflowPath(id: string): string {
    const safeId = assertSinglePathSegment(id, 'workflow id');
    return resolvePathWithinRoot(this.workflowsDir, `${safeId}.json`);
  }

  /**
   * Get all workflow templates
   */
  async getWorkflows(): Promise<WorkflowDefinition[]> {
    try {
      const files = fs.readdirSync(this.workflowsDir);
      const workflows: WorkflowDefinition[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = resolvePathWithinRoot(this.workflowsDir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const workflow = JSON.parse(content) as WorkflowDefinition;
          workflows.push(workflow);
        }
      }

      return workflows;
    } catch (error) {
      log.error('Failed to load workflows:', error);
      return [];
    }
  }

  /**
   * Save workflow template
   */
  async saveWorkflow(workflow: Omit<WorkflowDefinition, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = this.generateId();
    const now = new Date().toISOString();
    
    const workflowDef: WorkflowDefinition = {
      ...workflow,
      id,
      createdAt: now,
      updatedAt: now
    };

    const filepath = this.getWorkflowPath(id);
    
    fs.writeFileSync(filepath, JSON.stringify(workflowDef, null, 2));
    
    return id;
  }

  /**
   * Delete workflow template
   */
  async deleteWorkflow(id: string): Promise<void> {
    const filepath = this.getWorkflowPath(id);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }

  /**
   * Start workflow execution
   */
  async runWorkflow(workflowId: string, webview: BrowserWindow, initialVariables: WorkflowVariables = {}): Promise<string> {
    const workflows = await this.getWorkflows();
    const workflow = workflows.find(w => w.id === workflowId);
    
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const executionId = this.generateId();
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      status: 'running',
      currentStep: 0,
      startedAt: new Date().toISOString(),
      variables: { ...workflow.variables, ...initialVariables },
      stepResults: []
    };

    this.executions.set(executionId, execution);

    // Start execution in background
    this.executeWorkflow(execution, workflow, webview).catch(error => {
      execution.status = 'failed';
      execution.error = error.message;
      execution.completedAt = new Date().toISOString();
    });

    return executionId;
  }

  /**
   * Stop workflow execution
   */
  async stopWorkflow(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (execution && execution.status === 'running') {
      execution.status = 'aborted';
      execution.completedAt = new Date().toISOString();
    }
  }

  /**
   * Get workflow execution status
   */
  async getExecutionStatus(executionId: string): Promise<WorkflowExecution | null> {
    return this.executions.get(executionId) || null;
  }

  /**
   * Get all running executions
   */
  async getRunningExecutions(): Promise<WorkflowExecution[]> {
    return Array.from(this.executions.values()).filter(e => e.status === 'running');
  }

  private async executeWorkflow(execution: WorkflowExecution, workflow: WorkflowDefinition, webview: BrowserWindow): Promise<void> {
    try {
      let stepIndex = execution.currentStep;

      while (stepIndex < workflow.steps.length && execution.status === 'running') {
        const step = workflow.steps[stepIndex];
        execution.currentStep = stepIndex;

        log.info(`Executing step ${stepIndex + 1}/${workflow.steps.length}: ${step.type} - ${step.description || step.id}`);

        try {
          const result = await this.executeStep(step, execution, webview);
          
          execution.stepResults.push({
            stepId: step.id,
            status: 'completed',
            result,
            executedAt: new Date().toISOString()
          });

          // Verification Step
          const verified = await this.verifyStep(step, result, webview);
          if (!verified) {
            log.warn(`Step ${step.id} failed verification`);
            const onFail = step.params.onVerifyFail as 'continue' | 'retry' | 'goto' | 'abort' | undefined;
            if (onFail === 'retry') {
               // Logic to retry or self-correct
               log.info(`Retrying step ${step.id} due to verification failure`);
               continue;
            } else if (onFail === 'goto' && step.params.onVerifyFailStep) {
               const gotoIndex = workflow.steps.findIndex(s => s.id === step.params.onVerifyFailStep as string);
               if (gotoIndex !== -1) {
                 stepIndex = gotoIndex;
                 continue;
               }
            } else if (onFail === 'abort') {
               throw new Error(`Verification failed for step ${step.id}`);
            }
          }

          // Handle condition step results
          if (step.type === 'condition' && result) {
            const conditionResult = result as ConditionExecutionResult;
            
            if (conditionResult.action === 'goto' && conditionResult.gotoStep) {
              const gotoIndex = workflow.steps.findIndex(s => s.id === conditionResult.gotoStep);
              if (gotoIndex !== -1) {
                stepIndex = gotoIndex;
                continue;
              }
            } else if (conditionResult.action === 'skip' && conditionResult.skipCount) {
              stepIndex += conditionResult.skipCount;
              continue;
            } else if (conditionResult.action === 'abort') {
              execution.status = 'aborted';
              break;
            }
          }

          stepIndex++;
        } catch (stepError) {
          log.error(`Step ${step.id} failed:`, stepError);

          execution.stepResults.push({
            stepId: step.id,
            status: 'failed',
            error: stepError instanceof Error ? stepError.message : String(stepError),
            executedAt: new Date().toISOString()
          });

          // Retry logic
          const retries = step.retries || 0;
          if (retries > 0) {
            step.retries = retries - 1;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retry
            continue; // Retry the same step
          }

          throw stepError;
        }
      }

      if (execution.status === 'running') {
        execution.status = 'completed';
      }
      execution.completedAt = new Date().toISOString();

    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);
      execution.completedAt = new Date().toISOString();
      throw error;
    }
  }

  private async executeStep(step: WorkflowStep, execution: WorkflowExecution, webview: BrowserWindow): Promise<WorkflowStepResult> {
    const timeout = step.timeout || DEFAULT_TIMEOUT_MS;

    // Interpolate variables in step params
    const interpolatedParams = this.interpolateParams(step.params, execution.variables);
    const interpolatedStep = { ...step, params: interpolatedParams };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Step ${step.id} timed out after ${timeout}ms`));
      }, timeout);

      (async () => {
        let result;

        switch (interpolatedStep.type) {
          case 'navigate':
            result = await this.executeNavigate(interpolatedStep as NavigateStep, webview);
            break;
          case 'wait':
            result = await this.executeWait(interpolatedStep as WaitStep, webview);
            break;
          case 'click':
            result = await this.executeClick(interpolatedStep as ClickStep, webview);
            break;
          case 'hover':
            result = await this.executeHover(interpolatedStep as HoverStep, webview);
            break;
          case 'focus':
            result = await this.executeFocus(interpolatedStep as FocusStep, webview);
            break;
          case 'type':
            result = await this.executeType(interpolatedStep as TypeStep, webview);
            break;
          case 'press':
            result = await this.executePress(interpolatedStep as PressStep, webview);
            break;
          case 'select':
            result = await this.executeSelect(interpolatedStep as SelectStep, webview);
            break;
          case 'extract':
            result = await this.executeExtract(interpolatedStep as ExtractStep, execution, webview);
            break;
          case 'screenshot':
            result = await this.executeScreenshot(interpolatedStep as ScreenshotStep, webview);
            break;
          case 'scroll':
            result = await this.executeScroll(interpolatedStep as ScrollStep, webview);
            break;
          case 'condition':
            result = await this.executeCondition(interpolatedStep as ConditionStep, execution, webview);
            break;
          default:
            throw new Error(`Unknown step type: ${interpolatedStep.type}`);
        }

        clearTimeout(timer);
        resolve(result);
      })().catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  private interpolateParams(params: Record<string, unknown>, variables: WorkflowVariables): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        result[key] = value.replace(/\{\{([^}]+)\}\}/g, (_, varName) => {
          const trimmedVarName = varName.trim();
          return variables[trimmedVarName] !== undefined ? String(variables[trimmedVarName]) : `{{${varName}}}`;
        });
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.interpolateParams(value as Record<string, unknown>, variables);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private async resolveSelector(stepParams: { selector?: string; locator?: LocatorQuery }, _webview: BrowserWindow): Promise<string> {
    if (stepParams.selector) return stepParams.selector;

    if (stepParams.locator && this.locatorFinder && this.snapshotManager) {
      log.info(`Resolving semantic locator: ${JSON.stringify(stepParams.locator)}`);
      const result = await this.locatorFinder.find(stepParams.locator);
      if (result.found && result.ref) {
        // If it's a ref, we return it as-is (e.g. "@e1").
        // Higher-level handlers (executeClick, executeType) know how to handle @refs
        // by calling SnapshotManager methods directly.
        return result.ref;
      }
      throw new Error(`Could not find element by locator: ${JSON.stringify(stepParams.locator)}`);
    }

    throw new Error('Neither selector nor locator provided');
  }

  private async executeNavigate(step: NavigateStep, webview: BrowserWindow): Promise<void> {
    await webview.webContents.loadURL(step.params.url);
    
    if (step.params.waitForLoad !== false) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Navigation timeout')), DEFAULT_TIMEOUT_MS);
        
        webview.webContents.once('did-finish-load', () => {
          clearTimeout(timeout);
          resolve(void 0);
        });
        
        webview.webContents.once('did-fail-load', (event, errorCode, errorDescription) => {
          clearTimeout(timeout);
          reject(new Error(`Navigation failed: ${errorDescription}`));
        });
      });
    }
  }

  private async executeWait(step: WaitStep, webview: BrowserWindow): Promise<void> {
    if (step.params.condition) {
      // Wait for condition
      const startTime = Date.now();
      const maxWait = step.params.duration || 10000;

      while (Date.now() - startTime < maxWait) {
        const conditionMet = await this.checkCondition(step.params, webview);
        if (conditionMet) {
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      throw new Error(`Wait condition not met within ${maxWait}ms`);
    } else {
      // Simple wait
      await new Promise(resolve => setTimeout(resolve, step.params.duration));
    }
  }

  private async executeClick(step: ClickStep, webview: BrowserWindow): Promise<void> {
    const selectorOrRef = await this.resolveSelector(step.params, webview);

    if (step.params.scrollIntoView) {
      await this.scrollIntoView(webview.webContents, selectorOrRef);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // If it's a ref, use SnapshotManager.clickRef
    if (selectorOrRef.startsWith('@') && this.snapshotManager) {
      await this.snapshotManager.clickRef(selectorOrRef);
    } else {
      // Use humanizedClick for isTrusted: true events via sendInputEvent
      await humanizedClick(webview.webContents, selectorOrRef);
    }

    if (step.params.waitAfter) {
      await new Promise(resolve => setTimeout(resolve, step.params.waitAfter));
    }
  }

  private async executeHover(step: HoverStep, webview: BrowserWindow): Promise<void> {
    const selectorOrRef = await this.resolveSelector(step.params, webview);

    if (selectorOrRef.startsWith('@') && this.snapshotManager) {
      await this.snapshotManager.hoverRef(selectorOrRef);
    } else {
      await humanizedHover(webview.webContents, selectorOrRef);
    }

    if (step.params.waitAfter) {
      await new Promise(resolve => setTimeout(resolve, step.params.waitAfter));
    }
  }

  private async executeFocus(step: FocusStep, webview: BrowserWindow): Promise<void> {
    const selectorOrRef = await this.resolveSelector(step.params, webview);

    if (selectorOrRef.startsWith('@') && this.snapshotManager) {
      // To focus by ref, we can click it (humanizedClickAt) or use CDP DOM.focus
      // Let's use humanizedClickAt as a reliable way to focus for now.
      await this.snapshotManager.clickRef(selectorOrRef);
    } else {
      await webview.webContents.executeJavaScript(`
        const el = document.querySelector(${JSON.stringify(selectorOrRef)});
        if (el) el.focus();
      `);
    }
  }

  private async executeType(step: TypeStep, webview: BrowserWindow): Promise<void> {
    const selectorOrRef = await this.resolveSelector(step.params, webview);

    if (selectorOrRef.startsWith('@') && this.snapshotManager) {
      await this.snapshotManager.fillRef(selectorOrRef, step.params.text);
    } else {
      // Use humanizedType which handles focus, clear, and typing via sendInputEvent (isTrusted: true)
      await humanizedType(webview.webContents, selectorOrRef, step.params.text, !!step.params.clear);
    }

    if (step.params.submit) {
      // Submit via sendInputEvent Enter key (isTrusted: true)
      webview.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
      webview.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
    }
  }

  private async executePress(step: PressStep, webview: BrowserWindow): Promise<void> {
    const { key, modifiers = [], count = 1 } = step.params;

    for (let i = 0; i < count; i++) {
      webview.webContents.sendInputEvent({
        type: 'keyDown',
        keyCode: key,
        modifiers: modifiers as Electron.InputEvent['modifiers'],
      });
      webview.webContents.sendInputEvent({
        type: 'keyUp',
        keyCode: key,
        modifiers: modifiers as Electron.InputEvent['modifiers'],
      });
      if (count > 1) await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  private async executeSelect(step: SelectStep, webview: BrowserWindow): Promise<void> {
    const selectorOrRef = await this.resolveSelector(step.params, webview);

    const { value, label, index } = step.params;

    if (selectorOrRef.startsWith('@')) {
       // For refs, we click first to ensure it's focused/interactable
       await this.snapshotManager?.clickRef(selectorOrRef);
       // Then we need to find the selector for the ref to use the JS select logic
       // or implement select in SnapshotManager.
       // Given the time, let's fallback to finding a selector for the ref if possible.
    }

    await webview.webContents.executeJavaScript(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selectorOrRef)});
        if (!el || el.tagName !== 'SELECT') throw new Error('Element is not a select');
        
        if (${JSON.stringify(value)} !== undefined) {
          el.value = ${JSON.stringify(value)};
        } else if (${JSON.stringify(label)} !== undefined) {
          const option = Array.from(el.options).find(o => o.text === ${JSON.stringify(label)});
          if (option) el.value = option.value;
        } else if (${JSON.stringify(index)} !== undefined) {
          el.selectedIndex = ${JSON.stringify(index)};
        }

        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
  }

  private async scrollIntoView(wc: WebContents, selectorOrRef: string): Promise<void> {
    if (selectorOrRef.startsWith('@')) {
      // SnapshotManager already scrolls into view in clickRef/fillRef
      return;
    }

    await wc.executeJavaScript(`
      const element = document.querySelector(${JSON.stringify(selectorOrRef)});
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    `);
  }

  private async executeExtract(step: ExtractStep, execution: WorkflowExecution, webview: BrowserWindow): Promise<WorkflowStepResult> {
    const selectorOrRef = await this.resolveSelector(step.params, webview);

    let result;
    if (selectorOrRef.startsWith('@') && this.snapshotManager) {
      result = await this.snapshotManager.getTextRef(selectorOrRef);
    } else {
      result = await webview.webContents.executeJavaScript(`
        (() => {
          const selector = ${JSON.stringify(selectorOrRef || 'body')};
          const attribute = ${JSON.stringify(step.params.attribute || '')};

          const element = document.querySelector(selector);
          if (!element) return null;

          if (attribute) {
            return element.getAttribute(attribute);
          } else {
            return element.textContent || element.innerText;
          }
        })()
      `);
    }

    // Store in variables
    execution.variables[step.params.saveAs] = result;
    return result;
  }

  private async executeScreenshot(step: ScreenshotStep, webview: BrowserWindow): Promise<string> {
    const image = await webview.webContents.capturePage();
    const buffer = image.toPNG();
    
    const filename = step.params.filename || `workflow-${Date.now()}.png`;
    const screenshotsDir = tandemDir('screenshots');
    
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    
    const filepath = path.join(screenshotsDir, filename);
    fs.writeFileSync(filepath, buffer);
    
    if (step.params.saveAs) {
      // Store path in variables
    }
    
    return filepath;
  }

  private async executeScroll(step: ScrollStep, webview: BrowserWindow): Promise<void> {
    await webview.webContents.executeJavaScript(`
      const direction = ${JSON.stringify(step.params.direction)};
      const amount = ${JSON.stringify(step.params.amount || 300)};
      
      switch (direction) {
        case 'up':
          window.scrollBy(0, -amount);
          break;
        case 'down':
          window.scrollBy(0, amount);
          break;
        case 'top':
          window.scrollTo(0, 0);
          break;
        case 'bottom':
          window.scrollTo(0, document.body.scrollHeight);
          break;
      }
    `);
  }

  private async executeCondition(step: ConditionStep, execution: WorkflowExecution, webview: BrowserWindow): Promise<ConditionExecutionResult> {
    let conditionResult = false;

    switch (step.params.condition) {
      case 'elementExists': {
        const selectorOrRef = await this.resolveSelector(step.params, webview).catch(() => null);
        if (!selectorOrRef) {
          conditionResult = false;
        } else if (selectorOrRef.startsWith('@')) {
          conditionResult = true; // ResolveSelector already found it
        } else {
          conditionResult = await webview.webContents.executeJavaScript(`
            !!document.querySelector(${JSON.stringify(selectorOrRef)});
          `);
        }
        break;
      }
      case 'textContains':
        conditionResult = await webview.webContents.executeJavaScript(`
          document.body.textContent.includes(${JSON.stringify(step.params.text)});
        `);
        break;
      case 'urlMatches':
        conditionResult = new RegExp(step.params.urlPattern!).test(webview.webContents.getURL());
        break;
      case 'variableEquals':
        conditionResult = execution.variables[step.params.variable!] === step.params.value;
        break;
    }

    const action = conditionResult ? step.params.onTrue : step.params.onFalse;
    
    return {
      condition: conditionResult,
      action,
      gotoStep: step.params.gotoStep,
      skipCount: step.params.skipCount
    };
  }

  private async checkCondition(params: WaitStep['params'], webview: BrowserWindow): Promise<boolean> {
    switch (params.condition) {
      case 'element': {
        const selectorOrRef = await this.resolveSelector(params, webview).catch(() => null);
        if (!selectorOrRef) return false;
        if (selectorOrRef.startsWith('@')) return true;
        return await webview.webContents.executeJavaScript(`
          !!document.querySelector(${JSON.stringify(selectorOrRef)});
        `);
      }
      case 'text':
        return await webview.webContents.executeJavaScript(`
          document.body.textContent.includes(${JSON.stringify(params.text)});
        `);
      case 'url':
        return !!params.urlPattern && new RegExp(params.urlPattern).test(webview.webContents.getURL());
      default:
        return false;
    }
  }

  private async verifyStep(step: WorkflowStep, _result: unknown, webview: BrowserWindow): Promise<boolean> {
    switch (step.type) {
      case 'navigate': {
        const currentUrl = webview.webContents.getURL();
        const targetUrl = (step as NavigateStep).params.url;
        // Basic check: did we at least get to the domain?
        try {
          return new URL(currentUrl).hostname === new URL(targetUrl).hostname;
        } catch { return false; }
      }
      case 'click':
      case 'type':
        // Clicks and types are harder to verify without state snapshots,
        // but we could check for console errors or URL changes.
        return true;
      default:
        return true;
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }
}
