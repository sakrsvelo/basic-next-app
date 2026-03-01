import { Pool, PoolClient, QueryResultRow, QueryResult } from 'pg';

const globalForPool = global as unknown as { pool: Pool };

// Determine if we are in a serverless environment (Vercel)
const isServerless = process.env.VERCEL === '1';
 
const connectionConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_HOST && process.env.DB_HOST.includes('localhost') ? false : {
    rejectUnauthorized: false, 
  },
  // Optimize for serverless: use fewer connections per instance to avoid exhaustion
  max: isServerless ? 2 : 20,
  idleTimeoutMillis: 30000,
  // Allow slightly longer for initial connection in production
  connectionTimeoutMillis: isServerless ? 15000 : 5000,
};

// Fallback to connection string if individual vars are missing but DATABASE_URL is present
const finalConfig = (process.env.DB_HOST) 
  ? connectionConfig 
  : { 
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: isServerless ? 2 : 20,
      connectionTimeoutMillis: isServerless ? 15000 : 5000,
    };

// Always log config in production for debugging the "hang" issue
console.log(`[DB Config] Host=${process.env.DB_HOST || 'via-url'}, User=${process.env.DB_USER}, SSL=${!!finalConfig.ssl}, Max=${finalConfig.max}, Timeout=${finalConfig.connectionTimeoutMillis}`);

export const pool = globalForPool.pool || new Pool(finalConfig);

if (process.env.NODE_ENV !== 'production') globalForPool.pool = pool;

// Debug: Log connection status
pool.on('error', (err) => {
  console.error('[DB Error] Unexpected error on idle client', err);
});

pool.on('connect', () => {
    console.log('[DB] New client connected to pool');
});

pool.on('remove', () => {
    console.log('[DB] Client removed from pool');
});

// Verify connection on startup ONLY in development
// In production/serverless, this adds latency to cold starts and might timeout
if (process.env.NODE_ENV !== 'production') {
    (async () => {
      try {
        if (!process.env.DB_HOST && !process.env.DATABASE_URL) {
          console.warn("⚠️ Skipping DB connection verification because configuration is missing");
          return;
        }
        console.log("ℹ️ Attempting to connect to database...");
        const client = await pool.connect();
        console.log('✅ Database connected successfully');
        client.release();
      } catch (err) {
        console.error('❌ Database connection failed:', err);
      }
    })();
}

// ----------------------------
// Reusable query function
// Using 'unknown' or a generic T instead of 'any'
// ----------------------------
export const query = <T extends QueryResultRow = QueryResultRow>(
  text: string, 
  params?: unknown[]
): Promise<QueryResult<T>> => pool.query<T>(text, params);
