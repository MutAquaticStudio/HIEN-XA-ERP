# Mobile release and update policy

## Versioning

1. Bump `apps/mobile/app.json` for every user-visible Android release, for example `1.0.1` to `1.0.2`.
2. Build and upload the APK to an HTTPS download location.
3. Configure the public Vercel release manifest before publishing the download link.

EAS profiles use `autoIncrement: true` with the existing remote version source. Every Android build therefore receives a new Expo build number automatically, including rebuilds of the same user-visible version.

## Vercel environment variables

| Variable | Purpose |
| --- | --- |
| `MOBILE_LATEST_VERSION` | Latest app version, for example `1.0.1`. Enables the update notice. |
| `MOBILE_MINIMUM_SUPPORTED_VERSION` | Oldest app version allowed to continue. Use the latest version only for a mandatory update. |
| `MOBILE_ANDROID_DOWNLOAD_URL` | HTTPS URL of the approved APK. Do not store credentials or tokens in this URL. |
| `MOBILE_RELEASE_NOTES` | Short Vietnamese release note, maximum 800 characters. |

## Safety rules

- The manifest endpoint is public and contains no account, business, token, or financial data.
- A missing `MOBILE_LATEST_VERSION` disables the notice safely.
- The application never installs an APK silently. The user explicitly opens the approved download link.
- Mandatory updates should be used only after the replacement APK and rollback path have been checked.
- Native MapLibre is included only in EAS/Internal APKs. It cannot run in Expo Go. The temporary OpenStreetMap style is suitable for pilot traffic; select a production tile/style provider before high-volume release.

## EAS build retention

Keep the two newest finished Android Internal builds: the current release and one rollback APK. Do not delete a build while the replacement is queued, failed, or has not been installed successfully.

```powershell
cd "D:\Project Hien Xa\apps\mobile"
npm.cmd run release:prune
```

The first command is a dry run. Only after the new APK is confirmed on a device, delete the eligible older builds explicitly:

```powershell
npm.cmd run release:prune -- --confirm
```
