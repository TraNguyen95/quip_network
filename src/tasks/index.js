import ExampleTask from './example/ExampleTask.js';
import IncentivTask from './incentiv/IncentivTask.js';
import GoogleSearchTask from './google-search/GoogleSearchTask.js';
import ChainlinkFaucetTask from './chainlink-faucet/ChainlinkFaucetTask.js';
import QuipNetworkTask from './quip-network/QuipNetworkTask.js';

/**
 * Task Registry.
 * Add new tasks here after creating them.
 */
const registry = new Map();

function register(TaskClass) {
  registry.set(TaskClass.taskName, TaskClass);
}

// ==================== Register all tasks ====================
register(ExampleTask);
register(IncentivTask);
register(GoogleSearchTask);
register(ChainlinkFaucetTask);
register(QuipNetworkTask);

// ==================== Public API ====================

export function getTask(taskName) {
  const TaskClass = registry.get(taskName);
  if (!TaskClass) {
    const available = listTasks().map((t) => t.name).join(', ');
    throw new Error(`Task "${taskName}" not found. Available: ${available}`);
  }
  return new TaskClass();
}

export function listTasks() {
  return Array.from(registry.entries()).map(([name, TaskClass]) => ({
    name,
    description: TaskClass.description,
  }));
}
