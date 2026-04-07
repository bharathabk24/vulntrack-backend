# VulnTrack by CIEL HR — Backend Edition

A shared vulnerability dashboard with a Node.js backend, hosted on Render.com.
Admin uploads data once — everyone with the link sees it live.

---

## Deployment Steps (Render.com)

### Step 1 — Push to GitHub

1. Go to github.com → Create a new repository (e.g. `vulntrack-backend`)
2. Upload ALL files from this folder:
   - `server.js`
   - `package.json`
   - `public/index.html`
   - `public/app.js`
   - `public/style.css`
3. Commit changes

### Step 2 — Deploy on Render

1. Go to [render.com](https://render.com) and sign up (free)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub account → Select the `vulntrack-backend` repository
4. Fill in settings:
   - **Name:** vulntrack (or anything you like)
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
5. Click **"Create Web Service"**

### Step 3 — Set Admin Password

1. In Render dashboard → your service → **"Environment"** tab
2. Click **"Add Environment Variable"**
   - Key: `ADMIN_PASSWORD`
   - Value: (choose a strong password)
3. Click **Save** — the service will redeploy automatically

### Step 4 — Share the link

Your dashboard will be live at:
```
https://your-service-name.onrender.com
```

Share this link with your entities. They just open it and see the data.

---

## How to Upload Data (Admin)

1. Open the dashboard link
2. Click **"Admin — Upload Data"** in the sidebar
3. Enter your admin password
4. Upload vulnerability file(s) and/or resolution file(s)
5. Data is instantly visible to all viewers

---

## Important Notes

- **Free Render tier:** The server sleeps after 15 minutes of inactivity.
  First load after sleep takes ~30 seconds to wake up. This is normal.
- **Data storage:** Data is stored on the server filesystem.
  It persists between sessions but resets if you redeploy.
  For permanent storage, consider adding a database (MongoDB Atlas free tier).
- **Admin password:** Change it via Render Environment Variables — never hardcode it.

---

## File Structure

```
vulntrack-backend/
├── server.js          ← Node.js backend (Express)
├── package.json       ← Dependencies
├── data/              ← Auto-created: stores vuln.json, resolution.json
└── public/
    ├── index.html     ← Dashboard UI
    ├── app.js         ← Dashboard logic
    └── style.css      ← Dark theme styles
```
