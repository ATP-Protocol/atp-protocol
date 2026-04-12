/**
 * @atp-protocol/langchain
 *
 * ATP governance adapter for LangChain.
 * Wrap any LangChain tool with ATP governance in one line.
 *
 * @example
 * ```typescript
 * import { governTool, GovernedToolkit } from "@atp-protocol/langchain";
 * import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
 *
 * // Govern a single tool
 * const governedSearch = governTool(new TavilySearchResults(), {
 *   contract: {
 *     version: "1.0.0",
 *     authority: "org.research.web-search",
 *     actions: ["search"],
 *     attestation: "full",
 *     scope: {
 *       query_topic: ["technology", "science", "business"],
 *       prohibited_query_content: ["weapons", "exploit"],
 *       max_results: 10,
 *     },
 *   },
 * });
 *
 * // Or govern an entire toolkit
 * const toolkit = new GovernedToolkit({
 *   contract: myContract,
 *   tools: [searchTool, emailTool, dbTool],
 * });
 * ```
 *
 * @packageDocumentation
 */

export { governTool, GovernedTool } from "./governed-tool";
export { GovernedToolkit } from "./toolkit";
export { ATPCallbackHandler } from "./callback";
export type { GovernToolOptions, GovernedToolResult } from "./governed-tool";
export type { GovernedToolkitOptions } from "./toolkit";
