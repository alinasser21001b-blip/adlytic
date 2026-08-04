/**
 * Arabic number agreement — the rule, in one place.
 *
 * @blueprint §25 · D34
 * @owner platform-foundation
 * @why Arabic does not have one plural. A counted noun takes four different
 *      forms depending on how many there are, and the agreement runs past the
 *      noun into the pronouns after it — «باقي بديل واحد تقرر بيه» against
 *      «باقي ٣ بدائل تقرر بيهم». English has two forms and a screen written by
 *      someone thinking in English gets three of the four wrong.
 *
 *      It shipped wrong, in an Arabic-first product, on strings a patient
 *      reads at the exact moments the app is trying to be reassuring: a cached
 *      search said «آخر تحديث قبل ١ دقائق» — "1 minutes ago" — and a patient
 *      on their fourth attempt at a verification code was told «باقيلك ٢
 *      محاولات» where Arabic wants the dual, «محاولتين». One module already
 *      knew the rule and applied it to hours alone; everywhere else guessed.
 *
 *      The categories are CLDR's for Arabic, not a scheme invented here, so a
 *      translator or a reviewer can check this against a published table
 *      rather than against someone's memory.
 * @implements design/arabic-plurals
 */

/**
 * The four forms a counted phrase takes.
 *
 * Whole phrases rather than nouns, because the agreement does not stop at the
 * noun: «تقرر بيه» becomes «تقرر بيهم», «غيره» becomes «غيرهم». A helper that
 * returned only the noun would leave the rest of the sentence at the call site
 * to be got wrong, which is where it was got wrong.
 */
export type PluralForms<T> = {
  /** Exactly one. Arabic normally drops the numeral here: «دقيقة», not «١ دقيقة». */
  readonly one: T;
  /** Exactly two — the dual, which English does not have and which is the form
   *  most often missed: «دقيقتين», «ساعتين», «محاولتين», «يومين». */
  readonly two: T;
  /** Three to ten. The numeral is stated and the noun is a broken plural:
   *  «٥ دقائق». */
  readonly few: T;
  /** Eleven and above — and zero. The numeral is stated and the noun returns
   *  to the SINGULAR: «١٥ دقيقة», not «١٥ دقائق». This is the one that reads
   *  as a mistake to a native speaker when a codebase treats "plural" as one
   *  thing. */
  readonly many: T;
};

/**
 * Pick the form. Nothing else — the caller writes the words.
 *
 * Generic so it can select any value, not only a string: a screen that needs
 * to choose between two elements for the same reason uses the same rule rather
 * than a second copy of it.
 *
 * Zero takes `many` («٠ محاولات» reads wrong; «٠ محاولة» is the form), and a
 * fractional or negative count is not a thing this product counts, so both are
 * folded to their absolute integer rather than being given a category of their
 * own.
 */
export function plural<T>(n: number, forms: PluralForms<T>): T {
  const count = Math.abs(Math.trunc(n));
  if (count === 1) return forms.one;
  if (count === 2) return forms.two;
  const mod = count % 100;
  return mod >= 3 && mod <= 10 ? forms.few : forms.many;
}

/**
 * The common shape: a number and the thing it counts.
 *
 * Handles where the numeral goes, which is part of the rule and not a matter
 * of taste — one and two omit it, three and above state it. Written out at a
 * call site that would be four near-identical template literals.
 *
 * Digits stay Western here. Every string in this app passes through the render
 * layer, which converts to Arabic-Indic once (§25); converting early would
 * produce numerals this module has to keep in step with that one.
 */
export function counted(n: number, noun: PluralForms<string>): string {
  const count = Math.abs(Math.trunc(n));
  const form = plural(count, noun);
  return count === 1 || count === 2 ? form : `${count} ${form}`;
}
