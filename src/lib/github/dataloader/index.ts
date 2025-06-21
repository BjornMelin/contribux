/**
 * DataLoader exports and utilities
 *
 * This module re-exports the main DataLoader implementation and provides
 * additional utilities for creating specialized DataLoaders for different
 * GitHub API resources.
 */

export {
  createRepositoryDataLoader,
  DataLoader,
  type DataLoaderOptions,
  type RepositoryData,
  type RepositoryKey,
} from '../dataloader'

/**
 * Additional specialized DataLoader factory functions can be added here
 * for other GitHub resources like users, issues, pull requests, etc.
 */

// Future expansion points:
// export { createUserDataLoader } from '../dataloader'
// export { createIssueDataLoader } from '../dataloader'
// export { createPullRequestDataLoader } from '../dataloader'
