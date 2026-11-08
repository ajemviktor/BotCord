Name:           botcord
Version:        0.1.0
Release:        1%{?dist}
Summary:        Discord Bot Desktop Client • OLED Edition

License:        MIT
URL:            https://github.com/botcord/botcord
Source0:        %{name}-%{version}.tar.gz

BuildRequires:  cargo
BuildRequires:  rust >= 1.75
BuildRequires:  desktop-file-utils
Requires:       chromium

%description
BotCord is an ultra-fast, minimalist OLED Discord Bot client written in Rust.
It provides multi-session tabbed bot management, live Discord gateway events,
presence updates, and rich embed previews.

%prep
%autosetup

%build
cargo build --release

%install
rm -rf %{buildroot}
install -d -m 0755 %{buildroot}%{_bindir}
install -d -m 0755 %{buildroot}%{_datadir}/applications
install -d -m 0755 %{buildroot}%{_datadir}/icons/hicolor/256x256/apps

install -m 0755 target/release/BotCord %{buildroot}%{_bindir}/botcord
install -m 0644 installer/fedora/botcord.desktop %{buildroot}%{_datadir}/applications/botcord.desktop
install -m 0644 assets/botcord.png %{buildroot}%{_datadir}/icons/hicolor/256x256/apps/botcord.png

%check
desktop-file-validate %{buildroot}%{_datadir}/applications/botcord.desktop

%files
%{_bindir}/botcord
%{_datadir}/applications/botcord.desktop
%{_datadir}/icons/hicolor/256x256/apps/botcord.png

%changelog
* Sun Nov 08 2026 BotCord Team <info@botcord.app> - 0.1.0-1
- Initial release for Fedora Linux
