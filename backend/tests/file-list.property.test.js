/**
 * Property-Based Test: Shared file list completeness
 *
 * Property 15: File list contains all required fields for every file
 * Validates: Requirements 6.7
 *
 * Tests the schema/field completeness of files in history results.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

const REQUIRED_FIELDS = [
  "id",
  "session_id",
  "sender_name",
  "file_name",
  "mime_type",
  "file_size",
  "file_url",
  "created_at",
];

/**
 * Pure validator to check field presence
 * @param {Array<object>} files
 * @returns {boolean} - true if all fields are validly populated
 */
function validateFileList(files) {
  return files.every((file) =>
    REQUIRED_FIELDS.every(
      (field) => 
        field in file && 
        file[field] !== null && 
        file[field] !== undefined
    )
  );
}

// Generate a valid file record
const validFileArb = fc.record({
  id: fc.uuid(),
  session_id: fc.uuid(),
  sender_name: fc.string({ minLength: 1 }),
  file_name: fc.string({ minLength: 1 }),
  mime_type: fc.constantFrom("image/jpeg", "image/png", "application/pdf"),
  file_size: fc.integer({ min: 1 }),
  file_url: fc.string({ minLength: 1 }),
  created_at: fc.integer({ min: 946684800000, max: 4102444800000 }).map(ts => new Date(ts).toISOString()),
});

describe("Shared file list schema completeness — Property 15 (Validates: Requirements 6.7)", () => {
  /**
   * Property A: For any list of records where all objects contain all required fields,
   * validateFileList must return true.
   */
  it("returns true if all file records contain all mandatory fields", () => {
    fc.assert(
      fc.property(fc.array(validFileArb), (files) => {
        expect(validateFileList(files)).toBe(true);
      })
    );
  });

  /**
   * Property B: If any single record is missing even one required field,
   * validateFileList must return false.
   */
  it("returns false if any single file record is missing any required field", () => {
    // Pick a field to omit
    const fieldToOmitArb = fc.constantFrom(...REQUIRED_FIELDS);

    fc.assert(
      fc.property(
        validFileArb,
        fc.array(validFileArb),
        fieldToOmitArb,
        (targetFile, otherFiles, fieldToOmit) => {
          // Delete the selected field from the target file
          const modifiedFile = { ...targetFile };
          delete modifiedFile[fieldToOmit];

          const list = [modifiedFile, ...otherFiles];
          expect(validateFileList(list)).toBe(false);
        }
      )
    );
  });
});
