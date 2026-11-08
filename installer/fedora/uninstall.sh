#!/usr/bin/env bash
# BotCord Fedora / Linux Uninstaller
set -e

APP_NAME="botcord"

if [ "$(id -u)" -eq 0 ]; then
    BIN_DIR="/usr/local/bin"
    APPS_DIR="/usr/share/applications"
    ICON_DIR="/usr/share/icons/hicolor/256x256/apps"
else
    BIN_DIR="${HOME}/.local/bin"
    APPS_DIR="${HOME}/.local/share/applications"
    ICON_DIR="${HOME}/.local/share/icons/hicolor/256x256/apps"
fi

rm -f "${BIN_DIR}/${APP_NAME}"
rm -f "${APPS_DIR}/${APP_NAME}.desktop"
rm -f "${ICON_DIR}/${APP_NAME}.png"

if command -v update-desktop-database &>/dev/null; then
    update-desktop-database "${APPS_DIR}" 2>/dev/null || true
fi

echo "BotCord has been removed."
