# Deploying the game server to EC2 (free tier)

## 1. One-time AWS setup

1. Install the AWS CLI: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
2. Create an IAM user (or role) with `AmazonEC2FullAccess`, generate an
   access key, then run:
   ```
   aws configure
   ```
3. Provision the instance:
   ```
   cd deploy
   ./ec2-setup.sh
   ```
   This creates a key pair (`game-server-key.pem`), a security group
   (SSH from your IP, ports 8080 and 443 open), and launches a `t3.micro`
   instance with Docker pre-installed via cloud-init. It prints the
   instance's public IP when done.

   Free tier covers 750 hrs/month of `t2.micro`/`t3.micro` (depending on
   account age/region) plus 30 GB of EBS — this setup uses one instance and
   20 GB, so it fits comfortably.

## 2. First deploy

SSH in (wait ~1-2 min after launch for cloud-init to finish):
```
ssh -i deploy/game-server-key.pem ec2-user@<PUBLIC_IP>
git clone https://github.com/iCodeForBananas/iCodeForBananas.git app
cd app
```

Create `deploy/.env` (not committed) with the Supabase credentials the
server uses to persist game state:
```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

Then run:
```
bash deploy/redeploy.sh
```

## 3. Point the site at the server

Set `NEXT_PUBLIC_GAME_WS_URL` (in Vercel project env vars) to your server's
address and redeploy the Next.js app.

**Note on `wss://`**: the Next.js site is served over HTTPS, so browsers
will block a plain `ws://<ip>:8080` connection (mixed content). Either:
- Put a TLS reverse proxy (e.g. Caddy) in front of the game server on
  port 443 using a free `<ip>.nip.io` hostname (Caddy can get a Let's
  Encrypt cert for it automatically), and set
  `NEXT_PUBLIC_GAME_WS_URL=wss://<ip-with-dashes>.nip.io`, or
- Use a real domain/subdomain pointed at the instance.

## 4. Redeploying after code changes

Game state (player position, money, items, zombie/gate state) is saved to
the `game_state` table in Supabase whenever the container is stopped, and
reloaded on the next start — players reconnect with their persistent
client-side id and resume where they left off.

```
ssh -i deploy/game-server-key.pem ec2-user@<PUBLIC_IP>
cd app
bash deploy/redeploy.sh
```
