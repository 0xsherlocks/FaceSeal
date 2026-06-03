/**
 * AWS Sync & Purge — offline-first sync mechanism.
 * Verification logs are stored locally, synced to AWS when connectivity
 * is restored, then purged from the device after successful upload.
 */
import { getVerifications, markSynced, purgeSynced, getPendingSyncCount } from './SQLiteLogger';

// TODO: Replace with real AWS endpoint
const AWS_ENDPOINT = 'https://api.datalake3.nhai.gov.in/sync/verifications';

export type SyncResult = {
  uploaded: number;
  purged: number;
  error?: string;
};

export async function syncToAws(): Promise<SyncResult> {
  try {
    const records = await getVerifications();
    const pending = records.filter(r => r.sync_status === 'pending');
    if (pending.length === 0) {
      return { uploaded: 0, purged: 0 };
    }

    // Attempt upload
    const response = await fetch(AWS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verifications: pending }),
    });

    if (!response.ok) {
      return { uploaded: 0, purged: 0, error: `HTTP ${response.status}` };
    }

    // Mark as synced
    const ids = pending.map(r => r.id);
    await markSynced(ids);

    // Purge synced records
    const purged = await purgeSynced();

    return { uploaded: ids.length, purged };
  } catch (err: any) {
    return { uploaded: 0, purged: 0, error: err?.message ?? 'Sync failed' };
  }
}

export async function getSyncStatus(): Promise<{ pending: number; online: boolean }> {
  const pending = await getPendingSyncCount();
  // Simple connectivity check
  let online = false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    await fetch('https://www.google.com', { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeout);
    online = true;
  } catch {
    online = false;
  }
  return { pending, online };
}
