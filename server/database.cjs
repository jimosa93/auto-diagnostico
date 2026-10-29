'use strict';
const {neon}=require('@neondatabase/serverless');
const schema=[
 `CREATE TABLE IF NOT EXISTS ad_generator_events (id uuid PRIMARY KEY, action text NOT NULL CHECK(action IN ('save','export')), content_hash text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
 `CREATE INDEX IF NOT EXISTS ad_generator_created ON ad_generator_events(created_at DESC,id)`,
 `CREATE TABLE IF NOT EXISTS ad_reports (id uuid PRIMARY KEY, current_version uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
 `CREATE TABLE IF NOT EXISTS ad_report_writers (report_id uuid NOT NULL REFERENCES ad_reports(id), key_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(report_id,key_hash))`,
 `CREATE TABLE IF NOT EXISTS ad_write_limits (key text PRIMARY KEY, attempts integer NOT NULL, bytes bigint NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS ad_assets (hash text PRIMARY KEY, data text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), CHECK (length(data)<=4000000))`,
 `ALTER TABLE ad_assets ALTER COLUMN data DROP NOT NULL`,
 `ALTER TABLE ad_assets ADD COLUMN IF NOT EXISTS object_key text`,
 `ALTER TABLE ad_assets ADD COLUMN IF NOT EXISTS mime_type text`,
 `ALTER TABLE ad_assets ADD COLUMN IF NOT EXISTS byte_size bigint`,
 `ALTER TABLE ad_assets ADD COLUMN IF NOT EXISTS migrated_at timestamptz`,
 `CREATE TABLE IF NOT EXISTS ad_versions (id uuid PRIMARY KEY, report_id uuid NOT NULL REFERENCES ad_reports(id), content_hash text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(report_id,content_hash))`,
 `CREATE TABLE IF NOT EXISTS ad_events (id uuid PRIMARY KEY, report_id uuid NOT NULL REFERENCES ad_reports(id), version_id uuid NOT NULL REFERENCES ad_versions(id), action text NOT NULL CHECK(action IN ('save','download','preview')), created_at timestamptz NOT NULL DEFAULT now())`,
 `CREATE INDEX IF NOT EXISTS ad_reports_updated ON ad_reports(updated_at DESC,id)`,
 `CREATE INDEX IF NOT EXISTS ad_events_report ON ad_events(report_id,created_at DESC)`,
 `CREATE INDEX IF NOT EXISTS ad_versions_report ON ad_versions(report_id,created_at DESC)`,
 `CREATE TABLE IF NOT EXISTS ad_login_limits (key text PRIMARY KEY, attempts integer NOT NULL, expires_at timestamptz NOT NULL)`
];
let database,initialization;
function getDatabase(){
 if(!process.env.DATABASE_URL)throw Error('Database not configured');
 if(!database){const sql=neon(process.env.DATABASE_URL);database={
  query:(text,params=[])=>sql.query(text,params,{fetchOptions:{signal:AbortSignal.timeout(25000)}}),
  transaction:statements=>sql.transaction(statements.map(([text,params=[]])=>sql.query(text,params)),{fetchOptions:{signal:AbortSignal.timeout(25000)}})
 };}
 return database;
}
async function ensureSchema(db=getDatabase()){
 await db.transaction([['SELECT pg_advisory_xact_lock(724198103)'],...schema.map(text=>[text])]);
}
async function ready(){
 const db=getDatabase();
 if(!initialization)initialization=ensureSchema(db).catch(error=>{initialization=null;throw error;});
 await initialization;return db;
}
module.exports={schema,ensureSchema,ready};
