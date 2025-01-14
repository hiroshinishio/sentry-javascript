import { getGlobalSingleton } from './carrier';
import { Scope as ScopeClass } from './scope';
import type { Scope } from './types-hoist';

/** Get the default current scope. */
export function getDefaultCurrentScope(): Scope {
  return getGlobalSingleton('defaultCurrentScope', () => new ScopeClass());
}

/** Get the default isolation scope. */
export function getDefaultIsolationScope(): Scope {
  return getGlobalSingleton('defaultIsolationScope', () => new ScopeClass());
}
