/**
 * @atp-protocol/registry
 *
 * ATP Contract Registry — publish, discover, and resolve governance contracts.
 *
 * The registry allows organizations to:
 * - Publish contracts with versioning and metadata
 * - Discover contracts by action, authority pattern, or tag
 * - Resolve contracts by ID or fully-qualified name
 * - Verify contract signatures and provenance
 *
 * Supports multiple backends: local filesystem, GitHub, HTTP, and DUAL network.
 *
 * @packageDocumentation
 */

export {
  type RegistryBackend,
  type ContractEntry,
  type RegistryQuery,
  type RegistryQueryResult,
  ContractRegistry,
  LocalRegistryBackend,
  GitHubRegistryBackend,
} from "./registry";
