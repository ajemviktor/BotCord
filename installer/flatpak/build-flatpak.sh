#!/usr/bin/env bash
# BotCord Flatpak Build & Install Script for Fedora
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

echo "==========================================="
echo "   Building BotCord Flatpak for Fedora"
echo "==========================================="

# Check flatpak-builder
if ! command -v flatpak-builder &>/dev/null; then
    echo "Installing flatpak-builder..."
    sudo dnf install -y flatpak-builder
fi

# Ensure Flathub remote and SDK runtimes
flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo || true
flatpak install -y flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08 org.freedesktop.Sdk.Extension.rust-stable//24.08 || true

MANIFEST="app.botcord.BotCord.yml"
if [ ! -f "${MANIFEST}" ] && [ -f "installer/flatpak/${MANIFEST}" ]; then
    MANIFEST="installer/flatpak/${MANIFEST}"
fi

flatpak-builder --user --install --force-clean --share-network build-dir "${MANIFEST}"

echo "==========================================="
echo "BotCord Flatpak successfully installed!"
echo "Run with: flatpak run app.botcord.BotCord"
echo "==========================================="
