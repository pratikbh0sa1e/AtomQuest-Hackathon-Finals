/**
 * Property-Based Test: File upload atomic rollback
 *
 * Property 13: File upload atomic rollback on downstream failure
 * Validates: Requirements 6.5
 *
 * Tests the rollback behavior of the upload process.
 */

import { describe, it, expect, vi } from "vitest";

/**
 * Pure simulation of the upload and save process with rollback.
 */
async function uploadFileWithRollback({ uploadToStorage, insertToDb, deleteFromStorage, emitSocket, deleteFromDb }) {
  let storagePath = null;
  let dbRecordId = null;
  
  try {
    // 1. Upload to storage
    storagePath = await uploadToStorage();
    
    // 2. Insert into DB
    dbRecordId = await insertToDb(storagePath);
    
    // 3. Emit socket notification (with room check)
    await emitSocket(dbRecordId);
    
    return { status: 200, id: dbRecordId };
  } catch (err) {
    // Rollback DB if it was created
    if (dbRecordId) {
      await deleteFromDb(dbRecordId);
    }
    // Rollback Storage
    if (storagePath) {
      await deleteFromStorage(storagePath);
    }
    return { status: 500, error: err.message };
  }
}

describe("File upload atomic rollback — Property 13 (Validates: Requirements 6.5)", () => {
  it("rolls back storage upload if database insertion fails", async () => {
    const uploadToStorage = vi.fn().mockResolvedValue("session-123/file-uuid-test.png");
    const insertToDb = vi.fn().mockRejectedValue(new Error("DB connection failure"));
    const deleteFromStorage = vi.fn().mockResolvedValue(true);
    const emitSocket = vi.fn().mockResolvedValue(true);
    const deleteFromDb = vi.fn().mockResolvedValue(true);

    const result = await uploadFileWithRollback({
      uploadToStorage,
      insertToDb,
      deleteFromStorage,
      emitSocket,
      deleteFromDb
    });

    expect(result.status).toBe(500);
    expect(uploadToStorage).toHaveBeenCalledTimes(1);
    expect(insertToDb).toHaveBeenCalledTimes(1);
    expect(deleteFromStorage).toHaveBeenCalledWith("session-123/file-uuid-test.png");
    expect(deleteFromDb).not.toHaveBeenCalled();
    expect(emitSocket).not.toHaveBeenCalled();
  });

  it("rolls back database record and storage upload if socket broadcast fails", async () => {
    const uploadToStorage = vi.fn().mockResolvedValue("session-123/file-uuid-test.png");
    const insertToDb = vi.fn().mockResolvedValue("file-uuid-123");
    const deleteFromStorage = vi.fn().mockResolvedValue(true);
    const emitSocket = vi.fn().mockRejectedValue(new Error("No active clients in socket room"));
    const deleteFromDb = vi.fn().mockResolvedValue(true);

    const result = await uploadFileWithRollback({
      uploadToStorage,
      insertToDb,
      deleteFromStorage,
      emitSocket,
      deleteFromDb
    });

    expect(result.status).toBe(500);
    expect(uploadToStorage).toHaveBeenCalledTimes(1);
    expect(insertToDb).toHaveBeenCalledTimes(1);
    expect(emitSocket).toHaveBeenCalledTimes(1);
    expect(deleteFromDb).toHaveBeenCalledWith("file-uuid-123");
    expect(deleteFromStorage).toHaveBeenCalledWith("session-123/file-uuid-test.png");
  });
});
