const GitHub = (() => {
  function headers() {
    return {
      'Authorization': `token ${CONFIG.GITHUB_PAT}`,
      'Accept':        'application/vnd.github.v3+json',
      'Content-Type':  'application/json'
    };
  }

  async function getGist(gistId) {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers: headers() });
    if (!res.ok) throw new Error(`Gist fetch failed: ${res.status}`);
    return res.json();
  }

  return {
    async readGist(gistId, filename) {
      const gist = await getGist(gistId);
      const file = gist.files[filename];
      if (!file) throw new Error(`File "${filename}" not found in gist`);
      if (file.truncated) {
        const raw = await fetch(file.raw_url);
        return JSON.parse(await raw.text());
      }
      return JSON.parse(file.content);
    },

    async writeGist(gistId, filename, data) {
      const res = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({
          files: { [filename]: { content: JSON.stringify(data, null, 2) } }
        })
      });
      if (!res.ok) throw new Error(`Gist write failed: ${res.status}`);
      return res.json();
    }
  };
})();
