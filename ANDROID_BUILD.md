# Android native build and EAS Internal

This guide covers the native Expo application in apps/mobile. It produces a debug APK for Android Studio testing and a signed EAS Internal APK for UAT. It does not publish to Google Play, create an AAB, or commit Android signing credentials.

## Release configuration

- apps/mobile/app.json is the source of truth for the application name, package ID, version and native permission policy.
- The current release label is 1.0.3; EAS owns the Android build number via appVersionSource: remote and autoIncrement in apps/mobile/eas.json.
- The package ID remains vn.vlxd.operations.
- apps/mobile/android and apps/mobile/ios are generated Expo prebuild outputs. Do not hand-edit them or commit a keystore. Regenerate them from app.json and the Expo plugins when native configuration changes.
- Camera/photo, notification and location permissions remain feature-scoped. Microphone access is explicitly blocked because the application has no audio workflow.

## Windows prerequisites

Install Android Studio with the Android SDK, an emulator image, build tools and platform tools. This workstation uses these paths:

~~~powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = 'E:\Android\Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

java -version
adb version
~~~

To persist the two paths for the current Windows user, run once in PowerShell, then open a new terminal:

~~~powershell
[Environment]::SetEnvironmentVariable('JAVA_HOME', 'C:\Program Files\Android\Android Studio\jbr', 'User')
[Environment]::SetEnvironmentVariable('ANDROID_HOME', 'E:\Android\Sdk', 'User')
[Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', 'E:\Android\Sdk', 'User')
~~~

E:\Android\Sdk is the preferred SDK location. If this machine uses a different SDK, replace all three references consistently. Do not set a second conflicting Android SDK path.

## Regenerate and test a debug APK

Run from the repository root. Regeneration deletes and recreates generated native folders, so stop first if a local Android project has intentional, uncommitted changes.

~~~powershell
Set-Location 'D:\Project Hien Xa\apps\mobile'
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = 'E:\Android\Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

npm.cmd ci
npx.cmd expo prebuild --clean --platform android
npx.cmd expo-doctor
npm.cmd run typecheck
npm.cmd test

Push-Location android
.\gradlew.bat assembleDebug
Pop-Location

adb install -r .\android\app\build\outputs\apk\debug\app-debug.apk
~~~

Open D:\Project Hien Xa\apps\mobile\android in Android Studio after the prebuild step to run an emulator, inspect Logcat, or use the standard Debug button. For Expo-driven emulator testing instead, start the selected emulator and run npm.cmd run android from apps/mobile.

Before accepting a debug APK, test login/logout, Android Back, all role boundaries, permission deny/allow, GPS start/stop, image and XLSX selection, offline/resume, push toggle, and a 401 session-expiry recovery. Debug APKs are for local testing only and must not be shared as a production release.

## EAS Internal APK

EAS manages Android signing. Do not create, download into the repository, or commit a keystore. Log in to the correct Expo account, then run the release gate before submitting the single Internal build:

~~~powershell
Set-Location 'D:\Project Hien Xa\apps\mobile'
npx.cmd expo-doctor
npm.cmd run typecheck
npm.cmd test
npx.cmd expo export --platform android
npx.cmd eas-cli whoami
npx.cmd eas-cli build --platform android --profile internal
~~~

The internal profile always uses HTTPS https://vlxd-hien-xa.vercel.app and produces an APK. Wait until the EAS build is FINISHED and has an artifact URL before sharing it for UAT:

~~~powershell
npx.cmd eas-cli build:list --platform android --limit 5
~~~

Use that EAS artifact URL in the web release manifest only after the APK has installed successfully and UAT has passed. This batch does not publish to Google Play and does not make an AAB.

## Versioning, rollback, and build retention

- Change the app version only in apps/mobile/app.json, after all local and UAT gates are complete. The current target is 1.0.3.
- EAS increments Android build numbers remotely. Never reuse or decrease an Android build number to roll back.
- Keep the previous completed Internal APK as the fallback until the new APK is installed and accepted in UAT. To roll back, distribute the previous EAS artifact instead of deleting it or overwriting source configuration.
- Keep the two newest FINISHED Internal builds. First review the dry run:

~~~powershell
npm.cmd run release:prune
~~~

Only after the new build is installed and accepted in UAT, remove older builds:

~~~powershell
npm.cmd run release:prune -- --confirm
~~~
