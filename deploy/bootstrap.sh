#!/usr/bin/env bash
# VM startup script, installed by the operator, never executed from a CI checkout.
set -euo pipefail
umask 077
if test -f /var/lib/flock/bootstrap-complete; then exit 0; fi
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg jq python3 openssl docker.io xfsprogs
install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | gpg --dearmor --yes -o /etc/apt/keyrings/mongodb.gpg
echo 'deb [arch=amd64 signed-by=/etc/apt/keyrings/mongodb.gpg] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse' > /etc/apt/sources.list.d/mongodb.list
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/caddy.gpg
echo 'deb [signed-by=/etc/apt/keyrings/caddy.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main' > /etc/apt/sources.list.d/caddy.list
chmod 0644 /etc/apt/keyrings/*.gpg
apt-get update -qq
apt-get install -y -qq mongodb-org-server=7.0.31 mongodb-mongosh mongodb-database-tools caddy
apt-mark hold mongodb-org-server
systemctl disable --now mongod || true
systemctl enable --now docker

install -d -m 0755 /var/lib/flock /srv/flock-data /etc/flock
install -d -m 0700 /etc/flock/private /var/lib/flock/releases
disk=/dev/disk/by-id/google-flock-data
for attempt in $(seq 1 30); do test -b "$disk" && break; sleep 2; done
test -b "$disk"
# Only a newly-created empty disk can be formatted. An existing filesystem is reused.
if ! blkid "$disk" >/dev/null; then mkfs.xfs "$disk"; fi
test "$(blkid -s TYPE -o value "$disk")" = xfs
uuid=$(blkid -s UUID -o value "$disk")
if ! grep -q "UUID=$uuid " /etc/fstab; then printf 'UUID=%s /srv/flock-data xfs defaults 0 2\n' "$uuid" >> /etc/fstab; fi
mountpoint -q /srv/flock-data || mount /srv/flock-data
install -d -o mongodb -g mongodb -m 0700 /srv/flock-data/mongo
test -e /srv/flock-data/.flock-disk || touch /srv/flock-data/.flock-disk

token=$(curl -fsS -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token | jq -r .access_token)
curl -fsS -H "Authorization: Bearer $token" 'https://secretmanager.googleapis.com/v1/projects/theflock-icet/secrets/flock-preview/versions/latest:access' | jq -r .payload.data | base64 -d > /etc/flock/private/bootstrap.json
unset token
python3 - <<'PY'
import json,os
from urllib.parse import quote
p='/etc/flock/private/'
s=json.load(open(p+'bootstrap.json'))
runtime={'mongoUri':'mongodb://flock_app:'+quote(s['mongoAppPassword'],safe='')+'@127.0.0.1:27017/flock_preview?authSource=flock_preview&replicaSet=rs0','databaseName':'flock_preview','sessionSecret':s['sessionSecret'],'origin':'https://theflock.icet-lab.eu','preview':{'mode':'preview','gatewaySecret':s['gatewaySecret'],'revision':'0'*40}}
with open(p+'runtime.json','w') as f: json.dump(runtime,f)
os.chown(p+'runtime.json',1000,1000);os.chmod(p+'runtime.json',0o400)
with open(p+'mongo.key','w') as f: f.write(s['mongoKey'])
os.chmod(p+'mongo.key',0o400)
with open(p+'initialize.js','w') as f:
 f.write('const s='+json.dumps(s)+';\n')
 f.write("try { rs.status(); } catch (e) { if(e.code===94) rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27017'}]}); else throw e; }\n")
 f.write("while(!db.hello().isWritablePrimary) sleep(250);\n")
 f.write("db.getSiblingDB('admin').createUser({user:'flock_admin',pwd:s.mongoAdminPassword,roles:['root']});\n")
with open(p+'users.js','w') as f:
 f.write('const s='+json.dumps(s)+';\n')
 f.write("db.getSiblingDB('admin').auth('flock_admin',s.mongoAdminPassword);\n")
 f.write("const app=db.getSiblingDB('flock_preview'); if(!app.getUser('flock_app')) app.createUser({user:'flock_app',pwd:s.mongoAppPassword,roles:[{role:'readWrite',db:'flock_preview'}]});\n")
 f.write("const admin=db.getSiblingDB('admin'); if(!admin.getUser('flock_backup')) admin.createUser({user:'flock_backup',pwd:s.mongoBackupPassword,roles:['backup']});\n")
 f.write("print('Database users ready');\n")
PY
# Mongo needs to traverse the directory but cannot read the other private files.
install -o mongodb -g mongodb -m 0400 /etc/flock/private/mongo.key /etc/flock/mongo.key
cat > /etc/flock/mongod.conf <<'CONF'
storage:
  dbPath: /srv/flock-data/mongo
  wiredTiger:
    engineConfig:
      cacheSizeGB: 0.256
net:
  bindIp: 127.0.0.1
  port: 27017
security:
  authorization: enabled
  keyFile: /etc/flock/mongo.key
replication:
  replSetName: rs0
  oplogSizeMB: 128
setParameter:
  diagnosticDataCollectionEnabled: false
CONF
chmod 0644 /etc/flock/mongod.conf
cat > /etc/systemd/system/flock-mongo.service <<'UNIT'
[Unit]
Description=Flock authenticated MongoDB
After=network.target
RequiresMountsFor=/srv/flock-data
ConditionPathExists=/srv/flock-data/.flock-disk
[Service]
User=mongodb
Group=mongodb
ExecStart=/usr/bin/mongod --config /etc/flock/mongod.conf
Restart=on-failure
RestartSec=5
LimitNOFILE=64000
MemoryHigh=480M
MemoryMax=600M
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/srv/flock-data/mongo
TimeoutStopSec=90
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now flock-mongo
for attempt in $(seq 1 60); do mongosh --quiet --host 127.0.0.1 --eval 'db.hello().ok' >/dev/null 2>&1 && break; sleep 2; done
if ! test -f /srv/flock-data/.users-created; then
  # A partial first bootstrap can have created the administrator already.
  mongosh --quiet --host 127.0.0.1 /etc/flock/private/initialize.js >/dev/null 2>&1 || true
  mongosh --quiet --host 127.0.0.1 /etc/flock/private/users.js
  touch /srv/flock-data/.users-created
fi
rm -f /etc/flock/private/initialize.js /etc/flock/private/users.js

# Only root-owned operator helpers may obtain VM/cloud credentials.
iptables -C OUTPUT -d 169.254.169.254 -m owner --uid-owner 1-4294967294 -j REJECT 2>/dev/null || iptables -A OUTPUT -d 169.254.169.254 -m owner --uid-owner 1-4294967294 -j REJECT
cat > /etc/systemd/system/flock-metadata-guard.service <<'UNIT'
[Unit]
Description=Block Flock application access to VM metadata
Before=docker.service
[Service]
Type=oneshot
ExecStart=/bin/sh -c '/usr/sbin/iptables -C OUTPUT -d 169.254.169.254 -m owner --uid-owner 1-4294967294 -j REJECT 2>/dev/null || /usr/sbin/iptables -A OUTPUT -d 169.254.169.254 -m owner --uid-owner 1-4294967294 -j REJECT'
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable flock-metadata-guard

# Emergency headroom, not counted as RAM when validating the VM size.
if ! test -f /swapfile; then fallocate -l 1G /swapfile; chmod 0600 /swapfile; mkswap /swapfile >/dev/null; fi
swapon --show=NAME --noheadings | grep -qx /swapfile || swapon /swapfile
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' > /etc/sysctl.d/90-flock.conf
sysctl -p /etc/sysctl.d/90-flock.conf

preview_hash=$(jq -r .previewPassword /etc/flock/private/bootstrap.json | caddy hash-password)
preview_user=$(jq -r .previewUsername /etc/flock/private/bootstrap.json)
gateway=$(jq -r .gatewaySecret /etc/flock/private/bootstrap.json)
cat > /etc/caddy/Caddyfile <<CONF
{
  admin off
}
theflock.icet-lab.eu {
  encode zstd gzip
  basic_auth {
    $preview_user $preview_hash
  }
  header X-Robots-Tag "noindex, nofollow, noarchive"
  header Strict-Transport-Security "max-age=31536000"
  reverse_proxy 127.0.0.1:4300 {
    header_up X-Flock-Gateway "$gateway"
    header_up -Authorization
  }
}
CONF
chown root:caddy /etc/caddy/Caddyfile
chmod 0640 /etc/caddy/Caddyfile
unset gateway preview_hash
caddy validate --config /etc/caddy/Caddyfile
systemctl enable caddy
systemctl restart caddy
apt-get clean
touch /var/lib/flock/bootstrap-complete
echo 'Flock VM bootstrap complete; application awaits a verified release.'
