#!/usr/bin/env bash
# Run as root in the operator's uploaded, private installation directory.
set -euo pipefail
test "$(id -u)" = 0
test -f /var/lib/flock/bootstrap-complete
install -o root -g root -m 0755 flock-deploy.py /usr/local/sbin/flock-deploy
install -o root -g root -m 0755 flock-backup.py /usr/local/sbin/flock-backup
install -o root -g root -m 0644 release-public.pem /etc/flock/release-public.pem
echo 'sa_109721855212402427270 ALL=(root) NOPASSWD: /usr/local/sbin/flock-deploy' > /etc/sudoers.d/flock-deploy
chmod 0440 /etc/sudoers.d/flock-deploy
visudo -cf /etc/sudoers.d/flock-deploy
cat > /etc/systemd/system/flock-release-recovery.service <<'UNIT'
[Unit]
Description=Recover interrupted Flock release before serving HTTPS
After=docker.service flock-mongo.service network-online.target
Requires=docker.service flock-mongo.service
Before=caddy.service
RequiresMountsFor=/srv/flock-data
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/flock-deploy --recover
RemainAfterExit=yes
TimeoutStartSec=2min
[Install]
WantedBy=multi-user.target
UNIT
install -d -m 0755 /etc/systemd/system/caddy.service.d
cat > /etc/systemd/system/caddy.service.d/flock-recovery.conf <<'UNIT'
[Unit]
Requires=flock-release-recovery.service
After=flock-release-recovery.service
UNIT
cat > /etc/systemd/system/flock-backup.service <<'UNIT'
[Unit]
Description=Flock private off-VM MongoDB backup
After=flock-mongo.service network-online.target
Requires=flock-mongo.service
RequiresMountsFor=/srv/flock-data
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/flock-backup
UMask=0077
TimeoutStartSec=15min
Nice=10
UNIT
cat > /etc/systemd/system/flock-backup.timer <<'UNIT'
[Unit]
Description=Back up the Flock preview every four hours
[Timer]
OnBootSec=15min
OnUnitActiveSec=4h
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now flock-release-recovery
systemctl enable --now flock-backup.timer
# Also block non-root SSH sessions from reading the VM service-account token.
iptables -C OUTPUT -d 169.254.169.254 -m owner --uid-owner 1-4294967294 -j REJECT 2>/dev/null || iptables -A OUTPUT -d 169.254.169.254 -m owner --uid-owner 1-4294967294 -j REJECT
sed -i 's/--uid-owner 1000/--uid-owner 1-4294967294/g' /etc/systemd/system/flock-metadata-guard.service
systemctl daemon-reload
echo 'Constrained deployment helper and backup timer installed.'
if ! grep -q 'encode zstd gzip' /etc/caddy/Caddyfile; then
  sed -i '/^theflock.icet-lab.eu {/a\  encode zstd gzip' /etc/caddy/Caddyfile
  caddy validate --config /etc/caddy/Caddyfile
  systemctl restart caddy
fi
