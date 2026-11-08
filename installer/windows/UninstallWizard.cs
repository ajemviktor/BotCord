using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using Microsoft.Win32;

namespace BotCordInstaller {
    static class UninstallProgram {
        [STAThread]
        static void Main() {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string installDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');

            DialogResult res = MessageBox.Show(
                "Biztosan el szeretnéd távolítani a BotCord alkalmazást és minden összetevőjét a számítógépről?\n\nTelepítési mappa: " + installDir,
                "BotCord Eltávolítása",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );

            if (res != DialogResult.Yes) return;

            try {
                // 1. Close running BotCord instances
                foreach (Process p in Process.GetProcessesByName("BotCord")) {
                    try { p.Kill(); p.WaitForExit(1000); } catch { }
                }

                // 2. Remove Shortcuts
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                string desktopLnk = Path.Combine(desktop, "BotCord.lnk");
                if (File.Exists(desktopLnk)) File.Delete(desktopLnk);

                string startMenu = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                string startLnk = Path.Combine(startMenu, "BotCord.lnk");
                if (File.Exists(startLnk)) File.Delete(startLnk);

                // 3. Remove Registry Uninstall Key
                try {
                    Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\BotCord", false);
                } catch { }

                // 4. Schedule self-deletion of install directory
                ProcessStartInfo psi = new ProcessStartInfo {
                    FileName = "cmd.exe",
                    Arguments = string.Format("/c ping 127.0.0.1 -n 2 > nul & rmdir /s /q \"{0}\"", installDir),
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true
                };
                Process.Start(psi);

                MessageBox.Show(
                    "A BotCord sikeresen el lett távolítva a számítógépről.",
                    "Eltávolítás Befejezve",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            } catch (Exception ex) {
                MessageBox.Show("Hiba történt az eltávolítás során: " + ex.Message, "Hiba", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
