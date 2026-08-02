/**
 * @dawai/contracts — shared types with no behaviour.
 *
 * @blueprint §2 · V5
 * @owner platform-foundation
 * @why The domain must be importable by every layer without dragging anything
 *      with it. This package holds only types, so importing it from any layer
 *      costs nothing at runtime and can never move a rule out of the domain.
 */

/** Reserved for generated wire types once Stage 5 introduces transport.
 *  Deliberately empty: an invented type here would be an invented contract. */
export type Empty = Record<never, never>;
