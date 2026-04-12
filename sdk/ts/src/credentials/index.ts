/**
 * ATP Credentials Module
 *
 * Client-side credential resolution and injection for ATP-governed executions.
 * Provides a credential store abstraction that never exposes secrets to agents.
 *
 * @packageDocumentation
 */

export {
  type CredentialProvider,
  type CredentialResolution,
  type StoredCredentialEntry,
  CredentialStore,
  resolveCredential,
  buildInjectionHeaders,
} from "./resolver";
