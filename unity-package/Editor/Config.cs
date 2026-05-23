// Trifecta Asset Manager — Editor config
// Fill in the values below. This file is safe to gitignore if you add it to .gitignore.
// Alternatively, keep gist URLs here and gitignore only service-account credentials.

namespace TrifectaStudios.AssetManager
{
    internal static class Config
    {
        // Raw gist URLs — format:
        // https://gist.githubusercontent.com/{user}/{gist_id}/raw/credentials.json
        public const string CredentialsGistUrl = "https://gist.githubusercontent.com/YOUR_USER/YOUR_GIST_ID/raw/credentials.json";
        public const string IndexGistUrl       = "https://gist.githubusercontent.com/YOUR_USER/YOUR_GIST_ID/raw/index.json";

        // Google Drive root folder ID
        public const string DriveRootFolderId = "YOUR_DRIVE_FOLDER_ID";

        // Full service account JSON (paste the entire JSON string here, escaped)
        // OR load from a file path — see note in TrifectaAssetManager.cs
        public const string ServiceAccountJson = @"{
  ""type"": ""service_account"",
  ""project_id"": """",
  ""private_key_id"": """",
  ""private_key"": ""-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"",
  ""client_email"": ""your-sa@your-project.iam.gserviceaccount.com"",
  ""client_id"": """",
  ""auth_uri"": ""https://accounts.google.com/o/oauth2/auth"",
  ""token_uri"": ""https://oauth2.googleapis.com/token""
}";

        // Session TTL in days
        public const int SessionDays = 7;
    }
}
