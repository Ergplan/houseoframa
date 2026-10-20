// Vendor routing and the guard for Invariant 5: the auditor is never the builder's vendor.

export const VENDORS = ['anthropic', 'openai'] as const;
export type Vendor = (typeof VENDORS)[number];
export type Role = 'builder' | 'auditor';

export class VendorGuardError extends Error {
  override name = 'VendorGuardError';
}

function parseVendor(key: string, value: string | undefined): Vendor {
  if (!value) throw new VendorGuardError(`${key} is not set`);
  if (!(VENDORS as readonly string[]).includes(value)) {
    throw new VendorGuardError(`${key}="${value}" is not a known vendor (${VENDORS.join(', ')})`);
  }
  return value as Vendor;
}

/** Reads BUILDER_VENDOR and AUDITOR_VENDOR and refuses when they are missing, unknown or equal. */
export function resolveVendors(env: Record<string, string | undefined>): Record<Role, Vendor> {
  const builder = parseVendor('BUILDER_VENDOR', env.BUILDER_VENDOR);
  const auditor = parseVendor('AUDITOR_VENDOR', env.AUDITOR_VENDOR);
  if (builder === auditor) {
    throw new VendorGuardError(
      `AUDITOR_VENDOR and BUILDER_VENDOR are both "${builder}": the auditor must be a different vendor from the builder (Invariant 5)`,
    );
  }
  return { builder, auditor };
}
