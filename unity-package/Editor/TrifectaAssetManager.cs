// Trifecta Asset Manager — Unity 6 Editor Window
//
// Open via Window → Trifecta → Asset Manager

using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using UnityEditor;
using UnityEngine;
using Newtonsoft.Json;       // built into Unity 6 via com.unity.nuget.newtonsoft-json
using BCrypt.Net;            // BCrypt.Net-Next

namespace TrifectaStudios.AssetManager
{
    public class TrifectaAssetManager : EditorWindow
    {
        // ── State ──────────────────────────────────────────
        enum ViewState { Login, Loading, Browser }

        ViewState _state = ViewState.Login;
        string _statusMsg = "";

        // Login
        string _username = "";
        string _password = "";
        string _loginError = "";
        bool _showPass = false;

        // Session
        const string PREF_USER    = "TCC_User";
        const string PREF_EXPIRY  = "TCC_Expiry";

        // Assets
        List<AssetEntry> _assets = new();
        Vector2 _scroll;
        string _search = "";
        string _tagFilter = "";
        List<string> _allTags = new();

        // Selected asset detail
        AssetInfo _selectedAsset;
        Texture2D _coverTexture;
        List<Texture2D> _screenshots = new();
        int _selectedPkg = 0;
        bool _downloading;

        // Drive token cache
        string _driveToken;
        long _driveTokenExpiry;

        static readonly HttpClient Http = new();

        // ── Menu item ─────────────────────────────────────
        [MenuItem("Window/Trifecta/Asset Manager")]
        public static void Open()
        {
            var win = GetWindow<TrifectaAssetManager>("Asset Manager");
            win.minSize = new Vector2(700, 500);
        }

        // ── Lifecycle ─────────────────────────────────────
        void OnEnable()
        {
            if (HasValidSession())
            {
                _state = ViewState.Loading;
                _ = LoadAssets();
            }
        }

        // ── Session ───────────────────────────────────────
        bool HasValidSession()
        {
            if (!EditorPrefs.HasKey(PREF_EXPIRY)) return false;
            var expiry = long.Parse(EditorPrefs.GetString(PREF_EXPIRY, "0"));
            return DateTimeOffset.UtcNow.ToUnixTimeSeconds() < expiry;
        }

        void SaveSession(string username)
        {
            EditorPrefs.SetString(PREF_USER, username);
            EditorPrefs.SetString(PREF_EXPIRY,
                (DateTimeOffset.UtcNow.ToUnixTimeSeconds() + Config.SessionDays * 86400).ToString());
        }

        void ClearSession()
        {
            EditorPrefs.DeleteKey(PREF_USER);
            EditorPrefs.DeleteKey(PREF_EXPIRY);
        }

        string LoggedInUser => EditorPrefs.GetString(PREF_USER, "");

        // ── GUI ───────────────────────────────────────────
        void OnGUI()
        {
            switch (_state)
            {
                case ViewState.Login:   DrawLogin();   break;
                case ViewState.Loading: DrawLoading(); break;
                case ViewState.Browser: DrawBrowser(); break;
            }
        }

        void DrawLogin()
        {
            GUILayout.Space(40);
            GUILayout.BeginVertical(GUILayout.Width(320));
            GUILayout.FlexibleSpace();

            var centeredStyle = new GUIStyle(EditorStyles.label) { alignment = TextAnchor.MiddleCenter, fontSize = 18, fontStyle = FontStyle.Bold };
            GUILayout.BeginHorizontal();
            GUILayout.FlexibleSpace();
            GUILayout.BeginVertical(GUILayout.Width(320));

            GUILayout.Label("Trifecta Asset Manager", centeredStyle, GUILayout.ExpandWidth(true));
            GUILayout.Space(24);

            GUILayout.Label("Username", EditorStyles.boldLabel);
            _username = EditorGUILayout.TextField(_username);
            GUILayout.Space(8);

            GUILayout.Label("Password", EditorStyles.boldLabel);
            _password = _showPass
                ? EditorGUILayout.TextField(_password)
                : EditorGUILayout.PasswordField(_password);
            _showPass = GUILayout.Toggle(_showPass, "Show password");

            GUILayout.Space(16);
            if (GUILayout.Button("Sign In", GUILayout.Height(36)))
                _ = DoLogin();

            if (!string.IsNullOrEmpty(_loginError))
            {
                var errStyle = new GUIStyle(EditorStyles.helpBox) { normal = { textColor = Color.red } };
                GUILayout.Label(_loginError, errStyle);
            }

            GUILayout.EndVertical();
            GUILayout.FlexibleSpace();
            GUILayout.EndHorizontal();
            GUILayout.FlexibleSpace();
            GUILayout.EndVertical();
        }

        void DrawLoading()
        {
            GUILayout.FlexibleSpace();
            GUILayout.BeginHorizontal();
            GUILayout.FlexibleSpace();
            GUILayout.Label(string.IsNullOrEmpty(_statusMsg) ? "Loading…" : _statusMsg, EditorStyles.centeredGreyMiniLabel);
            GUILayout.FlexibleSpace();
            GUILayout.EndHorizontal();
            GUILayout.FlexibleSpace();
        }

        void DrawBrowser()
        {
            // ── Top bar ──────────────────────────────────
            GUILayout.BeginHorizontal(EditorStyles.toolbar);
            GUILayout.Label("Trifecta Asset Manager", EditorStyles.boldLabel, GUILayout.Width(200));
            GUILayout.FlexibleSpace();
            GUILayout.Label("Search:", GUILayout.Width(50));
            var newSearch = GUILayout.TextField(_search, EditorStyles.toolbarSearchField, GUILayout.Width(180));
            if (newSearch != _search) { _search = newSearch; }
            GUILayout.Space(8);
            if (GUILayout.Button("↻ Refresh", EditorStyles.toolbarButton, GUILayout.Width(70)))
                _ = LoadAssets();
            if (GUILayout.Button($"Logout ({LoggedInUser})", EditorStyles.toolbarButton))
            { ClearSession(); _state = ViewState.Login; _selectedAsset = null; }
            GUILayout.EndHorizontal();

            // ── Tag filter bar ────────────────────────────
            if (_allTags.Count > 0)
            {
                GUILayout.BeginHorizontal(EditorStyles.toolbar);
                GUILayout.Label("Filter:", GUILayout.Width(46));
                if (GUILayout.Toggle(_tagFilter == "", "All", EditorStyles.toolbarButton, GUILayout.Width(40)))
                    _tagFilter = "";
                foreach (var tag in _allTags)
                {
                    if (GUILayout.Toggle(_tagFilter == tag, tag, EditorStyles.toolbarButton))
                        _tagFilter = tag;
                }
                GUILayout.FlexibleSpace();
                GUILayout.EndHorizontal();
            }

            if (_selectedAsset != null)
                DrawDetailPane();
            else
                DrawGrid();
        }

        void DrawGrid()
        {
            _scroll = GUILayout.BeginScrollView(_scroll);
            GUILayout.BeginHorizontal();
            int col = 0;
            const int COLS = 3;
            const float CARD_W = 220f;

            foreach (var entry in _assets)
            {
                var info = entry.Info;
                if (info == null) continue;
                if (!string.IsNullOrEmpty(_search) &&
                    !info.name.ToLower().Contains(_search.ToLower()) &&
                    !string.Join(" ", info.tags ?? Array.Empty<string>()).ToLower().Contains(_search.ToLower()))
                    continue;
                if (!string.IsNullOrEmpty(_tagFilter) &&
                    Array.IndexOf(info.tags ?? Array.Empty<string>(), _tagFilter) < 0)
                    continue;

                var cardStyle = new GUIStyle(GUI.skin.box);
                GUILayout.BeginVertical(cardStyle, GUILayout.Width(CARD_W));

                // Cover
                var tex = entry.Cover;
                if (tex != null)
                    GUILayout.Label(tex, GUILayout.Width(CARD_W - 8), GUILayout.Height(124));
                else
                    GUILayout.Box("No image", GUILayout.Width(CARD_W - 8), GUILayout.Height(124));

                GUILayout.Label(info.name, EditorStyles.boldLabel);
                GUILayout.Label(info.publisher ?? "", EditorStyles.miniLabel);

                if (info.tags?.Length > 0)
                    GUILayout.Label(string.Join(", ", info.tags), EditorStyles.centeredGreyMiniLabel);

                var priceLabel = info.price_usd == 0 ? "Free" : info.price_usd != null ? $"${info.price_usd}" : "";
                if (!string.IsNullOrEmpty(priceLabel))
                    GUILayout.Label(priceLabel, EditorStyles.centeredGreyMiniLabel);

                if (GUILayout.Button("View", GUILayout.Height(28)))
                    SelectAsset(entry);

                GUILayout.EndVertical();
                col++;

                if (col >= COLS)
                {
                    col = 0;
                    GUILayout.EndHorizontal();
                    GUILayout.BeginHorizontal();
                }
            }

            while (col < COLS && col > 0) { GUILayout.FlexibleSpace(); col++; }
            GUILayout.EndHorizontal();
            GUILayout.EndScrollView();
        }

        void DrawDetailPane()
        {
            GUILayout.BeginHorizontal();

            // ── Back / header ──────────────────────────────
            GUILayout.BeginVertical();
            if (GUILayout.Button("← Back", GUILayout.Width(80)))
            { _selectedAsset = null; _coverTexture = null; _screenshots.Clear(); return; }

            _scroll = GUILayout.BeginScrollView(_scroll);

            var info = _selectedAsset;

            // Cover
            if (_coverTexture != null)
                GUILayout.Box(_coverTexture, GUILayout.Width(400), GUILayout.Height(225));

            GUILayout.Space(8);
            GUILayout.Label(info.name ?? "", new GUIStyle(EditorStyles.boldLabel) { fontSize = 16 });
            GUILayout.Label($"by {info.publisher}", EditorStyles.miniLabel);
            GUILayout.Space(4);

            if (!string.IsNullOrEmpty(info.description))
            {
                var wrap = new GUIStyle(EditorStyles.wordWrappedLabel) { wordWrap = true };
                GUILayout.Label(info.description, wrap, GUILayout.Width(400));
                GUILayout.Space(8);
            }

            if (info.tags?.Length > 0)
                GUILayout.Label("Tags: " + string.Join(", ", info.tags), EditorStyles.miniLabel);

            if (!string.IsNullOrEmpty(info.asset_store_url))
                if (GUILayout.Button("View on Asset Store ↗", GUILayout.Width(180)))
                    Application.OpenURL(info.asset_store_url);

            // Screenshots
            if (_screenshots.Count > 0)
            {
                GUILayout.Space(8);
                GUILayout.Label("Screenshots", EditorStyles.boldLabel);
                GUILayout.BeginHorizontal();
                foreach (var ss in _screenshots)
                    if (ss != null) GUILayout.Box(ss, GUILayout.Width(140), GUILayout.Height(80));
                GUILayout.EndHorizontal();
            }

            // Packages
            GUILayout.Space(12);
            GUILayout.Label("Packages", EditorStyles.boldLabel);

            if (info.packages == null || info.packages.Length == 0)
            {
                GUILayout.Label("No packages available.", EditorStyles.centeredGreyMiniLabel);
            }
            else
            {
                var versionLabels = new string[info.packages.Length];
                for (int i = 0; i < info.packages.Length; i++)
                    versionLabels[i] = $"v{info.packages[i].version}";

                _selectedPkg = EditorGUILayout.Popup("Version", _selectedPkg, versionLabels);

                var pkg = info.packages[_selectedPkg];
                if (!string.IsNullOrEmpty(pkg.notes))
                    GUILayout.Label("Notes: " + pkg.notes, EditorStyles.wordWrappedMiniLabel);

                GUI.enabled = !_downloading;
                if (GUILayout.Button(_downloading ? "Downloading…" : "Download & Import", GUILayout.Height(36), GUILayout.Width(200)))
                    _ = DownloadAndImport(pkg);
                GUI.enabled = true;
            }

            GUILayout.EndScrollView();
            GUILayout.EndVertical();
            GUILayout.EndHorizontal();
        }

        // ── Auth ──────────────────────────────────────────
        async Task DoLogin()
        {
            _loginError = "";
            if (string.IsNullOrEmpty(_username) || string.IsNullOrEmpty(_password))
            { _loginError = "Username and password required."; Repaint(); return; }

            _state = ViewState.Loading; _statusMsg = "Verifying credentials…"; Repaint();

            try
            {
                var json = await Http.GetStringAsync(Config.CredentialsGistUrl);
                var creds = JsonConvert.DeserializeObject<CredentialsFile>(json);
                var user = creds?.users?.Find(u => u.username == _username);

                if (user == null || !VerifyPassword(_password, user.hash))
                {
                    _loginError = "Invalid username or password.";
                    _state = ViewState.Login; Repaint(); return;
                }

                SaveSession(_username);
                await LoadAssets();
            }
            catch (Exception ex)
            {
                _loginError = $"Login failed: {ex.Message}";
                _state = ViewState.Login; Repaint();
            }
        }

        // ── Asset loading ─────────────────────────────────
        async Task LoadAssets()
        {
            _state = ViewState.Loading; _statusMsg = "Loading asset index…"; Repaint();
            _assets.Clear(); _allTags.Clear();

            try
            {
                var indexJson = await Http.GetStringAsync(Config.IndexGistUrl);
                var index = JsonConvert.DeserializeObject<AssetIndex>(indexJson);
                if (index?.assets == null) { _state = ViewState.Browser; Repaint(); return; }

                var tagSet = new HashSet<string>();
                var token = await GetDriveToken();

                foreach (var a in index.assets)
                {
                    _statusMsg = $"Loading {a.name}…"; Repaint();
                    try
                    {
                        var infoJson = await DriveGetFile(a.info_file_id, token);
                        var info = JsonConvert.DeserializeObject<AssetInfo>(infoJson);
                        var entry = new AssetEntry { Name = a.name, InfoFileId = a.info_file_id, Info = info };

                        if (info?.tags != null)
                            foreach (var t in info.tags) tagSet.Add(t);

                        if (!string.IsNullOrEmpty(info?.cover))
                        {
                            var bytes = await DriveGetBytes(info.cover, token);
                            if (bytes != null) { entry.Cover = BytesToTexture(bytes); }
                        }

                        _assets.Add(entry);
                    }
                    catch { _assets.Add(new AssetEntry { Name = a.name, InfoFileId = a.info_file_id }); }

                    Repaint();
                }

                _allTags.AddRange(tagSet);
                _state = ViewState.Browser; _statusMsg = "";
            }
            catch (Exception ex)
            {
                _statusMsg = $"Failed to load: {ex.Message}";
                Debug.LogError($"[TrifectaAssetManager] {ex}");
            }
            Repaint();
        }

        void SelectAsset(AssetEntry entry)
        {
            _selectedAsset = entry.Info;
            _coverTexture = entry.Cover;
            _selectedPkg = 0;
            _screenshots.Clear();
            Repaint();
            _ = LoadScreenshots(entry.Info?.screenshots, _selectedAsset);
        }

        async Task LoadScreenshots(string[] ids, AssetInfo forAsset)
        {
            if (ids == null) return;
            var token = await GetDriveToken();
            var list = new List<Texture2D>();
            foreach (var id in ids)
            {
                var bytes = await DriveGetBytes(id, token);
                list.Add(bytes != null ? BytesToTexture(bytes) : null);
            }
            if (_selectedAsset == forAsset) { _screenshots = list; Repaint(); }
        }

        // ── Download & import ─────────────────────────────
        async Task DownloadAndImport(PackageVersion pkg)
        {
            _downloading = true; Repaint();
            try
            {
                var token = await GetDriveToken();
                var bytes = await DriveGetBytes(pkg.file_id, token);
                if (bytes == null) { Debug.LogError("[TrifectaAssetManager] Download returned null."); return; }

                var fileName = $"TCC_{pkg.file_id}.unitypackage";
                var path = Path.Combine(Application.temporaryCachePath, fileName);
                await File.WriteAllBytesAsync(path, bytes);
                AssetDatabase.ImportPackage(path, true);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[TrifectaAssetManager] Download failed: {ex.Message}");
                EditorUtility.DisplayDialog("Download Failed", ex.Message, "OK");
            }
            _downloading = false; Repaint();
        }

        // ── Google Drive helpers ──────────────────────────
        async Task<string> GetDriveToken()
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            if (!string.IsNullOrEmpty(_driveToken) && now < _driveTokenExpiry - 60)
                return _driveToken;

            var sa = JsonConvert.DeserializeObject<ServiceAccount>(Config.ServiceAccountJson);

            var nowSec = now;
            var header  = B64Url(Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(new { alg = "RS256", typ = "JWT" })));
            var payload = B64Url(Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(new
            {
                iss   = sa.client_email,
                scope = "https://www.googleapis.com/auth/drive",
                aud   = "https://oauth2.googleapis.com/token",
                exp   = nowSec + 3600,
                iat   = nowSec
            })));

            var signingInput = $"{header}.{payload}";
            var sig = SignRS256(signingInput, sa.private_key);
            var jwt = $"{signingInput}.{sig}";

            var body = new StringContent(
                $"grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion={Uri.EscapeDataString(jwt)}",
                Encoding.UTF8, "application/x-www-form-urlencoded");

            var res = await Http.PostAsync("https://oauth2.googleapis.com/token", body);
            var resJson = await res.Content.ReadAsStringAsync();
            if (!res.IsSuccessStatusCode) throw new Exception($"Drive auth failed: {resJson}");

            var td = JsonConvert.DeserializeObject<TokenResponse>(resJson);
            _driveToken = td.access_token;
            _driveTokenExpiry = now + td.expires_in;
            return _driveToken;
        }

        async Task<string> DriveGetFile(string fileId, string token)
        {
            using var req = new HttpRequestMessage(HttpMethod.Get,
                $"https://www.googleapis.com/drive/v3/files/{fileId}?alt=media");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var res = await Http.SendAsync(req);
            res.EnsureSuccessStatusCode();
            return await res.Content.ReadAsStringAsync();
        }

        async Task<byte[]> DriveGetBytes(string fileId, string token)
        {
            using var req = new HttpRequestMessage(HttpMethod.Get,
                $"https://www.googleapis.com/drive/v3/files/{fileId}?alt=media");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var res = await Http.SendAsync(req);
            if (!res.IsSuccessStatusCode) return null;
            return await res.Content.ReadAsByteArrayAsync();
        }

        // ── Crypto helpers ────────────────────────────────
        static string B64Url(byte[] data)
        {
            return Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        }

        static string SignRS256(string input, string privateKeyPem)
        {
            using var rsa = RSA.Create();
            rsa.ImportFromPem(privateKeyPem.AsSpan());
            var sig = rsa.SignData(Encoding.UTF8.GetBytes(input), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            return B64Url(sig);
        }

        static string HashPassword(string password)
        {
            var salt = Encoding.UTF8.GetBytes("trifecta-static-salt");
            using var pbkdf2 = new Rfc2898DeriveBytes(password, salt, 100000, HashAlgorithmName.SHA256);
            return Convert.ToBase64String(pbkdf2.GetBytes(32));
        }

        static bool VerifyPassword(string password, string hash) => HashPassword(password) == hash;

        static Texture2D BytesToTexture(byte[] bytes)
        {
            var tex = new Texture2D(2, 2);
            if (tex.LoadImage(bytes)) return tex;
            return null;
        }

        // ── Data models ───────────────────────────────────
        class CredentialsFile { public List<UserEntry> users; }
        class UserEntry { public string username; public string hash; public string role; }

        class AssetIndex { public List<AssetIndexEntry> assets; }
        class AssetIndexEntry { public string name; public string info_file_id; }

        class AssetEntry
        {
            public string Name;
            public string InfoFileId;
            public AssetInfo Info;
            public Texture2D Cover;
        }

        class AssetInfo
        {
            public string name;
            public string publisher;
            public string description;
            public string[] tags;
            public string asset_store_url;
            public float? price_usd;
            public string cover;
            public string[] screenshots;
            public PackageVersion[] packages;
        }

        class PackageVersion
        {
            public string version;
            public string file_id;
            public string notes;
        }

        class ServiceAccount
        {
            public string client_email;
            public string private_key;
        }

        class TokenResponse
        {
            public string access_token;
            public long expires_in;
        }
    }
}
