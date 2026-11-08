; Inno Setup Script for BotCord
#define MyAppName "BotCord"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "BotCord Team"
#define MyAppExeName "BotCord.exe"

[Setup]
AppId={{D37F8E19-86BC-4B1C-B7D9-45F4B6AE9C51}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\..\dist
OutputBaseFilename=BotCord-Setup-{#MyAppVersion}
SetupIconFile=..\..\assets\botcord.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\..\BotCord.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\assets\botcord.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\assets\botcord.png"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\botcord.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\botcord.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
