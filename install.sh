#!/usr/bin/env bash
# BotCord Self-Contained Linux Installer
set -e

APP_NAME="botcord"
VERSION="0.1.0"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================="
echo "   Installing BotCord v${VERSION} on Linux"
echo "==========================================="

# Check Chromium dependency
if ! command -v chromium &>/dev/null && \
   ! command -v google-chrome &>/dev/null && \
   ! command -v google-chrome-stable &>/dev/null && \
   ! command -v microsoft-edge &>/dev/null && \
   ! command -v brave-browser &>/dev/null; then
    echo "Notice: BotCord uses a Chromium-based standalone window."
    echo "Recommendation: sudo dnf install -y chromium"
fi

# Determine prefix
DEFAULT_PREFIX="/usr/local"
if [ "$(id -u)" -ne 0 ]; then
    DEFAULT_PREFIX="${HOME}/.local"
fi

if [ -t 0 ] && [ -z "$PREFIX" ]; then
    read -rp "Enter installation prefix [${DEFAULT_PREFIX}]: " USER_PREFIX
    PREFIX="${USER_PREFIX:-$DEFAULT_PREFIX}"
else
    PREFIX="${PREFIX:-$DEFAULT_PREFIX}"
fi

BIN_DIR="${PREFIX}/bin"
APPS_DIR="${PREFIX}/share/applications"
ICON_DIR="${PREFIX}/share/icons/hicolor/256x256/apps"

mkdir -p "${BIN_DIR}" "${APPS_DIR}" "${ICON_DIR}"

# Locate or build binary
BIN_SRC="${ROOT_DIR}/target/release/BotCord"
if [ ! -f "${BIN_SRC}" ]; then
    BIN_SRC="${ROOT_DIR}/BotCord"
fi

if [ ! -f "${BIN_SRC}" ]; then
    echo "Building BotCord release binary..."
    if command -v cargo &>/dev/null; then
        (cd "${ROOT_DIR}" && cargo build --release)
        BIN_SRC="${ROOT_DIR}/target/release/BotCord"
    else
        echo "[!] Cargo not found. Please install: sudo dnf install -y cargo"
        exit 1
    fi
fi

if [ -f "${BIN_SRC}" ]; then
    cp -f "${BIN_SRC}" "${BIN_DIR}/${APP_NAME}"
    chmod 755 "${BIN_DIR}/${APP_NAME}"
    echo "[✓] Installed executable to ${BIN_DIR}/${APP_NAME}"
else
    echo "[!] Build failed."
    exit 1
fi

# Copy icon
if [ -f "${ROOT_DIR}/assets/botcord.png" ]; then
    cp -f "${ROOT_DIR}/assets/botcord.png" "${ICON_DIR}/${APP_NAME}.png"
    echo "[✓] Installed icon to ${ICON_DIR}/${APP_NAME}.png"
fi

# Create desktop entry
cat << 'EOF' > "${APPS_DIR}/${APP_NAME}.desktop"
[Desktop Entry]
Name=BotCord
Comment=Discord Bot Desktop Client • OLED Edition
GenericName=Discord Bot Client
Exec=botcord %u
Icon=botcord
Terminal=false
Type=Application
Categories=Network;InstantMessaging;Chat;
StartupWMClass=botcord
Keywords=discord;bot;client;chat;
EOF
chmod 644 "${APPS_DIR}/${APP_NAME}.desktop"
echo "[✓] Installed desktop launcher to ${APPS_DIR}/${APP_NAME}.desktop"

# Refresh databases
if command -v update-desktop-database &>/dev/null; then
    update-desktop-database "${APPS_DIR}" 2>/dev/null || true
fi
if command -v gtk-update-icon-cache &>/dev/null; then
    gtk-update-icon-cache -f -t "${ICON_DIR}/../../.." 2>/dev/null || true
fi

echo "==========================================="
echo "BotCord installation finished successfully!"
echo "Run '${APP_NAME}' from terminal or application menu."
echo "==========================================="
