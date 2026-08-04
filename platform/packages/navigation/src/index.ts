/**
 * @dawai/navigation — flows, the graph, and route guards.
 *
 * @blueprint §5 · §7 · D26
 * @owner patient-app
 * @why Stage 3. Location, previous step, next step and progress are derived
 *      from declared flows and a graph built from the screen contracts, so no
 *      screen hard-codes an answer and no screen can quietly become a dead end.
 */
export * from "./flow.js";
export * from "./graph.js";
export * from "./guards.js";
