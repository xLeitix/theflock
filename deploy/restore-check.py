#!/usr/bin/python3
"""Operator-only logical restore check into a fresh, unserved database namespace.

The archive must be downloaded by the operator: the VM's backup identity can
create objects but cannot read or delete old backups. This does not perform a
full instance/oplog disaster recovery rehearsal.
"""
import json, os, subprocess, sys, tempfile, uuid
from pathlib import Path

if os.geteuid()!=0 or len(sys.argv)!=2:
    raise SystemExit('Run as root with the operator-downloaded archive path.')
archive=Path(sys.argv[1]).resolve()
if not archive.is_file():
    raise SystemExit('Backup archive is missing.')
target='flock_restorecheck_'+uuid.uuid4().hex
with tempfile.TemporaryDirectory(prefix='flock-restore-',dir='/srv/flock-data') as directory:
    temp=Path(directory)
    secrets=json.loads(Path('/etc/flock/private/bootstrap.json').read_text())
    config=temp/'restore.yml'
    config.write_text('password: '+json.dumps(secrets['mongoAdminPassword'])+'\n');os.chmod(config,0o600)
    auth="db.getSiblingDB('admin').auth('flock_admin',"+json.dumps(secrets['mongoAdminPassword'])+");\n"
    check=temp/'check.js'
    check.write_text(auth+"const target="+json.dumps(target)+"; const original=db.getSiblingDB('flock_preview'); const restored=db.getSiblingDB(target); const counts={};\n"+
      "for(const name of ['places','feedings','careCases','careEvents','users']) { const a=original.getCollection(name).countDocuments({}); const b=restored.getCollection(name).countDocuments({}); if(a!==b) throw new Error(name+' count mismatch'); counts[name]=b; }\n"+
      "if(counts.places<4 || counts.feedings<16) throw new Error('Expected populated preview fixture data');\n"+
      "if(!restored.migrations.findOne({_id:'community-care-v2',status:'complete'})) throw new Error('Schema marker absent');\n"+
      "if(!restored.places.getIndexes().some(i=>i.key.location==='2dsphere')) throw new Error('Geospatial index absent');\n"+
      "print(JSON.stringify({restoredDatabase:target,counts,indexesVerified:true}));\n")
    cleanup=temp/'cleanup.js'
    cleanup.write_text(auth+"const name="+json.dumps(target)+"; if(!/^flock_restorecheck_[a-f0-9]{32}$/.test(name)) throw new Error('Unsafe cleanup target'); db.getSiblingDB(name).dropDatabase();\n")
    try:
        subprocess.run(['mongorestore','--host','127.0.0.1:27017','--username','flock_admin','--authenticationDatabase','admin','--config',str(config),'--gzip','--archive='+str(archive),'--nsInclude=flock_preview.*','--nsFrom=flock_preview.*','--nsTo='+target+'.*'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        subprocess.run(['mongosh','--quiet','--host','127.0.0.1',str(check)],check=True)
    finally:
        subprocess.run(['mongosh','--quiet','--host','127.0.0.1',str(cleanup)],check=True,stdout=subprocess.DEVNULL)
