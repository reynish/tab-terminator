# Tab Terminator

![Marquee image](public/marquee.png)

A Chrome extensions to terminate unused tabs

## Development

No build step is needed to run the extension locally: load the `src` directory
via `chrome://extensions` → "Load unpacked".

### Tests

Unit tests use [node-tap](https://node-tap.org) and cover the tab-termination
rules in `src/lib/terminate.js`:

```shell
npm install
npm test
```

### Package

Creates `tab-terminator.zip` (with `manifest.json` at the archive root, as the
Chrome Web Store requires):

```shell
npm run build
```

### CI

- `test.yml` runs the tests and uploads the packaged zip as a build artifact on
every push to `main` and every pull request.
- `publish.yml` uploads and publishes a new version to the Chrome Web Store when
a GitHub release is published (or manually via workflow_dispatch).

### Publishing

The publish workflow needs four repository secrets (`Settings` → `Secrets and
variables` → `Actions`):

| Secret | Where to find it |
| --- | --- |
| `CHROME_EXTENSION_ID` | Chrome Web Store Developer Dashboard, on the item's page |
| `CHROME_CLIENT_ID` | Google Cloud Console OAuth client ID (see [guide](https://developer.chrome.com/docs/webstore/using-api)) |
| `CHROME_CLIENT_SECRET` | Same OAuth client |
| `CHROME_REFRESH_TOKEN` | Generated via the OAuth playground with the `chromewebstore` scope (see guide above) |

The Web Store rejects re-uploading an unchanged version, so bump `version` in
`src/manifest.json` before publishing.
