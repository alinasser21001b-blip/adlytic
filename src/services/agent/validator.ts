// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/validator.ts
//
//  Lightweight JSON-Schema-subset validator. Covers exactly what our tool
//  schemas use — no more. In-house to avoid pulling ajv (100+ KB) for
//  ~200 lines of validation.
//
//  Supported keywords: type, properties, required, additionalProperties,
//  enum, minimum, maximum, minLength, maxLength, minItems, maxItems, items.
//  Not supported: allOf, oneOf, anyOf, $ref, pattern (regex).
//
//  Spec: PHASE2_AI_AGENT_DESIGN.md §19.12 (gap #12)
// ════════════════════════════════════════════════════════════════════════

/** Supported JSON Schema shape — narrowed from the spec to what we use. */
export interface JsonSchema {
  type?: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean';
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  enum?: readonly (string | number | boolean)[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  items?: JsonSchema;
  /** Default value applied when the field is absent AND not required. */
  default?: unknown;
  /** Description carried to Anthropic tool schema; not used by validator. */
  description?: string;
}

export interface ValidationError {
  path: string;    // dot path, e.g. "windowDays" or "shiftAmount.value"
  message: string;
}

export interface ValidationResult<T> {
  valid: boolean;
  errors: ValidationError[];
  /** Value with defaults filled in (when valid). */
  value?: T;
}

/**
 * Validate `input` against `schema`. Returns a coerced value (numbers stay
 * numbers, integers become integers, defaults applied). Rejects unknown
 * properties when `additionalProperties: false`.
 */
export function validate<T = unknown>(input: unknown, schema: JsonSchema): ValidationResult<T> {
  const errors: ValidationError[] = [];
  const coerced = validateNode(input, schema, '', errors);
  return {
    valid: errors.length === 0,
    errors,
    ...(errors.length === 0 && { value: coerced as T }),
  };
}

function validateNode(input: unknown, schema: JsonSchema, path: string, errors: ValidationError[]): unknown {
  // Undefined + no default → propagate; caller (parent object) decides if
  // this violates `required`.
  if (input === undefined) {
    return schema.default;
  }

  // Enum first — enum values dominate over type checks.
  if (schema.enum) {
    if (!schema.enum.includes(input as string | number | boolean)) {
      errors.push({
        path: path || '(root)',
        message: `must be one of: ${schema.enum.join(', ')}`,
      });
      return input;
    }
  }

  // Type validation
  if (schema.type === 'string') {
    if (typeof input !== 'string') {
      errors.push({ path: path || '(root)', message: 'must be a string' });
      return input;
    }
    if (schema.minLength !== undefined && input.length < schema.minLength) {
      errors.push({ path: path || '(root)', message: `must be at least ${schema.minLength} characters` });
    }
    if (schema.maxLength !== undefined && input.length > schema.maxLength) {
      errors.push({ path: path || '(root)', message: `must be at most ${schema.maxLength} characters` });
    }
    return input;
  }

  if (schema.type === 'integer' || schema.type === 'number') {
    if (typeof input !== 'number' || !Number.isFinite(input)) {
      errors.push({ path: path || '(root)', message: `must be a ${schema.type}` });
      return input;
    }
    if (schema.type === 'integer' && !Number.isInteger(input)) {
      errors.push({ path: path || '(root)', message: 'must be an integer' });
      return input;
    }
    if (schema.minimum !== undefined && input < schema.minimum) {
      errors.push({ path: path || '(root)', message: `must be ≥ ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && input > schema.maximum) {
      errors.push({ path: path || '(root)', message: `must be ≤ ${schema.maximum}` });
    }
    return input;
  }

  if (schema.type === 'boolean') {
    if (typeof input !== 'boolean') {
      errors.push({ path: path || '(root)', message: 'must be a boolean' });
    }
    return input;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(input)) {
      errors.push({ path: path || '(root)', message: 'must be an array' });
      return input;
    }
    if (schema.minItems !== undefined && input.length < schema.minItems) {
      errors.push({ path: path || '(root)', message: `must have at least ${schema.minItems} items` });
    }
    if (schema.maxItems !== undefined && input.length > schema.maxItems) {
      errors.push({ path: path || '(root)', message: `must have at most ${schema.maxItems} items` });
    }
    if (schema.items) {
      return input.map((item, i) => validateNode(item, schema.items!, `${path}[${i}]`, errors));
    }
    return input;
  }

  if (schema.type === 'object') {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      errors.push({ path: path || '(root)', message: 'must be an object' });
      return input;
    }
    const result: Record<string, unknown> = {};
    const inputObj = input as Record<string, unknown>;
    const known = new Set(Object.keys(schema.properties ?? {}));

    // additionalProperties check
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(inputObj)) {
        if (!known.has(key)) {
          errors.push({
            path: path ? `${path}.${key}` : key,
            message: `unknown property (additionalProperties: false)`,
          });
        }
      }
    }

    // required check
    for (const req of schema.required ?? []) {
      if (!(req in inputObj) || inputObj[req] === undefined) {
        errors.push({
          path: path ? `${path}.${req}` : req,
          message: 'is required',
        });
      }
    }

    // Recurse into properties, filling defaults for absent optional keys.
    for (const [key, subSchema] of Object.entries(schema.properties ?? {})) {
      const subPath = path ? `${path}.${key}` : key;
      const present = key in inputObj;
      if (present) {
        result[key] = validateNode(inputObj[key], subSchema, subPath, errors);
      } else if (subSchema.default !== undefined) {
        result[key] = subSchema.default;
      }
    }

    // Preserve unknown properties when additionalProperties is not false
    // (spec: unspecified = true).
    if (schema.additionalProperties !== false) {
      for (const [key, value] of Object.entries(inputObj)) {
        if (!known.has(key)) result[key] = value;
      }
    }

    return result;
  }

  // No `type` specified — pass-through.
  return input;
}
