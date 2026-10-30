import {connectDatabase} from './database.ts';
import {seedDatabase} from './seed.ts';
import {schemaReady} from './migrations.ts';
import {assertNoLegacyApiListener} from './cutover.ts';
const {client,db}=await connectDatabase();
try {if(!await schemaReady(db))await assertNoLegacyApiListener();await seedDatabase(db,{allowLegacyCutover:process.env.FLOCK_ALLOW_COMMUNITY_CUTOVER==='1'});console.log(`Fictional prototype data ready in ${db.databaseName}; existing contributions preserved.`);} finally {await client.close();}
