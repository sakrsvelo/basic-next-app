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
  max: isServerless ? 1 : 10, // Reduce max connections to 1 for Vercel to avoid "too many clients"
  idleTimeoutMillis: 10000, // Close idle clients faster (10s) to avoid "Connection terminated" on stale connections
  // Allow slightly longer for initial connection in production
  connectionTimeoutMillis: isServerless ? 10000 : 5000,
  keepAlive: true, // Enable TCP keepalive
};

// Fallback to connection string if individual vars are missing but DATABASE_URL is present
// We prioritize explicit host/user/pass configuration if fully available
const useExplicitConfig = process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD;

const finalConfig = useExplicitConfig
  ? connectionConfig 
  : { 
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
      max: isServerless ? 1 : 10,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: isServerless ? 10000 : 5000,
      keepAlive: true,
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
export const query = async <T extends QueryResultRow = QueryResultRow>(
  text: string, 
  params?: unknown[]
): Promise<QueryResult<T>> => {
  try {
    return await pool.query<T>(text, params);
  } catch (error: any) {
    // If connection terminated unexpectedly, retry once
    if (error.message?.includes('Connection terminated') || error.code === '57P01') {
      console.warn('⚠️ DB Connection terminated, retrying query...');
      return await pool.query<T>(text, params);
    }
    throw error;
  }
};
