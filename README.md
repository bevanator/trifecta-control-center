# Trifecta Control Center

Internal studio dashboard for Trifecta Studios. Hosted on GitHub Pages.

## Setup

### 1. Config file

Copy `config.example.js` to `config.js` and fill in every field. `config.js` is gitignored and never committed.

```bash
cp config.example.js config.js
```

### 2. GitHub Gists

Create three **secret** gists at https://gist.github.com, each with a single JSON file:

**credentials.json** (paste ID into `GIST_CREDENTIALS_ID`):
```json
{ "users": [] }
```

**index.json** (paste ID into `GIST_INDEX_ID`):
```json
{ "assets": [] }
```

**leave.json** (paste ID into `GIST_LEAVE_ID`):
```json
{ "balances": [], "requests": [] }
```

### 3. GitHub PAT

Create a Personal Access Token at https://github.com/settings/tokens with the **`gist`** scope. Paste into `GITHUB_PAT`.

### 4. Google Drive + Service Account

1. Create a project in Google Cloud Console.
2. Enable the **Google Drive API**.
3. Create a **Service Account** under IAM & Admin → Service Accounts.
4. Generate a JSON key. Copy the entire JSON object into `SERVICE_ACCOUNT` in `config.js`.
5. Create a Google Drive folder for asset storage.
6. Share that folder with the service account `client_email` (Editor access).
7. Paste the folder ID into `DRIVE_ROOT_FOLDER_ID`.

### 5. GameAnalytics

For each game, get the Game Key and Secret Key from GameAnalytics → Game Settings → Platforms. Add to the `GAMES` array in `config.js`.

### 6. GitHub Pages

Enable GitHub Pages in repo settings from the `main` branch root.
Live at: `https://bevanator.github.io/trifecta-control-center/`

---

## Unity Package

The `unity-package/` folder contains an Editor-only tool for browsing and downloading assets.

### Unity setup

1. Add **BCrypt.Net-Next** via Package Manager → Add package from git URL:
   ```
   https://github.com/BcryptNet/bcrypt.net.git#4.0.3
   ```
2. Copy `unity-package/Editor/` into `Assets/Editor/TrifectaAssetManager/`.
3. Edit `Config.cs` — set the gist raw URLs and paste the service account JSON.
4. Open via **Window → Trifecta → Asset Manager**.

---

## File structure

```
/
├── index.html              ← redirects to /dashboard
├── config.js               ← GITIGNORED — never commit
├── config.example.js       ← safe template
├── dashboard/
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── app.js
│       ├── auth.js
│       ├── github.js
│       ├── drive.js
│       ├── analytics-api.js
│       └── pages/
│           ├── assets.js
│           ├── credentials.js
│           ├── leave.js
│           └── analytics.js
└── unity-package/
    └── Editor/
        ├── Config.cs
        └── TrifectaAssetManager.cs
```
