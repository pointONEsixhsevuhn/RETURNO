# Deploy RETURNO on one persistent Node host

This deployment keeps RETURNO's current Node.js API, SQLite database, login, and authorization behavior. Docker Compose runs the app and Caddy on one Linux VM. SQLite and Caddy's HTTPS certificates use persistent Docker volumes. The app container is not directly exposed to the internet; Caddy accepts HTTPS traffic and proxies it to the app.

## Hosting requirements

- A Linux VM with a stable public IP, Node-compatible ARM64 or x64 CPU, and a persistent disk. Oracle Cloud's [Always Free VM](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) is one possible no-cost host, subject to account approval and capacity. Signup may require card verification. Its Always Free resources can continue after the trial, but Oracle may reclaim compute instances it considers idle. This is a persistent link while the host, DNS name, account, and service remain active, not a lifetime uptime guarantee.
- A public DNS name whose A record points to that public IP. A domain you own works; a free DNS subdomain such as [DuckDNS](https://www.duckdns.org/) may also work. Caddy needs the DNS record to resolve publicly and inbound TCP ports 80 and 443 to reach the VM to issue and renew HTTPS certificates.
- Docker Engine with the Docker Compose plugin, Git, and a working outbound connection to the configured SMTP service.
- A configured SMTP sender. Keep the sender password private and use a dedicated mail account/app password.

The app requires HTTPS in production because session cookies are marked `Secure`. Do not publish port 3000 directly or set `COOKIE_SECURE=false` to work around a proxy or certificate problem.

## First deployment

1. Create a VM using an Always Free-eligible Linux image if using Oracle, and assign a stable/reserved public IP if available. In the cloud firewall/security list and the VM firewall, allow inbound TCP 80 and 443. Restrict SSH to your own IP instead of opening it to everyone.
2. Point the DNS A record for the hostname you chose to the VM's stable public IP. Wait until the hostname resolves before starting Caddy.
3. Install Docker Engine and its Compose plugin using the instructions for your Linux distribution in the [official Docker installation guide](https://docs.docker.com/engine/install/). Install Git as well.
4. Clone the repository on the VM and enter the project directory:

   ```sh
   git clone https://github.com/pointONEsixhsevuhn/RETURNO.git
   cd RETURNO
   ```

5. Create the server-only environment file and protect it:

   ```sh
   cp .env.example .env
   chmod 600 .env
   nano .env
   ```

   Set `RETURNO_HOSTNAME` to the DNS name from step 2. Set `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM` to the dedicated sender account. Set `RETURNO_CODE_PEPPER` to a securely generated 64-character hexadecimal secret (for example, generate one with `openssl rand -hex 32`). Keep that value stable across restarts and keep it separately from database backups. Never put `.env` in Git, a browser, or a message.

6. Create a private backup directory writable by the container's non-root user, then build and start RETURNO:

   ```sh
   sudo mkdir -p backups
   sudo chown 1000:1000 backups
   sudo chmod 700 backups
   docker compose config --quiet
   docker compose up -d --build
   docker compose ps
   ```

   Wait for both services to become healthy/running. Caddy obtains and renews HTTPS certificates automatically after the DNS record and firewall are correct. Open `https://<your-hostname>` and check `https://<your-hostname>/api/health` returns a healthy response.

7. Create the first administrator in the persistent database:

   ```sh
   docker compose run --rm retorno npm run admin
   ```

   Enter the administrator email, registered name, and a strong unique password when prompted. Do not set `ADMIN_PASSWORD` in `.env`.

## Update and recovery

To deploy a later GitHub version, run these commands from the repository directory on the VM:

```sh
git pull --ff-only
docker compose up -d --build --pull always
docker compose ps
```

The named `retorno_data` volume holds the SQLite database and generated verification key. `caddy_data` holds TLS certificates. Normal container rebuilds and `docker compose down` preserve these volumes. **Do not run `docker compose down --volumes`** unless you intend to erase the database and certificates.

Create a verified SQLite backup on the mounted, private `backups` directory:

```sh
docker compose run --rm retorno npm run db:backup -- /app/backups/retorno-YYYY-MM-DD.sqlite
```

Replace the date with the current date, then copy the backup to separate private storage. The backup contains student account and report information. Keep the pepper in a separate secret store; a database backup without the matching pepper cannot validate outstanding email codes. Follow [database recovery guidance](DATABASE-MIGRATIONS.md) and rehearse recovery before relying on production data.

## What remains an operator responsibility

This repository now includes a reusable container and HTTPS proxy configuration, but it does not create a cloud account, VM, DNS record, SMTP account, or permanent public URL by itself. You must provision and maintain the host, verify the cloud's free-tier terms and resource eligibility, configure secrets, monitor the service, and keep private backups. Before inviting real users, complete the privacy/legal review and the production security work listed in [the project roadmap](PROJECT-ROADMAP.md).
