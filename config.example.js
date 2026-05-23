const CONFIG = {
  // Single password for dashboard access
  ADMIN_PASSWORD: "your-admin-password-here",

  // GitHub Personal Access Token (needs gist read/write scope)
  GITHUB_PAT: "ghp_xxxxxxxxxxxxxxxxxxxx",

  // Gist IDs (create secret gists manually, paste IDs here)
  GIST_CREDENTIALS_ID: "gist-id-for-credentials-json",
  GIST_INDEX_ID:       "gist-id-for-index-json",
  GIST_LEAVE_ID:       "gist-id-for-leave-json",

  // Google Drive root folder ID (share this folder with the service account email)
  DRIVE_ROOT_FOLDER_ID: "google-drive-root-folder-id",

  // Full service account JSON from Google Cloud Console
  SERVICE_ACCOUNT: {
    type: "service_account",
    project_id: "",
    private_key_id: "",
    private_key: "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
    client_email: "your-sa@your-project.iam.gserviceaccount.com",
    client_id: "",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token"
  },

  // GameAnalytics game credentials
  GAMES: [
    { name: "Mars Dozer",  ga_game_key: "", ga_secret_key: "" },
    { name: "DesertFury",  ga_game_key: "", ga_secret_key: "" }
  ]
};
