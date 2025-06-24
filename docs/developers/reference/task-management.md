# Task Management Reference

Complete reference for Task Master AI integration and MCP tools in contribux.

## Overview

Task Master AI provides intelligent project management through hierarchical task organization, AI-powered analysis, and seamless workflow integration.

## Core Components

### Task Structure

```typescript
interface Task {
  id: string; // "1", "2", "3"
  title: string;
  description: string;
  status: TaskStatus;
  priority: "high" | "medium" | "low";
  dependencies: string[]; // Task IDs this task depends on
  details: string; // Implementation details
  testStrategy: string; // Testing approach
  subtasks: Subtask[]; // Nested subtasks
}

interface Subtask {
  id: string; // "1.1", "1.2", "2.1"
  title: string;
  description: string;
  status: TaskStatus;
  dependencies: string[]; // Can depend on other tasks/subtasks
  details: string;
  testStrategy: string;
}

type TaskStatus =
  | "pending" // Ready to work on
  | "in-progress" // Currently being worked on
  | "done" // Completed and verified
  | "deferred" // Postponed for later
  | "cancelled" // No longer needed
  | "blocked"; // Waiting on external factors
```

### File Structure

```text
.taskmaster/
├── config.json              # Configuration (auto-managed)
├── tasks/
│   ├── tasks.json           # Main task data (auto-managed)
│   ├── task-1.txt          # Individual task files (auto-generated)
│   ├── task-2.txt
│   └── ...
├── docs/
│   ├── prd.txt             # Product Requirements Document
│   └── research/           # AI research outputs
└── reports/
    └── task-complexity-report.json  # Complexity analysis
```

## MCP Tool Reference

### Project Setup

#### `initialize_project`

Initialize Task Master AI in the current directory.

```javascript
mcp__task_master_ai__initialize_project({
  projectRoot: "/absolute/path/to/project",
  rules: ["claude", "cursor", "vscode"], // Rule profiles
  initGit: true, // Initialize Git repo
  storeTasksInGit: true, // Track tasks in Git
  addAliases: true, // Add shell aliases
  skipInstall: false, // Install dependencies
});
```

#### `parse_prd`

Parse Product Requirements Document to generate initial tasks.

```javascript
mcp__task_master_ai__parse_prd({
  projectRoot: "/absolute/path/to/project",
  input: ".taskmaster/docs/prd.txt", // PRD file path
  numTasks: "10", // Target number of tasks
  append: false, // Append to existing tasks
  research: true, // Enable AI research
  force: false, // Overwrite existing output
});
```

### Daily Workflow

#### `next_task`

Find the next available task to work on.

```javascript
mcp__task_master_ai__next_task({
  projectRoot: "/absolute/path/to/project",
  file: "tasks/tasks.json", // Optional: custom tasks file
  complexityReport: "reports/complexity.json", // Optional: complexity data
});
```

#### `get_task`

Retrieve details for specific task(s).

```javascript
mcp__task_master_ai__get_task({
  id: "1.2", // Task/subtask ID
  projectRoot: "/absolute/path/to/project",
  status: "pending", // Filter subtasks by status
  file: "tasks/tasks.json", // Optional: custom tasks file
  complexityReport: "reports/complexity.json",
});
```

#### `set_task_status`

Update task or subtask status.

```javascript
mcp__task_master_ai__set_task_status({
  id: "1.2", // Task/subtask ID
  status: "in-progress", // New status
  projectRoot: "/absolute/path/to/project",
  file: "tasks/tasks.json", // Optional: custom tasks file
});
```

### Task Management

#### `get_tasks`

Retrieve all tasks with optional filtering.

```javascript
mcp__task_master_ai__get_tasks({
  projectRoot: "/absolute/path/to/project",
  status: "pending,in-progress", // Filter by status
  withSubtasks: true, // Include nested subtasks
  file: "tasks/tasks.json", // Optional: custom tasks file
  complexityReport: "reports/complexity.json",
});
```

#### `add_task`

Create new task using AI assistance.

```javascript
mcp__task_master_ai__add_task({
  projectRoot: "/absolute/path/to/project",
  prompt: "Implement GitHub API rate limiting", // Task description
  research: true, // Enable AI research
  priority: "high", // Task priority
  dependencies: "1,2", // Comma-separated dependencies
  file: "tasks/tasks.json", // Optional: custom tasks file
});
```

#### `add_subtask`

Add subtask to existing task.

```javascript
mcp__task_master_ai__add_subtask({
  id: "1", // Parent task ID
  projectRoot: "/absolute/path/to/project",
  title: "Implement rate limiting logic", // Subtask title
  description: "Add exponential backoff", // Subtask description
  dependencies: "1.1", // Subtask dependencies
  status: "pending", // Initial status
});
```

#### `expand_task`

Expand task into detailed subtasks.

```javascript
mcp__task_master_ai__expand_task({
  id: "1", // Task to expand
  projectRoot: "/absolute/path/to/project",
  num: "5", // Number of subtasks
  research: true, // Enable AI research
  force: false, // Force re-expansion
  prompt: "Focus on security and performance", // Additional context
});
```

#### `expand_all`

Expand all pending tasks into subtasks.

```javascript
mcp__task_master_ai__expand_all({
  projectRoot: "/absolute/path/to/project",
  num: "3", // Subtasks per task
  research: true, // Enable AI research
  force: false, // Force re-expansion
  prompt: "Consider scalability requirements",
});
```

### Task Updates

#### `update_task`

Update single task with new information.

```javascript
mcp__task_master_ai__update_task({
  id: "1", // Task ID
  projectRoot: "/absolute/path/to/project",
  prompt: "Updated requirements: add caching layer",
  research: false, // Enable AI research
  append: false, // Append vs full update
});
```

#### `update_subtask`

Update subtask with progress notes.

```javascript
mcp__task_master_ai__update_subtask({
  id: "1.2", // Subtask ID (parent.child)
  projectRoot: "/absolute/path/to/project",
  prompt: "Implemented basic rate limiting, testing edge cases",
  research: false, // Enable AI research
});
```

#### `update`

Update multiple tasks from specified ID onwards.

```javascript
mcp__task_master_ai__update({
  from: "3", // Starting task ID
  projectRoot: "/absolute/path/to/project",
  prompt: "New API requirements discovered",
  research: true, // Enable AI research
  file: "tasks/tasks.json", // Optional: custom tasks file
});
```

### Analysis and Organization

#### `analyze_project_complexity`

Analyze task complexity and generate recommendations.

```javascript
mcp__task_master_ai__analyze_project_complexity({
  projectRoot: "/absolute/path/to/project",
  research: true, // Enable AI research
  threshold: 5, // Complexity threshold (1-10)
  ids: "1,3,5", // Specific task IDs
  from: 1, // Starting task ID
  to: 10, // Ending task ID
  output: "reports/complexity-report.json", // Output file
});
```

#### `complexity_report`

Display complexity analysis in readable format.

```javascript
mcp__task_master_ai__complexity_report({
  projectRoot: "/absolute/path/to/project",
  file: "reports/task-complexity-report.json", // Report file path
});
```

### Dependencies

#### `add_dependency`

Add dependency relationship between tasks.

```javascript
mcp__task_master_ai__add_dependency({
  id: "2", // Task that depends
  dependsOn: "1", // Task dependency
  projectRoot: "/absolute/path/to/project",
  file: "tasks/tasks.json", // Optional: custom tasks file
});
```

#### `remove_dependency`

Remove dependency relationship.

```javascript
mcp__task_master_ai__remove_dependency({
  id: "2", // Task to modify
  dependsOn: "1", // Dependency to remove
  projectRoot: "/absolute/path/to/project",
  file: "tasks/tasks.json", // Optional: custom tasks file
});
```

#### `validate_dependencies`

Check for dependency issues.

```javascript
mcp__task_master_ai__validate_dependencies({
  projectRoot: "/absolute/path/to/project",
  file: "tasks/tasks.json", // Optional: custom tasks file
});
```

#### `fix_dependencies`

Automatically fix invalid dependencies.

```javascript
mcp__task_master_ai__fix_dependencies({
  projectRoot: "/absolute/path/to/project",
  file: "tasks/tasks.json", // Optional: custom tasks file
});
```

### Task Organization

#### `move_task`

Move task to new position.

```javascript
mcp__task_master_ai__move_task({
  from: "2", // Task to move
  to: "4", // Destination position
  projectRoot: "/absolute/path/to/project",
  file: "tasks/tasks.json", // Optional: custom tasks file
});
```

#### `remove_task`

Remove task permanently.

```javascript
mcp__task_master_ai__remove_task({
  id: "3", // Task/subtask to remove
  projectRoot: "/absolute/path/to/project",
  confirm: true, // Skip confirmation
  file: "tasks/tasks.json", // Optional: custom tasks file
});
```

#### `remove_subtask`

Remove subtask from parent.

```javascript
mcp__task_master_ai__remove_subtask({
  id: "1.2", // Subtask ID to remove
  projectRoot: "/absolute/path/to/project",
  convert: false, // Convert to standalone task
  skipGenerate: false, // Skip regenerating files
});
```

#### `clear_subtasks`

Remove all subtasks from tasks.

```javascript
mcp__task_master_ai__clear_subtasks({
  projectRoot: "/absolute/path/to/project",
  id: "1,2,3", // Specific task IDs
  all: false, // Clear from all tasks
  tag: "feature", // Tag context
});
```

### File Management

#### `generate`

Regenerate individual task files from tasks.json.

```javascript
mcp__task_master_ai__generate({
  projectRoot: "/absolute/path/to/project",
  file: "tasks/tasks.json", // Source tasks file
  output: "tasks/", // Output directory
});
```

### Research Integration

#### `research`

Perform AI-powered research with project context.

```javascript
mcp__task_master_ai__research({
  query: "Best practices for GitHub API rate limiting",
  projectRoot: "/absolute/path/to/project",
  taskIds: "1.2,1.3", // Related task context
  filePaths: "src/lib/github/client.ts", // Code context
  customContext: "Using TypeScript and Zod validation",
  detailLevel: "high", // Detail level
  saveTo: "1.2", // Save to task/subtask
  saveToFile: true, // Save to research/ directory
  includeProjectTree: false, // Include file tree
});
```

### Tag Management

#### `list_tags`

List all available tags.

```javascript
mcp__task_master_ai__list_tags({
  projectRoot: "/absolute/path/to/project",
  showMetadata: true, // Include metadata
  file: "tasks/tasks.json", // Optional: custom tasks file
});
```

#### `add_tag`

Create new tag context.

```javascript
mcp__task_master_ai__add_tag({
  name: "feature-auth", // Tag name
  projectRoot: "/absolute/path/to/project",
  description: "Authentication feature tasks",
  copyFromCurrent: false, // Copy from current tag
  copyFromTag: "main", // Copy from specific tag
  fromBranch: false, // Create from git branch
});
```

#### `use_tag`

Switch to different tag context.

```javascript
mcp__task_master_ai__use_tag({
  name: "feature-auth", // Tag to switch to
  projectRoot: "/absolute/path/to/project",
  file: "tasks/tasks.json", // Optional: custom tasks file
});
```

#### `delete_tag`

Remove tag and all its tasks.

```javascript
mcp__task_master_ai__delete_tag({
  name: "old-feature", // Tag to delete
  projectRoot: "/absolute/path/to/project",
  yes: true, // Skip confirmation
});
```

## Common Workflows

### Initial Project Setup

```javascript
// 1. Initialize project
await mcp__task_master_ai__initialize_project({
  projectRoot: "/path/to/project",
});

// 2. Parse requirements
await mcp__task_master_ai__parse_prd({
  projectRoot: "/path/to/project",
  numTasks: "8",
  research: true,
});

// 3. Analyze complexity
await mcp__task_master_ai__analyze_project_complexity({
  projectRoot: "/path/to/project",
  research: true,
});

// 4. Expand all tasks
await mcp__task_master_ai__expand_all({
  projectRoot: "/path/to/project",
  research: true,
});
```

### Daily Development

```javascript
// 1. Find next task
const nextTask = await mcp__task_master_ai__next_task({
  projectRoot: "/path/to/project",
});

// 2. Get task details
const taskDetails = await mcp__task_master_ai__get_task({
  id: nextTask.id,
  projectRoot: "/path/to/project",
});

// 3. Start working
await mcp__task_master_ai__set_task_status({
  id: nextTask.id,
  status: "in-progress",
  projectRoot: "/path/to/project",
});

// 4. Update progress
await mcp__task_master_ai__update_subtask({
  id: nextTask.id,
  prompt: "Implemented core functionality, adding tests",
  projectRoot: "/path/to/project",
});

// 5. Complete task
await mcp__task_master_ai__set_task_status({
  id: nextTask.id,
  status: "done",
  projectRoot: "/path/to/project",
});
```

### Feature Development

```javascript
// 1. Create feature tag
await mcp__task_master_ai__add_tag({
  name: "github-integration",
  description: "GitHub API integration feature",
  projectRoot: "/path/to/project",
});

// 2. Switch to feature context
await mcp__task_master_ai__use_tag({
  name: "github-integration",
  projectRoot: "/path/to/project",
});

// 3. Add feature tasks
await mcp__task_master_ai__add_task({
  prompt: "Implement GitHub API client with rate limiting",
  research: true,
  priority: "high",
  projectRoot: "/path/to/project",
});

// 4. Expand and work on tasks
// 5. Merge back to main when complete
```

## Performance Considerations

### AI-Powered Operations

These operations may take 30-60 seconds due to AI processing:

- `parse_prd` with research enabled
- `analyze_project_complexity` with research
- `expand_task` and `expand_all` with research
- `add_task` with research enabled
- `update_task` and `update_subtask` with research
- `research` queries

### Optimization Tips

1. **Batch operations**: Group related updates together
2. **Use research selectively**: Enable only when needed
3. **Cache complexity reports**: Reuse analysis results
4. **Minimize file regeneration**: Use `skipGenerate` when appropriate

## Error Handling

### Common Issues

```bash
# Task file corruption
rm -rf .taskmaster/tasks/*.txt
task-master generate

# Circular dependencies
task-master validate-dependencies
task-master fix-dependencies

# Configuration issues
task-master init --force

# Missing project root
# Always provide absolute paths to projectRoot
```

### Validation

```javascript
// Validate before operations
const dependencies = await mcp__task_master_ai__validate_dependencies({
  projectRoot: "/path/to/project",
});

if (!dependencies.valid) {
  await mcp__task_master_ai__fix_dependencies({
    projectRoot: "/path/to/project",
  });
}
```

## Integration with Development Tools

### Git Integration

```bash
# Tasks are tracked in Git by default
git add .taskmaster/
git commit -m "feat: update task progress"

# Create branches from task names
git checkout -b feat/task-$(task-master next --format=id)
```

### CI/CD Integration

```bash
# Validate task dependencies in CI
task-master validate-dependencies || exit 1

# Generate reports
task-master complexity-report > reports/complexity.html
```

### IDE Integration

```typescript
// VS Code tasks.json
{
  "label": "Next Task",
  "type": "shell",
  "command": "task-master next",
  "group": "build"
}
```

## Advanced Features

### Custom Research Queries

```javascript
await mcp__task_master_ai__research({
  query: "Compare Redis vs in-memory caching for GitHub API responses",
  projectRoot: "/path/to/project",
  taskIds: "1.3", // Cache implementation task
  filePaths: "src/lib/github/client.ts,src/lib/cache/",
  customContext: "Need sub-100ms response times, handle 1000 req/min",
  detailLevel: "high",
  saveTo: "1.3",
});
```

### Programmatic Task Creation

```javascript
// Create tasks programmatically
const apiTasks = [
  "Implement repository search endpoint",
  "Add user authentication middleware",
  "Create opportunity recommendation engine",
];

for (const taskPrompt of apiTasks) {
  await mcp__task_master_ai__add_task({
    prompt: taskPrompt,
    research: true,
    priority: "high",
    projectRoot: "/path/to/project",
  });
}
```

This comprehensive reference enables effective use of Task Master AI for intelligent project management and workflow optimization.
