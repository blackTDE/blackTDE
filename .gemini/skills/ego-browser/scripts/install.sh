#!/bin/sh
set -eu

# ego lite installer script for macOS
DMG_URL_ARM64="https://cdn.ego.app/setup/macos/arm64/egolite-Y7MbxKIuhzFB.dmg"
DMG_URL_X64="https://cdn.ego.app/setup/macos/x64/egolite-Y7MbxKIuhzFB.dmg"
APP_NAME="ego lite"
APP_BUNDLE_NAME="$APP_NAME.app"
APP_PATH="/Applications/$APP_BUNDLE_NAME"
USER_APP_PATH="$HOME/Applications/$APP_BUNDLE_NAME"
EGO_BROWSER_HELPER_NAME="ego-browser"

TEMP_DIR=""
MOUNT_DIR=""
DMG_ATTACHED=""

log() {
	printf '%s\n' "$*" >&2
}

die() {
	log "error: $*"
	exit 1
}

require_command() {
	command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

select_dmg_url() {
	if [ "$(uname -m)" = "arm64" ]; then
		printf '%s\n' "$DMG_URL_ARM64"
	else
		printf '%s\n' "$DMG_URL_X64"
	fi
}

cleanup() {
	if [ "$DMG_ATTACHED" = "1" ]; then
		hdiutil detach "$MOUNT_DIR" -quiet >/dev/null 2>&1 || true
		DMG_ATTACHED=""
	fi

	if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
		rm -rf "$TEMP_DIR" >/dev/null 2>&1 || true
	fi
}

strip_quarantine() {
	app_path="$1"
	xattr -dr com.apple.quarantine "$app_path" >/dev/null 2>&1 || true
}

trap cleanup EXIT HUP INT TERM

is_ego_lite_installed() {
	for candidate in "$APP_PATH" "$USER_APP_PATH"; do
		if [ -d "$candidate" ]; then
			return 0
		fi
	done
	return 1
}

install_ego_lite() {
	require_command curl
	require_command hdiutil

	temp_base_dir=${TMPDIR:-/tmp}
	TEMP_DIR=$(mktemp -d "$temp_base_dir/ego-lite-install.XXXXXX")
	MOUNT_DIR="$TEMP_DIR/mount"
	dmg_path="$TEMP_DIR/egolite.dmg"
	dmg_url=$(select_dmg_url)
	mkdir -p "$MOUNT_DIR"

	log "$APP_NAME is not installed. Downloading $dmg_url ..."
	curl -fL --retry 3 --output "$dmg_path" "$dmg_url" || die "failed to download $APP_NAME"

	log "Mounting installer DMG ..."
	hdiutil attach "$dmg_path" -nobrowse -readonly -mountpoint "$MOUNT_DIR" >/dev/null
	DMG_ATTACHED="1"

	app_in_dmg=$(find "$MOUNT_DIR" -maxdepth 2 -type d -iname "$APP_BUNDLE_NAME" | head -n 1)

	if [ -n "$app_in_dmg" ]; then
		staged_app="$TEMP_DIR/$APP_BUNDLE_NAME"
		log "Installing $APP_NAME to $APP_PATH ..."
		ditto "$app_in_dmg" "$staged_app" || die "failed to copy app"
		strip_quarantine "$staged_app"

		if [ -w "/Applications" ]; then
			rm -rf "$APP_PATH" || true
			mv "$staged_app" "$APP_PATH"
			installed_path="$APP_PATH"
		else
			mkdir -p "$HOME/Applications"
			rm -rf "$USER_APP_PATH" || true
			mv "$staged_app" "$USER_APP_PATH"
			installed_path="$USER_APP_PATH"
		fi
		strip_quarantine "$installed_path"
		return 0
	fi

	die "Could not find $APP_BUNDLE_NAME in DMG"
}

main() {
	[ "$(uname -s)" = "Darwin" ] || die "ego-lite only supports macOS"

	if is_ego_lite_installed; then
		log "ego-lite is already installed."
		if [ -d "$APP_PATH" ]; then
			open "$APP_PATH"
		else
			open "$USER_APP_PATH"
		fi
		exit 0
	fi

	install_ego_lite
	log "ego lite installed successfully. Launching app for onboarding..."
	if [ -d "$APP_PATH" ]; then
		open "$APP_PATH"
	else
		open "$USER_APP_PATH"
	fi
}

main
