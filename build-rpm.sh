#!/usr/bin/env bash
# BotCord Native RPM Builder for Fedora
set -e

echo "==========================================="
echo "   Building BotCord .RPM package for Fedora"
echo "==========================================="

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check requirements
if ! command -v cargo &>/dev/null || ! command -v rpmbuild &>/dev/null; then
    echo "Installing build prerequisites (cargo, rpm-build, chromium)..."
    sudo dnf install -y cargo rpm-build desktop-file-utils chromium
fi

echo "Compiling BotCord release binary..."
(cd "${ROOT_DIR}" && cargo build --release)

RPM_TOP="${HOME}/rpmbuild"
mkdir -p "${RPM_TOP}/BUILD" "${RPM_TOP}/RPMS" "${RPM_TOP}/SOURCES" "${RPM_TOP}/SPECS" "${RPM_TOP}/SRPMS"

FEDORA_VER=$(rpm -E %fedora 2>/dev/null || echo "41")
ARCH=$(uname -m)
BUILDROOT="${RPM_TOP}/BUILDROOT/botcord-0.1.0-1.fc${FEDORA_VER}.${ARCH}"

rm -rf "${BUILDROOT}"
mkdir -p "${BUILDROOT}/usr/bin"
mkdir -p "${BUILDROOT}/usr/share/applications"
mkdir -p "${BUILDROOT}/usr/share/icons/hicolor/256x256/apps"

cp -f "${ROOT_DIR}/target/release/BotCord" "${BUILDROOT}/usr/bin/botcord"
chmod 755 "${BUILDROOT}/usr/bin/botcord"

cat << 'EOF' > "${BUILDROOT}/usr/share/applications/botcord.desktop"
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
chmod 644 "${BUILDROOT}/usr/share/applications/botcord.desktop"

cp -f "${ROOT_DIR}/assets/botcord.png" "${BUILDROOT}/usr/share/icons/hicolor/256x256/apps/botcord.png"
chmod 644 "${BUILDROOT}/usr/share/icons/hicolor/256x256/apps/botcord.png"

SPEC_FILE="${ROOT_DIR}/installer/fedora/botcord.spec"
rpmbuild -bb --buildroot="${BUILDROOT}" --noclean --nodeps "${SPEC_FILE}"

RPM_FILE=$(find "${RPM_TOP}/RPMS" -name "botcord-*.rpm" | head -n 1)

if [ -f "${RPM_FILE}" ]; then
    cp -f "${RPM_FILE}" "${ROOT_DIR}/"
    echo "==========================================="
    echo "[✓] SIKERES RPM CSOMAGOLÁS!"
    echo "Elkészült csomag: ${RPM_FILE}"
    echo "Telepítés most a rendszerre (sudo dnf install)..."
    sudo dnf install -y "${RPM_FILE}"
    echo "A BotCord mostantól natív RPM csomagként telepítve van a rendszereden!"
    echo "==========================================="
fi
