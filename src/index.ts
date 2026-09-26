export { runCli } from './cli/run.js';
export { installById as installComponent, removeInstalled as removeComponent } from './core/install.js';
export { collectInstalled as listInstalled } from './core/lifecycle.js';
export { doctor as checkInstall } from './core/doctor.js';
export { destRoots } from './core/paths.js';
export { createCatalog } from './services/github.js';
export type { Target, ComponentType, Catalog, CliOptions, InstallRoots } from './core/types.js';
