#!/usr/bin/env bash
#
# Build the AWS side of one environment. Idempotent: run it twice and the
# second run reports what already exists rather than making a second of
# everything.
#
#   AWS_PROFILE=fas deploy/provision-aws.sh staging
#   AWS_PROFILE=fas deploy/provision-aws.sh production
#
# Every resource carries the environment in its name — fas-staging-*,
# fas-production-* — so the two can sit in one AWS account without a chance of
# one being mistaken for the other. That is the whole reason this takes an
# argument: production is meant to be a second run of this script, not a second
# script, and the day it is stood up is not the day to be discovering which
# lines were hard-coded.
#
# Makes, in order: an S3 bucket and an IAM user that can reach only that
# bucket; a key pair from ~/.ssh/<name>.pub; a security group; an instance
# running deploy/cloud-init.sh; and an elastic IP attached to it.
#
# It prints the values that belong in deploy/env/<environment>.env and the A
# record that has to be added at BigRock. It does not write either — an env
# file and a DNS record are the two things worth a human looking at.
set -euo pipefail

. "$(cd "$(dirname "$0")" && pwd)/env.sh" "${1:-}"

REGION="$FAS_REGION"
NAME="$FAS_NAME"
BUCKET="${BUCKET:-${NAME}-files-$(aws sts get-caller-identity --query Account --output text)}"
KEY_FILE="${KEY_FILE:-$HOME/.ssh/${NAME}.pub}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

aws() { command aws --region "$REGION" "$@"; }
say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
exists() { [ -n "${1:-}" ] && [ "$1" != "None" ]; }

say "Environment $FAS_ENV — account $(command aws sts get-caller-identity --query Account --output text) in $REGION"

# ---------------------------------------------------------------------------
# Files. The Neon branch is capped at 0.5 GiB, so order photos and OTA bundles
# have to live somewhere that is not a Postgres row.
# ---------------------------------------------------------------------------
say "S3 bucket $BUCKET"
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "already exists"
else
  aws s3api create-bucket --bucket "$BUCKET" \
    --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
  echo "created"
fi

# Nothing in this bucket is meant to be readable by the internet. OTA bundles
# are served through the API, which signs them; order photos belong to a shop.
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
aws s3api put-bucket-encryption --bucket "$BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
# A shop's photos are not a thing to lose to a mistaken delete.
aws s3api put-bucket-versioning --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled

# ---------------------------------------------------------------------------
# The API's own S3 credentials, which can reach this bucket and nothing else.
# The deploy user is an administrator; the thing running in a container all
# year is not.
# ---------------------------------------------------------------------------
say "IAM user ${NAME}-s3"
if command aws iam get-user --user-name "${NAME}-s3" >/dev/null 2>&1; then
  echo "already exists"
else
  command aws iam create-user --user-name "${NAME}-s3" >/dev/null
  echo "created"
fi
command aws iam put-user-policy --user-name "${NAME}-s3" --policy-name files \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {\"Effect\": \"Allow\", \"Action\": [\"s3:ListBucket\"], \"Resource\": \"arn:aws:s3:::$BUCKET\"},
      {\"Effect\": \"Allow\",
       \"Action\": [\"s3:GetObject\", \"s3:PutObject\", \"s3:DeleteObject\"],
       \"Resource\": \"arn:aws:s3:::$BUCKET/*\"}
    ]
  }"

# ---------------------------------------------------------------------------
# The instance.
# ---------------------------------------------------------------------------
say "Key pair $NAME"
if aws ec2 describe-key-pairs --key-names "$NAME" >/dev/null 2>&1; then
  echo "already exists"
else
  aws ec2 import-key-pair --key-name "$NAME" \
    --public-key-material "fileb://$KEY_FILE" >/dev/null
  echo "imported from $KEY_FILE"
fi

say "Security group $NAME"
VPC=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text)
SG=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=$NAME" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo None)
if exists "$SG"; then
  echo "already exists — $SG"
else
  SG=$(aws ec2 create-security-group --group-name "$NAME" --vpc-id "$VPC" \
    --description "FAS API: ssh from one address, http and https from anywhere" \
    --query GroupId --output text)
  # 80 as well as 443: Caddy cannot be issued a certificate without it, and
  # renewal needs it every sixty days thereafter.
  for port in 80 443; do
    aws ec2 authorize-security-group-ingress --group-id "$SG" \
      --ip-permissions "IpProtocol=tcp,FromPort=$port,ToPort=$port,IpRanges=[{CidrIp=0.0.0.0/0}]" >/dev/null
  done
  echo "created — $SG"
fi
"$ROOT/deploy/allow-my-ip.sh"

say "Instance $NAME"
ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=$NAME" "Name=instance-state-name,Values=pending,running,stopped" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text 2>/dev/null || echo None)
if exists "$ID"; then
  echo "already exists — $ID"
else
  # Amazon Linux 2023, x86_64, whatever is current. Asked for by name rather
  # than pinned: a hard-coded AMI id is a machine rebuilt in a year with a
  # year of missing patches.
  AMI=$(aws ssm get-parameters \
    --names /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
    --query 'Parameters[0].Value' --output text)
  # 30 GiB because 8 is the default and Docker build layers do not fit beside
  # a 4 GiB swapfile in it.
  ID=$(aws ec2 run-instances \
    --image-id "$AMI" \
    --instance-type t3.micro \
    --key-name "$NAME" \
    --security-group-ids "$SG" \
    --metadata-options "HttpTokens=required,HttpEndpoint=enabled" \
    --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":30,"VolumeType":"gp3","Encrypted":true,"DeleteOnTermination":true}}]' \
    --user-data "file://$ROOT/deploy/cloud-init.sh" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]" \
    --query 'Instances[0].InstanceId' --output text)
  echo "launched $ID from $AMI"
fi

say "Elastic IP"
# Attached to the instance rather than relying on the public IP it boots with:
# a stopped instance comes back with a different one, and the DNS record would
# then be pointing at whoever got it next.
IP=$(aws ec2 describe-addresses --filters "Name=tag:Name,Values=$NAME" \
  --query 'Addresses[0].PublicIp' --output text 2>/dev/null || echo None)
if ! exists "$IP"; then
  ALLOC=$(aws ec2 allocate-address --domain vpc \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$NAME}]" \
    --query AllocationId --output text)
  IP=$(aws ec2 describe-addresses --allocation-ids "$ALLOC" \
    --query 'Addresses[0].PublicIp' --output text)
else
  ALLOC=$(aws ec2 describe-addresses --filters "Name=tag:Name,Values=$NAME" \
    --query 'Addresses[0].AllocationId' --output text)
fi
aws ec2 wait instance-running --instance-ids "$ID"
aws ec2 associate-address --instance-id "$ID" --allocation-id "$ALLOC" >/dev/null
echo "$IP"

say "Done"
cat <<EOF

  Environment  $FAS_ENV
  Instance     $ID
  Address      $IP
  Bucket       $BUCKET
  API domain   $FAS_API_DOMAIN
  OTA channel  $FAS_OTA_CHANNEL

Add this at BigRock, then wait for it to resolve:

  ${FAS_API_DOMAIN%%.firstleaptechnologies.in}   A   $IP

Then create the API's S3 key and put the four values in
deploy/env/${FAS_ENV}.env:

  aws iam create-access-key --user-name ${NAME}-s3

EOF
