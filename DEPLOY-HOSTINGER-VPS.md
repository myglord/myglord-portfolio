# Deploying to a Hostinger VPS

This app is a Node.js server (site + admin dashboard + contact/subscribe/broadcast email + CMS).
It needs a **Hostinger VPS** (KVM plan) — shared/Premium/Business web hosting is PHP-only and cannot run it.

Everything below is copy-paste. Replace `YOUR_DOMAIN.com` and paths where noted.

---

## 0. Get the VPS

1. In hPanel → **VPS** → buy/open a **KVM VPS**.
2. When it asks for an OS/template, choose **Ubuntu 22.04** (plain) — or the **Node.js** template if offered.
3. Note the VPS **IP address** and the **root password** (hPanel → VPS → Overview / SSH access).

---

## 1. Connect over SSH

From your Mac's Terminal:

```bash
ssh root@YOUR_VPS_IP
```

Enter the root password when prompted.

---

## 2. Install Node.js, git and PM2 (one time)

```bash
apt update && apt install -y git nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2
```

Check: `node -v` should print v20.x.

---

## 3. Get the code

```bash
cd /var/www
git clone https://github.com/myglord/myglord-portfolio.git
cd myglord-portfolio
npm install --omit=dev
```

---

## 4. Create the .env (secrets — never in git)

```bash
nano .env
```

Paste this, then edit the values:

```
ADMIN_USER=mussgraph@gmail.com
ADMIN_PASSWORD=0993382575My@
CONTACT_TO=mussgraph@gmail.com
GMAIL_USER=mussgraph@gmail.com
GMAIL_APP_PASSWORD=lrgszffcrxebflam
PORT=3000
```

Save in nano: `Ctrl+O`, `Enter`, then `Ctrl+X`.

---

## 5. Start the app with PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup    # run the command it prints, so the app survives reboots
```

Check it's alive: `curl http://localhost:3000` should return HTML.

---

## 6. Put nginx in front (domain + port 80)

```bash
nano /etc/nginx/sites-available/portfolio
```

Paste (change `YOUR_DOMAIN.com`):

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN.com www.YOUR_DOMAIN.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    client_max_body_size 5m;
}
```

Enable it:

```bash
ln -s /etc/nginx/sites-available/portfolio /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

---

## 7. Point the domain

In hPanel → **Domains** → DNS/Nameservers for your domain, set an **A record**:

```
Type: A     Name: @     Value: YOUR_VPS_IP
Type: A     Name: www   Value: YOUR_VPS_IP
```

Wait for DNS to propagate (minutes to a couple hours). Then `http://YOUR_DOMAIN.com` shows the site.

---

## 8. Free HTTPS (SSL)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d YOUR_DOMAIN.com -d www.YOUR_DOMAIN.com
```

Follow the prompts (enter an email, agree). It auto-configures HTTPS and renewal.

Done — `https://YOUR_DOMAIN.com` is live, admin at `https://YOUR_DOMAIN.com/admin`.

---

## Updating later (after you push new code to GitHub)

```bash
cd /var/www/myglord-portfolio
git pull
npm install --omit=dev
pm2 restart myglord-portfolio
```

## Handy PM2 commands

```bash
pm2 status              # is it running?
pm2 logs                # live logs
pm2 restart myglord-portfolio
```

## Notes
- Visitor data (subscribers, messages, activity, CMS content) lives in `data/` on the VPS. It is **not** in git. Back it up if you rebuild the server: `data/*.json`.
- To change the admin password or email later, edit `.env` and `pm2 restart myglord-portfolio`.
