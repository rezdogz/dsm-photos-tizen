# DSM Photos for Samsung TV

A small, dependency-free **Synology Photos** viewer for **Samsung Tizen TVs**. It browses your photos over your local network, with a running timeline like Synology Photos and Google Photos. Sit on the couch, flip through your library, star the good ones, and come back later to review only your favourites.

It is a sideloadable `.wgt` app (package `DsmPhotos0.DsmPhotos`) that talks directly to your NAS. There is no server component and nothing to install on the NAS.

> **AI coded, human guided.** The code was written by an AI assistant (Claude, by Anthropic) under the direction of a human maintainer, who decided what to build and tested it on a real Samsung TV and Synology NAS. Treat it like any hobby project: read the code before you trust it with a password.

> Not affiliated with, or endorsed by, Samsung or Synology. Synology Photos has no official public API; this project uses the same web endpoints the Synology Photos web app uses, so a DSM or Photos update could break it.

## Features

- **Running timeline**: photos flow down the page under a heading per day with its location, like Synology Photos and Google Photos, in justified rows that keep each photo's shape. More days load as you scroll; the page never holds the whole library at once.
- **Folders and albums** with thumbnails, alongside the timeline.
- **Full-screen viewer**: instant preview from the NAS, then the full-resolution file fades in over it. Next photo is preloaded. Optional **slideshow**.
- **Favourites**: press Up (or Red) on a photo to star it, then open **Favourites** to see only those. Stars are saved to a small JSON file on your NAS, so they survive reinstalls and are shared by every TV using the same account.
- **Save favourites as an album** (Personal Space): open **Favourites** and choose the **Save as album** tile. The first time it creates a Synology Photos album called "TV Favourites"; after that, each time you press it the album is made to match your favourites: new stars are added and photos you have un-starred are removed from the album (never deleted from your library). To share it, open the album in Synology Photos and share it from there.
- **Profiles**: save several logins (for example one per family member) and switch with the Blue button. Each profile has its own space, options and favourites.
- **Personal Space or Shared Space** in Synology Photos, chosen per profile.
- **Fast on a TV**: only thumbnails near the cursor are loaded, thumbnails are cached on the TV (150 MB, least recently used removed first), and unfinished downloads are cancelled when you move on.
- No cloud, no accounts, no analytics. Everything stays between your TV and your NAS.

## Requirements

- A Samsung Tizen TV (the app declares Tizen 5.0 or newer; developed and tested on a Samsung Crystal UHD U8000F, model UN65U8000FFXZA, running Tizen 9).
- A Synology NAS running **Synology Photos**, reachable from the TV on your local network (developed and tested against **DSM 7.3.2**).
- A way to sideload `.wgt` files onto the TV (see below).
- To build from source: Python 3 and [Pillow](https://pypi.org/project/pillow/) (used only to draw the app icons).

## 1. Get the apps

**Download:** grab `dsm_photos.wgt` from the Releases page of this repository.

**Or build them:**

```bash
pip install pillow
python3 build.py
# -> dist/dsm_photos.wgt
```

## 2. Install on the TV

The `.wgt` files are **unsigned**. Samsung TVs only run apps signed with a certificate registered to that TV, so the installer must sign the package for you. Either option below does that.

### Option A: Apps2Samsung

[Apps2Samsung](https://github.com/Apps2Samsung/tizen-community-packages) installs community packages on a TV and re-signs them with your own certificate. Put the TV in **Developer Mode**, select your TV in Apps2Samsung, and install the `.wgt` file you downloaded or built. Re-installing a newer version over an older one replaces it.

*This is how the maintainer installed it:* Apps2Samsung with the **Custom WGT** option, choosing `dsm_photos.wgt`, on a Samsung UN65U8000FFXZA.

### Option B: Tizen Studio command line

1. Install [Tizen Studio](https://developer.tizen.org/development/tizen-studio/download) and create a Samsung certificate profile in the Certificate Manager (it must include your TV's DUID).
2. Turn on **Developer Mode** on the TV (Apps panel, type `12345`, set Developer mode to On and enter your computer's IP), then restart the TV.
3. Connect and install:

```bash
sdb connect <TV-IP>
tizen package -t wgt -s <your-certificate-profile> -- dist/dsm_photos
tizen install -n <the-signed-.wgt-from-the-step-above> -t <TV-name-from-sdb-devices>
```

(`dist/dsm_photos` is the package folder produced by `build.py`.)

## 3. Prepare the NAS

Create a **dedicated DSM user** for the TV. Do not use an administrator account.

- The account must **not use 2-step verification** (the TV has no way to enter a code).
- Give the user permission to use **Synology Photos** (Control Panel > User and Group > Edit > Applications).
  - *Shared Space:* in Synology Photos settings, give the user access to the Shared Space.
  - *Personal Space:* enable Personal Space for the user in Synology Photos settings.
- **To save favourites to the NAS** (optional, recommended): give the user the **File Station** app permission and **read/write** access to the place the favourites file lives. By default that is the user's own home folder, so enable the User Home service (Control Panel > User and Group > Advanced) for them. You do not need to grant write access to your photo library.

Use plain **HTTP on port 5000** on a trusted LAN. HTTPS on port 5001 works only if the TV trusts the certificate, which self-signed certificates usually are not.

## 4. First run

1. Open the app. The first screen is Settings.
2. Enter the NAS address (for example `192.168.1.50`), port, the DSM username and password, and press **Connect**.
3. Pick **Shared Space** or **Personal Space**, and whether to **start in the timeline or in folders**.

The app remembers your login and goes straight in next time.

## Remote control

**Browsing**

| Key | Action |
| --- | --- |
| Arrow keys | Move |
| OK | Open a photo or folder |
| Back | Up one level (exits at the top) |
| Play / Green | Start a slideshow |
| Red | Star or unstar the highlighted photo |
| Yellow | Settings |
| Blue | Switch profile |
| Channel + / - | Timeline: jump to a newer / older month |

**In a photo**

| Key | Action |
| --- | --- |
| Left / Right (or Rewind / Fast-forward, Channel -/+) | Previous / next photo |
| Up or Red | Star or unstar |
| OK / Play-Pause | Start or pause the slideshow |
| Down | Show the filename and position |
| Back | Return to the grid |

The photo caption also shows how long the preview and the full-resolution file took to load.

## Settings

| Setting | Meaning |
| --- | --- |
| NAS address, Port, Protocol | How to reach DSM (usually `http`, `5000`). |
| Photos space | Shared Space or Personal Space. |
| Start view | Open in the timeline or in folders. |
| Username, Password | The dedicated DSM user. |
| Slideshow interval | 3 to 60 seconds. |
| Photo quality | *Fast*: the NAS-resized preview only. *Full resolution*: preview first, then the original. |
| Save favourites | On: keep stars in a file on the NAS. Off: this TV only. |
| Favourites file | Where the file lives. Blank means `/homes/<username>/dsm_photos-favourites.json`. A path ending in `/` uses the default file name in that folder. |

## Favourites and profiles

- Stars are stored on the TV immediately and uploaded to the favourites file about a second and a half later. A toast tells you if it worked.
- **Save as album:** the first tile in Favourites (Personal Space only; Synology has no album API for Shared Space). It needs a DSM user who may create albums in Synology Photos. The album is managed by the app, so photos you add to it by hand in Synology Photos are removed the next time you save. Saving with no favourites at all does nothing. It is the one feature that writes to your Photos library. The album calls are based on the Synology Photos web API and are less tested than the rest, so please report problems.
- On connect, the NAS copy is loaded first. If an earlier upload failed, the TV's unsent stars are merged in and uploaded.
- If the user has no write access you will see "Saved on this TV only. No write access to ...". Stars still work locally.
- With several TVs, the last save wins.
- Profiles: press **Blue** (or open the **Switch profile** tile), choose a profile, or **Add profile**. Press **Red** twice on a profile to remove it from the TV (your NAS files are untouched; the active profile cannot be removed).

## Privacy and security

The app is built for a trusted home network and never contacts anything except the NAS address you enter. There is no cloud service, account, analytics or third-party code. Within that model, these are the things to know:

- **Credentials are stored in plain text** in the app's local storage on the TV, for every profile. Use a dedicated low-privilege DSM user (not an administrator, no 2-step verification), and do not reuse a password you use elsewhere.
- **Local network only.** Over plain HTTP, the password and photos are not encrypted in transit. Do not point the app at an internet-facing address (port forward, QuickConnect) over HTTP.
- **Session ID in URLs.** Synology requires the session ID in image requests, so it appears in the NAS's access logs and in debugging tools such as the Apps2Samsung debug console. The app signs in again when a session expires but does not log out when you close it or switch profile; the NAS ends idle sessions on its own. Do not share debug logs without removing `_sid=...`.
- **Wide network permission.** The package allows requests to any address (`<access origin="*">`), because your NAS address is whatever you type. The app only ever uses the address in your settings.
- **No Content-Security-Policy.** The app builds its screens with safe text assignments (file names and places never become HTML), but it does not add a policy as a second line of defence.
- **Cached thumbnails stay on the TV.** Thumbnails are cached for speed (up to 150 MB, oldest removed first). Removing a profile deletes its login and favourites but not its cached thumbnails, which are replaced over time. Uninstalling the app clears everything.
- **Tested on one setup:** a Samsung UN65U8000FFXZA (Tizen 9) and one Synology NAS running DSM 7.3.2 with Synology Photos, reached over plain HTTP on port 5000 on a wired LAN. Other TVs and DSM versions may behave differently.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| "Wrong username or password" | Credentials, or the account is disabled. |
| "This account uses 2-step verification" | Use a DSM user without 2-step verification. |
| "No permission" / error 105 | The user lacks the Synology Photos app permission, or access to the Space. |
| "Synology Photos is not available" / error 102 | Synology Photos is not installed, or you chose the wrong Space. |
| "Cannot reach the NAS" | Wrong address or port, or the TV and NAS are on different networks. |
| Empty Personal Space | Personal Space is not enabled for that user in Synology Photos. |
| "No write access to ..." | Give the user write access to the favourites folder, or turn Save favourites off. |
| Slow full-size photos | Check NAS disk and CPU load (DSM Resource Monitor) and the TV's network link. The preview appears first either way. |

The Apps2Samsung debug console (a feature of that community tool, not of the TV) shows the app's network requests and timings, which helps when reporting problems.

## How it works

- Browsing, thumbnails and originals use the `SYNO.Foto.*` and `SYNO.FotoTeam.*` web APIs (`Browse.Folder`, `Browse.Item`, `Thumbnail`, `Download`).
- The timeline asks Photos for every photo's date, size and address in one date-sorted list, groups it by day and shows a day at a time.
- Favourites use `SYNO.FileStation.Upload` and `SYNO.FileStation.Download` for one small JSON file.
- API paths are discovered with `SYNO.API.Info`, and the app signs in again if the session expires.
- Plain ES5-style JavaScript, no frameworks, and no build tooling beyond a Python script that packs the `.wgt`.

```
src/
  index.html      screens: settings, browser, viewer
  css/style.css   1920x1080 TV layout
  js/app.js       everything else
build.py          builds dist/dsm_photos.wgt
```

`build.py` stamps the version into a copy of `src/`, writes a `config.xml` and an icon, and zips the result. Bump the version number in `TARGETS` before each release.

## Credits

- [Apps2Samsung](https://github.com/Apps2Samsung/tizen-community-packages) for making sideloading practical.
- [zeichensatz/SynologyPhotosAPI](https://github.com/zeichensatz/SynologyPhotosAPI) for community documentation of the Synology Photos web API.

## License

Copyright (c) 2026 Damien Hickey.

Released under the [GNU General Public License v3.0](LICENSE) (GPL-3.0-or-later). You are free to use, study, modify and share this software, including commercially. If you distribute a modified version, you must make its source available under the same licence. The aim is to keep this project open and in the hands of the community.
