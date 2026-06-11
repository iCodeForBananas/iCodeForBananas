#!/usr/bin/env bash
# One-time provisioning of a free-tier EC2 instance for the game-server.
#
# Requires: AWS CLI configured (`aws configure`) with an IAM user/role that
# can manage EC2 (AmazonEC2FullAccess is sufficient for this script).
#
# Usage: ./ec2-setup.sh
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
KEY_NAME="game-server-key"
SG_NAME="game-server-sg"
INSTANCE_NAME="game-server"
INSTANCE_TYPE="t3.micro" # free tier eligible in most regions (t2.micro on older accounts)

echo "Region: $REGION"

# ── Key pair ──────────────────────────────────────────────────────────────
if ! aws ec2 describe-key-pairs --key-names "$KEY_NAME" --region "$REGION" >/dev/null 2>&1; then
  echo "Creating key pair $KEY_NAME..."
  aws ec2 create-key-pair --key-name "$KEY_NAME" --region "$REGION" \
    --query "KeyMaterial" --output text > "$KEY_NAME.pem"
  chmod 400 "$KEY_NAME.pem"
  echo "Saved $KEY_NAME.pem (keep this safe, it won't be retrievable again)"
else
  echo "Key pair $KEY_NAME already exists, skipping"
fi

# ── Security group ───────────────────────────────────────────────────────
VPC_ID=$(aws ec2 describe-vpcs --region "$REGION" --filters Name=isDefault,Values=true \
  --query "Vpcs[0].VpcId" --output text)

SG_ID=$(aws ec2 describe-security-groups --region "$REGION" \
  --filters Name=group-name,Values="$SG_NAME" Name=vpc-id,Values="$VPC_ID" \
  --query "SecurityGroups[0].GroupId" --output text 2>/dev/null || echo "None")

if [ "$SG_ID" = "None" ] || [ -z "$SG_ID" ]; then
  echo "Creating security group $SG_NAME..."
  SG_ID=$(aws ec2 create-security-group --region "$REGION" \
    --group-name "$SG_NAME" --description "Game server" --vpc-id "$VPC_ID" \
    --query "GroupId" --output text)

  MY_IP=$(curl -s https://checkip.amazonaws.com)
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" \
    --protocol tcp --port 22 --cidr "${MY_IP}/32"
  # WebSocket port — open to the world so the deployed site can reach it.
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" \
    --protocol tcp --port 8080 --cidr 0.0.0.0/0
  # HTTPS — for a TLS reverse proxy (wss://) in front of the game server.
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" \
    --protocol tcp --port 443 --cidr 0.0.0.0/0
  echo "Created security group $SG_ID (SSH locked to $MY_IP)"
else
  echo "Security group $SG_ID already exists, skipping"
fi

# ── AMI (Amazon Linux 2023, x86_64) ──────────────────────────────────────
AMI_ID=$(aws ec2 describe-images --region "$REGION" \
  --owners amazon \
  --filters "Name=name,Values=al2023-ami-*-x86_64" "Name=state,Values=available" \
  --query "sort_by(Images, &CreationDate)[-1].ImageId" --output text)

# ── Launch instance ───────────────────────────────────────────────────────
EXISTING=$(aws ec2 describe-instances --region "$REGION" \
  --filters Name=tag:Name,Values="$INSTANCE_NAME" Name=instance-state-name,Values=pending,running,stopped \
  --query "Reservations[0].Instances[0].InstanceId" --output text 2>/dev/null || echo "None")

if [ "$EXISTING" != "None" ] && [ -n "$EXISTING" ]; then
  echo "Instance $EXISTING already exists, skipping launch"
  INSTANCE_ID="$EXISTING"
else
  USER_DATA=$(cat <<'EOF'
#!/bin/bash
dnf install -y docker git
systemctl enable --now docker
usermod -aG docker ec2-user
EOF
)
  INSTANCE_ID=$(aws ec2 run-instances --region "$REGION" \
    --image-id "$AMI_ID" \
    --instance-type "$INSTANCE_TYPE" \
    --key-name "$KEY_NAME" \
    --security-group-ids "$SG_ID" \
    --user-data "$USER_DATA" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$INSTANCE_NAME}]" \
    --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=20,VolumeType=gp3}' \
    --query "Instances[0].InstanceId" --output text)
  echo "Launched instance $INSTANCE_ID"
fi

aws ec2 wait instance-running --region "$REGION" --instance-ids "$INSTANCE_ID"
PUBLIC_IP=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --query "Reservations[0].Instances[0].PublicIpAddress" --output text)

echo ""
echo "Instance ID: $INSTANCE_ID"
echo "Public IP:   $PUBLIC_IP"
echo ""
echo "SSH in with:  ssh -i $KEY_NAME.pem ec2-user@$PUBLIC_IP"
echo "(give cloud-init ~1-2 minutes to finish installing Docker before connecting)"
