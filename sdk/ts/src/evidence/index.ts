/**
 * ATP Evidence Module
 *
 * Client-side evidence recording, verification, and anchoring.
 * Works standalone (no gateway required) or with pluggable backends.
 *
 * @packageDocumentation
 */

export {
  EvidenceBuilder,
  buildEvidence,
  verifyEvidence,
  hashEvidence,
} from "./recorder";

export {
  type EvidenceBackend,
  type EvidenceQuery,
  type EvidenceQueryResult,
  MemoryEvidenceBackend,
  FileEvidenceBackend,
  DUALEvidenceBackend,
  MultiBackend,
} from "./backends";

export {
  PostgresBackend,
  type PostgresBackendConfig,
  type ChainVerificationResult,
  type ChainError,
} from "./postgres-backend";

export type {
  EvidenceBuildInput,
  EvidenceVerification,
} from "./recorder";
