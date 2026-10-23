try{process.loadEnvFile('.env.local');}catch{}
require('../server/database.cjs').ensureSchema().then(()=>console.log('Tablas del historial listas.')).catch(error=>{console.error('No se pudieron crear las tablas. Revisa DATABASE_URL.',error.code||'');process.exitCode=1;});
