#!/bin/bash
#
# What the instance does to itself on first boot, passed as EC2 user-data.
#
# Here rather than in a list of commands somebody pastes, because the box will
# be rebuilt one day — after an instance type change, a region move, or the
# morning it will not come back — and a hand-built machine is one nobody can
# rebuild the same way twice.
#
# Runs as root, once, before anyone logs in. Its output is in
# /var/log/cloud-init-output.log, and it leaves /var/lib/fas-bootstrap-done
# behind so a deploy can tell the difference between "still booting" and
# "booted and broken".
set -eux

dnf install -y docker git rsync

systemctl enable --now docker
usermod -aG docker ec2-user

# Amazon Linux 2023 packages the Docker engine and neither CLI plugin.
install -d /usr/libexec/docker/cli-plugins
curl -fsSL -o /usr/libexec/docker/cli-plugins/docker-compose \
  https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64
chmod +x /usr/libexec/docker/cli-plugins/docker-compose

# buildx as well: `docker compose build` refuses to run without it, and the
# error names a version rather than saying the plugin is absent. Its release
# assets carry the version in the filename, so there is no /latest/download
# shortcut — the tag has to be asked for first.
BUILDX=$(curl -fsSL https://api.github.com/repos/docker/buildx/releases/latest \
  | grep -o '"tag_name": "[^"]*' | cut -d'"' -f4)
curl -fsSL -o /usr/libexec/docker/cli-plugins/docker-buildx \
  "https://github.com/docker/buildx/releases/download/${BUILDX}/buildx-${BUILDX}.linux-amd64"
chmod +x /usr/libexec/docker/cli-plugins/docker-buildx

# Swap. `npm ci` and tsc do not fit in 1 GB, and what they do instead of
# failing honestly is get the build OOM-killed with no line saying why.
if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=1M count=4096
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
# Swap is here for the build, not to be lived in: prefer RAM while serving.
sysctl -w vm.swappiness=10
echo 'vm.swappiness=10' > /etc/sysctl.d/99-fas.conf

install -d -o ec2-user -g ec2-user /srv/fas /srv/fas/deploy

# Docker keeps every layer of every build otherwise, and this box has one disk.
cat > /etc/cron.weekly/fas-docker-prune <<'CRON'
#!/bin/sh
docker image prune -af --filter "until=168h" >/dev/null 2>&1 || true
CRON
chmod +x /etc/cron.weekly/fas-docker-prune

touch /var/lib/fas-bootstrap-done
