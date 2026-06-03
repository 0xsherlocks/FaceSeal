import { open } from 'react-native-quick-sqlite';

// Bumped DB name to force fresh schema — old db had missing columns
const DB_NAME = 'faceseal_v2.db';
let dbReady: Promise<void> | null = null;

function getDb() {
  return open({ name: DB_NAME });
}

export function ensureSchema(): Promise<void> {
  if (dbReady) {
    return dbReady;
  }
  dbReady = new Promise((resolve, reject) => {
    try {
      const db = getDb();
      // Drop old tables if they exist with wrong schema (migration)
      db.execute('DROP TABLE IF EXISTS workers;');
      db.execute('DROP TABLE IF EXISTS verifications;');
      db.execute(`CREATE TABLE IF NOT EXISTS workers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        department TEXT NOT NULL,
        face_embedding TEXT NOT NULL,
        enrolled_at INTEGER NOT NULL
      );`);
      db.execute(`CREATE TABLE IF NOT EXISTS verifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        worker_id INTEGER,
        worker_name TEXT,
        timestamp INTEGER NOT NULL,
        gps_lat REAL,
        gps_lng REAL,
        result TEXT NOT NULL,
        liveness_score REAL,
        confidence REAL,
        sync_status TEXT DEFAULT 'pending'
      );`);
      resolve();
    } catch (err) {
      dbReady = null;
      reject(err);
    }
  });
  return dbReady;
}

export type WorkerRecord = {
  id: number;
  name: string;
  department: string;
  face_embedding: number[];
  enrolled_at: number;
};

export async function enrollWorker(
  name: string,
  department: string,
  embedding: number[],
): Promise<number> {
  await ensureSchema();
  const db = getDb();
  const r = db.execute(
    'INSERT INTO workers (name, department, face_embedding, enrolled_at) VALUES (?, ?, ?, ?);',
    [name, department, JSON.stringify(embedding), Date.now()],
  );
  return r.insertId ?? -1;
}

export async function getAllWorkers(): Promise<WorkerRecord[]> {
  await ensureSchema();
  const db = getDb();
  const r = db.execute('SELECT * FROM workers ORDER BY enrolled_at DESC;');
  return (r.rows?._array ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    department: row.department,
    face_embedding: JSON.parse(row.face_embedding),
    enrolled_at: row.enrolled_at,
  }));
}

export async function getWorkerCount(): Promise<number> {
  await ensureSchema();
  const db = getDb();
  const r = db.execute('SELECT COUNT(*) as cnt FROM workers;');
  return r.rows?._array?.[0]?.cnt ?? 0;
}

export type VerificationRecord = {
  id: number;
  worker_id: number | null;
  worker_name: string | null;
  timestamp: number;
  gps_lat: number | null;
  gps_lng: number | null;
  result: string;
  liveness_score: number | null;
  confidence: number | null;
  sync_status: string;
};

export async function logVerification(entry: {
  worker_id?: number | null;
  worker_name?: string | null;
  timestamp: number;
  gps_lat?: number | null;
  gps_lng?: number | null;
  result: string;
  liveness_score?: number | null;
  confidence?: number | null;
}): Promise<void> {
  await ensureSchema();
  const db = getDb();
  db.execute(
    `INSERT INTO verifications
     (worker_id, worker_name, timestamp, gps_lat, gps_lng, result, liveness_score, confidence, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending');`,
    [
      entry.worker_id ?? null,
      entry.worker_name ?? null,
      entry.timestamp,
      entry.gps_lat ?? null,
      entry.gps_lng ?? null,
      entry.result,
      entry.liveness_score ?? null,
      entry.confidence ?? null,
    ],
  );
}

export async function getVerifications(): Promise<VerificationRecord[]> {
  await ensureSchema();
  const db = getDb();
  const r = db.execute('SELECT * FROM verifications ORDER BY timestamp DESC LIMIT 100;');
  return r.rows?._array ?? [];
}

export async function getTodayCount(): Promise<number> {
  await ensureSchema();
  const db = getDb();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const r = db.execute('SELECT COUNT(*) as cnt FROM verifications WHERE timestamp >= ?;', [todayStart.getTime()]);
  return r.rows?._array?.[0]?.cnt ?? 0;
}

export async function getPendingSyncCount(): Promise<number> {
  await ensureSchema();
  const db = getDb();
  const r = db.execute("SELECT COUNT(*) as cnt FROM verifications WHERE sync_status = 'pending';");
  return r.rows?._array?.[0]?.cnt ?? 0;
}

export async function markSynced(ids: number[]): Promise<void> {
  if (ids.length === 0) { return; }
  await ensureSchema();
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  db.execute(`UPDATE verifications SET sync_status = 'synced' WHERE id IN (${placeholders});`, ids);
}

export async function purgeSynced(): Promise<number> {
  await ensureSchema();
  const db = getDb();
  const r = db.execute("DELETE FROM verifications WHERE sync_status = 'synced';");
  return r.rowsAffected ?? 0;
}

// ─── Demo Seed Data ─────────────────────────────────────────────────────────

const DUMMY_WORKERS = [
  { name: 'Amit Patel', department: 'Engineer' },
  { name: 'Priya Sharma', department: 'Inspector' },
  { name: 'Rahul Verma', department: 'Contractor' },
];

function makeDummyEmbedding(seed: number): number[] {
  const dim = 128;
  const arr: number[] = [];
  for (let i = 0; i < dim; i++) {
    arr.push(Math.sin(seed * (i + 1) * 0.1) / Math.sqrt(dim));
  }
  return arr;
}

export async function seedDummyData(): Promise<void> {
  await ensureSchema();
  const count = await getWorkerCount();
  if (count > 0) { return; } // Already seeded

  const db = getDb();
  const now = Date.now();

  // Seed workers
  for (let i = 0; i < DUMMY_WORKERS.length; i++) {
    const w = DUMMY_WORKERS[i];
    db.execute(
      'INSERT INTO workers (name, department, face_embedding, enrolled_at) VALUES (?, ?, ?, ?);',
      [w.name, w.department, JSON.stringify(makeDummyEmbedding(i + 1)), now - (i + 1) * 86400000],
    );
  }

  // Seed verification history
  const dummyLogs = [
    {
      worker_id: 1, worker_name: 'Amit Patel',
      timestamp: now - 3600000, // 1 hour ago
      gps_lat: 28.6139, gps_lng: 77.2090, // Delhi
      result: 'Verified', liveness_score: 0.94, confidence: 0.92,
    },
    {
      worker_id: null, worker_name: null,
      timestamp: now - 7200000, // 2 hours ago
      gps_lat: 19.0760, gps_lng: 72.8777, // Mumbai
      result: 'Spoof Detected', liveness_score: 0.22, confidence: null,
    },
    {
      worker_id: 2, worker_name: 'Priya Sharma',
      timestamp: now - 86400000, // yesterday
      gps_lat: 26.9124, gps_lng: 75.7873, // Jaipur
      result: 'Verified', liveness_score: 0.91, confidence: 0.88,
    },
  ];

  for (const log of dummyLogs) {
    db.execute(
      `INSERT INTO verifications
       (worker_id, worker_name, timestamp, gps_lat, gps_lng, result, liveness_score, confidence, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending');`,
      [log.worker_id, log.worker_name, log.timestamp, log.gps_lat, log.gps_lng, log.result, log.liveness_score, log.confidence],
    );
  }
}
