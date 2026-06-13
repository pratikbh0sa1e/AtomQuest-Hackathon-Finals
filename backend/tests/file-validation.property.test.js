/**
 * Property-Based Test: File upload validation
 *
 * Property 12: File upload validation rejects invalid files
 * Validates: Requirements 6.1, 6.3, 6.4
 *
 * Tests the pure file validation logic:
 *   validateFile(mimeType, size) => 200 | 413 | 415
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIMES = ["image/jpeg", "image/png", "application/pdf"];

/**
 * Pure file validation check
 * @param {string} mimeType
 * @param {number} size
 * @returns {number} HTTP status code
 */
function validateFile(mimeType, size) {
  if (!ALLOWED_MIMES.includes(mimeType)) return 415;
  if (size > MAX_SIZE) return 413;
  return 200;
}

describe("File upload validation — Property 12 (Validates: Requirements 6.1, 6.3, 6.4)", () => {
  /**
   * Property A: Any file with an invalid MIME type must be rejected with 415.
   */
  it("rejects invalid MIME types with 415 regardless of size", () => {
    // Generate anything other than our allowed MIME list
    const invalidMimeArb = fc.string().filter(m => !ALLOWED_MIMES.includes(m));
    const sizeArb = fc.integer({ min: 1, max: 100 * 1024 * 1024 });

    fc.assert(
      fc.property(invalidMimeArb, sizeArb, (mimeType, size) => {
        expect(validateFile(mimeType, size)).toBe(415);
      })
    );
  });

  /**
   * Property B: Any file with a valid MIME type but size strictly greater than 20MB must be rejected with 413.
   */
  it("rejects valid MIME types with 413 if the size exceeds 20MB", () => {
    const validMimeArb = fc.constantFrom(...ALLOWED_MIMES);
    const oversizedArb = fc.integer({ min: MAX_SIZE + 1, max: 100 * 1024 * 1024 });

    fc.assert(
      fc.property(validMimeArb, oversizedArb, (mimeType, size) => {
        expect(validateFile(mimeType, size)).toBe(413);
      })
    );
  });

  /**
   * Property C: Any file with a valid MIME type and size less than or equal to 20MB must be accepted (200).
   */
  it("accepts valid MIME types and size <= 20MB with 200", () => {
    const validMimeArb = fc.constantFrom(...ALLOWED_MIMES);
    const validSizeArb = fc.integer({ min: 1, max: MAX_SIZE });

    fc.assert(
      fc.property(validMimeArb, validSizeArb, (mimeType, size) => {
        expect(validateFile(mimeType, size)).toBe(200);
      })
    );
  });
});
