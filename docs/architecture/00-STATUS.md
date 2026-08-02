# STATUS: DEFERRED — superseded in sequence, not in content

The documents in this folder were written before the product was fully
defined. That was the wrong order.

**Architecture must be an output of product design, not an input to it.**
Deciding "three binaries" or "React Native" before the product's behaviour is
settled forces the product to fit the technology.

## What this means in practice

- **`docs/product/DAWAI_PRODUCT_BLUEPRINT.md` is the single source of truth**
  for product behaviour and user experience. Any disagreement between that
  document and this folder is resolved in favour of the product blueprint.
- Nothing in this folder is approved.
- Every technical decision here is **withdrawn pending product approval**,
  specifically: the number of applications, the client platform, the state
  management approach, the package layout, and the transport choices.
- The parts of this folder that describe *product* behaviour — the clinical
  invariants, the reservation lifecycle, the permission model — were folded
  into the product blueprint and are governed there from now on.

## What happens next

1. `DAWAI_PRODUCT_BLUEPRINT.md` is reviewed and approved.
2. A new architecture document is written **from it**, and it answers only one
   question: how do we build what was agreed. Application count and platform
   are decided there, with the product requirements already fixed.
3. This folder is then either rewritten or deleted. It is not merged.
