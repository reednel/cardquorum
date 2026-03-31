import {
  ZodBoolean,
  ZodEnum,
  ZodLiteral,
  ZodNullable,
  ZodNumber,
  ZodObject,
  ZodOptional,
  ZodType,
  ZodUnion,
} from 'zod';

export interface ConfigField {
  key: string;
  type: 'boolean' | 'select' | 'number';
  options?: { value: string | number | boolean | null; label: string }[];
}

/** Extract renderable field descriptors from a ZodObject shape. */
export function fieldsFromSchema(schema: ZodObject<any>): ConfigField[] {
  const shape = schema.shape as Record<string, ZodType>;
  return Object.keys(shape).map((key) => parseField(key, shape[key]));
}

function parseField(key: string, zodType: ZodType): ConfigField {
  const unwrapped = unwrap(zodType);
  const nullable = isNullable(zodType);

  if (unwrapped instanceof ZodBoolean) {
    if (nullable) {
      return {
        key,
        type: 'select',
        options: [
          { value: true, label: 'Yes' },
          { value: false, label: 'No' },
          { value: null, label: 'N/A' },
        ],
      };
    }
    return { key, type: 'boolean' };
  }

  if (unwrapped instanceof ZodEnum) {
    const opts: ConfigField['options'] = (unwrapped.options as string[]).map((v) => ({
      value: v,
      label: labelFromValue(v),
    }));
    if (nullable) opts!.push({ value: null, label: 'None' });
    return { key, type: 'select', options: opts };
  }

  if (unwrapped instanceof ZodUnion) {
    const literals = ((unwrapped as any).options as any[])
      .filter((o: any): o is ZodLiteral<any> => o instanceof ZodLiteral)
      .map((l: any) => l.value);
    if (literals.length > 0) {
      return {
        key,
        type: 'select',
        options: literals.map((v: any) => ({ value: v, label: String(v) })),
      };
    }
  }

  if (unwrapped instanceof ZodNumber) {
    if (nullable) {
      return { key, type: 'select', options: [{ value: null, label: 'None' }] };
    }
    return { key, type: 'number' };
  }

  return { key, type: 'boolean' };
}

function unwrap(z: ZodType): ZodType {
  if (z instanceof ZodNullable) return unwrap((z as any).unwrap());
  if (z instanceof ZodOptional) return unwrap((z as any).unwrap());
  return z;
}

function isNullable(z: ZodType): boolean {
  return z instanceof ZodNullable;
}

function labelFromValue(v: string): string {
  return v.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
