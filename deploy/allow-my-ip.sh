#!/usr/bin/env bash
#
# Let this machine's current address reach port 22, and no other address.
#
#   AWS_PROFILE=fas deploy/allow-my-ip.sh staging
#
# Home broadband hands out a new address every so often, and a security group
# pinned to yesterday's is a production box nobody can log into. This re-points
# the rule at wherever you are now, and removes where you were.
set -euo pipefail

. "$(cd "$(dirname "$0")" && pwd)/env.sh" "${1:-}"
REGION="$FAS_REGION"
NAME="$FAS_NAME"
ME="$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')/32"

# The group the box is actually in, asked of the box rather than guessed from
# its name. The name was guessed as fas-$FAS_ENV, the staging box is in a group
# called fas-prod, and this script — whose entire job is to restore SSH when
# your address changes — failed with `Invalid id: "None"` at exactly the moment
# you could no longer log in to investigate. Whatever the group is called, the
# instance knows.
SG=$(aws --region "$REGION" ec2 describe-instances \
  --filters "Name=tag:Name,Values=$NAME" "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[0].SecurityGroups[0].GroupId' --output text)

if [ -z "$SG" ] || [ "$SG" = "None" ]; then
  echo "No running instance tagged Name=$NAME in $REGION." >&2
  echo "Instances that are running there:" >&2
  aws --region "$REGION" ec2 describe-instances \
    --filters "Name=instance-state-name,Values=running" \
    --query 'Reservations[].Instances[].{Name:Tags[?Key==`Name`]|[0].Value,Sg:SecurityGroups[0].GroupId,Ip:PublicIpAddress}' \
    --output text >&2
  exit 1
fi

# Every address that can currently reach 22, so the old one goes when it does.
OLD=$(aws --region "$REGION" ec2 describe-security-groups --group-ids "$SG" \
  --query "SecurityGroups[0].IpPermissions[?FromPort==\`22\`].IpRanges[].CidrIp" \
  --output text)

for cidr in $OLD; do
  [ "$cidr" = "$ME" ] && continue
  aws --region "$REGION" ec2 revoke-security-group-ingress --group-id "$SG" \
    --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$cidr}]" >/dev/null
  echo "removed $cidr"
done

if ! printf '%s\n' $OLD | grep -qx "$ME"; then
  aws --region "$REGION" ec2 authorize-security-group-ingress --group-id "$SG" \
    --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$ME,Description=laptop}]" >/dev/null
  echo "ssh now allowed from $ME"
else
  echo "ssh already allowed from $ME"
fi
