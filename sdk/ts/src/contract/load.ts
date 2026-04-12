/**
 * ATP Contract Loading
 *
 * Utilities for loading ATP contracts from files and registries.
 */

import { readFile } from "fs/promises";
import { resolve } from "path";
import type { ATPContract } from "../types";
import { validateContract } from "./validate";

/**
 * Load an ATP contract from a JSON file.
 *
 * @example
 * ```typescript
 * import { loadContract } from "@atp-protocol/sdk";
 *
 * const contract = await loadContract("contracts/procurement-email.json");
 * ```
 */
export async function loadContract(path: string): Promise<ATPContract> {
  const resolved = resolve(path);
  const content = await readFile(resolved, "utf-8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Failed to parse contract file: ${resolved}`);
  }

  const validation = validateContract(parsed);
  if (!validation.valid) {
    const errorMessages = validation.errors.map((e) => `  - ${e.field}: ${e.message}`).join("\n");
    throw new Error(`Invalid contract at ${resolved}:\n${errorMessages}`);
  }

  return parsed as ATPContract;
}

/**
 * Load multiple contracts from a directory.
 * Loads all .json files and validates each one.
 */
export async function loadContracts(dir: string): Promise<Map<string, ATPContract>> {
  const { readdir } = await import("fs/promises");
  const resolved = resolve(dir);
  const files = await readdir(resolved);
  const contracts = new Map<string, ATPContract>();

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const contract = await loadContract(resolve(resolved, file));
      contracts.set(file, contract);
    } catch {
      // Skip invalid files — caller can validate individually
    }
  }

  return contracts;
}
