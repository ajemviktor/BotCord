using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace BotCordInstaller {
    public class SetupWizardForm : Form {
        private int currentStep = 0;
        private const int TotalSteps = 4;

        // Custom Colors
        private readonly Color ClrBg = Color.FromArgb(17, 18, 20);
        private readonly Color ClrCard = Color.FromArgb(30, 31, 34);
        private readonly Color ClrHeader = Color.FromArgb(22, 23, 26);
        private readonly Color ClrAccent = Color.FromArgb(88, 101, 242);
        private readonly Color ClrAccentHover = Color.FromArgb(71, 82, 196);
        private readonly Color ClrTextPrimary = Color.FromArgb(242, 243, 245);
        private readonly Color ClrTextSecondary = Color.FromArgb(148, 155, 164);
        private readonly Color ClrBorder = Color.FromArgb(43, 45, 49);

        // UI Panels
        private Panel headerPanel;
        private Label lblHeaderTitle;
        private Label lblHeaderSubtitle;
        private PictureBox picHeaderLogo;

        private Panel contentPanel;
        private Panel[] stepPanels;

        private Panel footerPanel;
        private Button btnBack;
        private Button btnNext;
        private Button btnCancel;

        // Step 1: Destination
        private TextBox txtInstallPath;
        private Button btnBrowse;
        private Label lblFreeSpace;

        // Step 2: Options
        private CheckBox chkDesktopShortcut;
        private CheckBox chkStartMenuShortcut;
        private CheckBox chkRegisterUninstall;

        // Step 3: Progress
        private ProgressBar progressBar;
        private Label lblInstallStatus;

        // Step 4: Finish
        private CheckBox chkLaunchNow;

        public SetupWizardForm() {
            InitializeComponent();
            ShowStep(0);
        }

        private void InitializeComponent() {
            this.Text = "BotCord Telepítő (Setup)";
            this.Size = new Size(580, 440);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = ClrBg;
            this.ForeColor = ClrTextPrimary;
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

            // Try load icon
            try {
                using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("botcord.ico")) {
                    if (stream != null) this.Icon = new Icon(stream);
                }
            } catch { }

            // 1. Header Panel
            headerPanel = new Panel {
                Dock = DockStyle.Top,
                Height = 68,
                BackColor = ClrHeader
            };
            headerPanel.Paint += (s, e) => {
                using (Pen p = new Pen(ClrBorder)) {
                    e.Graphics.DrawLine(p, 0, headerPanel.Height - 1, headerPanel.Width, headerPanel.Height - 1);
                }
            };

            lblHeaderTitle = new Label {
                Location = new Point(18, 12),
                AutoSize = true,
                Font = new Font("Segoe UI", 11.5f, FontStyle.Bold),
                ForeColor = ClrTextPrimary,
                Text = "BotCord Telepítő"
            };
            lblHeaderSubtitle = new Label {
                Location = new Point(20, 36),
                AutoSize = true,
                Font = new Font("Segoe UI", 8.5f, FontStyle.Regular),
                ForeColor = ClrTextSecondary,
                Text = "Discord Bot Desktop Client • OLED Edition"
            };

            picHeaderLogo = new PictureBox {
                Location = new Point(510, 10),
                Size = new Size(48, 48),
                SizeMode = PictureBoxSizeMode.Zoom
            };
            try {
                using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("botcord.png")) {
                    if (stream != null) picHeaderLogo.Image = Image.FromStream(stream);
                }
            } catch { }

            headerPanel.Controls.Add(lblHeaderTitle);
            headerPanel.Controls.Add(lblHeaderSubtitle);
            headerPanel.Controls.Add(picHeaderLogo);
            this.Controls.Add(headerPanel);

            // 2. Footer Panel
            footerPanel = new Panel {
                Dock = DockStyle.Bottom,
                Height = 56,
                BackColor = ClrHeader
            };
            footerPanel.Paint += (s, e) => {
                using (Pen p = new Pen(ClrBorder)) {
                    e.Graphics.DrawLine(p, 0, 0, footerPanel.Width, 0);
                }
            };

            btnCancel = CreateStyledButton("Mégse", 470, 12, 85, 32, false);
            btnCancel.Click += (s, e) => {
                if (currentStep < 3) {
                    if (MessageBox.Show("Biztosan meg akarod szakítani a telepítést?", "Kilépés", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes) {
                        this.Close();
                    }
                } else if (currentStep == 4) {
                    FinishSetup();
                }
            };

            btnNext = CreateStyledButton("Tovább >", 375, 12, 88, 32, true);
            btnNext.Click += (s, e) => GoNext();

            btnBack = CreateStyledButton("< Vissza", 280, 12, 88, 32, false);
            btnBack.Click += (s, e) => GoBack();

            footerPanel.Controls.Add(btnBack);
            footerPanel.Controls.Add(btnNext);
            footerPanel.Controls.Add(btnCancel);
            this.Controls.Add(footerPanel);

            // 3. Content Panel & Steps
            contentPanel = new Panel {
                Location = new Point(0, 68),
                Size = new Size(580, 316),
                BackColor = ClrBg
            };
            this.Controls.Add(contentPanel);

            CreateStepPanels();
        }

        private Button CreateStyledButton(string text, int x, int y, int w, int h, bool isPrimary) {
            Button btn = new Button {
                Text = text,
                Location = new Point(x, y),
                Size = new Size(w, h),
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                Cursor = Cursors.Hand
            };
            btn.FlatAppearance.BorderSize = isPrimary ? 0 : 1;
            btn.FlatAppearance.BorderColor = ClrBorder;
            btn.BackColor = isPrimary ? ClrAccent : ClrCard;
            btn.ForeColor = ClrTextPrimary;

            btn.MouseEnter += (s, e) => {
                btn.BackColor = isPrimary ? ClrAccentHover : Color.FromArgb(43, 45, 49);
            };
            btn.MouseLeave += (s, e) => {
                btn.BackColor = isPrimary ? ClrAccent : ClrCard;
            };
            return btn;
        }

        private void CreateStepPanels() {
            stepPanels = new Panel[5];

            // ==========================================
            // Step 0: Welcome
            // ==========================================
            stepPanels[0] = new Panel { Dock = DockStyle.Fill, BackColor = ClrBg };
            PictureBox bigLogo = new PictureBox {
                Location = new Point(35, 30),
                Size = new Size(72, 72),
                SizeMode = PictureBoxSizeMode.Zoom
            };
            try {
                using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("botcord.png")) {
                    if (s != null) bigLogo.Image = Image.FromStream(s);
                }
            } catch { }

            Label lblWelcTitle = new Label {
                Location = new Point(125, 30),
                Size = new Size(410, 48),
                Font = new Font("Segoe UI", 13.5f, FontStyle.Bold),
                ForeColor = ClrTextPrimary,
                Text = "Üdvözöl a BotCord Telepítő!"
            };

            Label lblWelcDesc = new Label {
                Location = new Point(125, 85),
                Size = new Size(410, 160),
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                ForeColor = ClrTextSecondary,
                Text = "Ez a varázsló feltelepíti a számítógépedre a BotCord alkalmazást.\n\n" +
                       "• Gyors, natív Rust motor\n" +
                       "• Teljes több-munkamenetes Discord Bot vezérlés\n" +
                       "• OLED fekete modern felhasználói felület\n" +
                       "• Beágyazások és valós idejű eseménykövetés\n\n" +
                       "A folytatáshoz kattints a 'Tovább' gombra."
            };
            stepPanels[0].Controls.Add(bigLogo);
            stepPanels[0].Controls.Add(lblWelcTitle);
            stepPanels[0].Controls.Add(lblWelcDesc);

            // ==========================================
            // Step 1: Destination Folder Selection
            // ==========================================
            stepPanels[1] = new Panel { Dock = DockStyle.Fill, BackColor = ClrBg };
            Label lblDestTitle = new Label {
                Location = new Point(30, 20),
                AutoSize = true,
                Font = new Font("Segoe UI", 11f, FontStyle.Bold),
                ForeColor = ClrTextPrimary,
                Text = "Telepítési mappa kiválasztása"
            };
            Label lblDestPrompt = new Label {
                Location = new Point(32, 50),
                Size = new Size(500, 36),
                ForeColor = ClrTextSecondary,
                Text = "A program a megadott mappába fog települni. Ha másik mappát szeretnél, kattints a 'Tallózás...' gombra."
            };

            string defaultPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\BotCord");
            txtInstallPath = new TextBox {
                Location = new Point(35, 100),
                Size = new Size(390, 28),
                Font = new Font("Segoe UI", 10f),
                BackColor = ClrCard,
                ForeColor = ClrTextPrimary,
                BorderStyle = BorderStyle.FixedSingle,
                Text = defaultPath
            };
            txtInstallPath.TextChanged += (s, e) => UpdateFreeSpaceLabel();

            btnBrowse = CreateStyledButton("Tallózás...", 435, 98, 95, 29, false);
            btnBrowse.Click += (s, e) => {
                using (FolderBrowserDialog fbd = new FolderBrowserDialog()) {
                    fbd.Description = "Válaszd ki a BotCord telepítési mappáját:";
                    fbd.SelectedPath = txtInstallPath.Text;
                    if (fbd.ShowDialog() == DialogResult.OK) {
                        txtInstallPath.Text = fbd.SelectedPath;
                    }
                }
            };

            Label lblReqSpace = new Label {
                Location = new Point(35, 150),
                AutoSize = true,
                ForeColor = ClrTextSecondary,
                Text = "Szükséges szabad lemezterület: kb. 15.0 MB"
            };
            lblFreeSpace = new Label {
                Location = new Point(35, 175),
                AutoSize = true,
                ForeColor = Color.FromArgb(87, 242, 135),
                Text = ""
            };
            UpdateFreeSpaceLabel();

            stepPanels[1].Controls.Add(lblDestTitle);
            stepPanels[1].Controls.Add(lblDestPrompt);
            stepPanels[1].Controls.Add(txtInstallPath);
            stepPanels[1].Controls.Add(btnBrowse);
            stepPanels[1].Controls.Add(lblReqSpace);
            stepPanels[1].Controls.Add(lblFreeSpace);

            // ==========================================
            // Step 2: Additional Tasks
            // ==========================================
            stepPanels[2] = new Panel { Dock = DockStyle.Fill, BackColor = ClrBg };
            Label lblTasksTitle = new Label {
                Location = new Point(30, 20),
                AutoSize = true,
                Font = new Font("Segoe UI", 11f, FontStyle.Bold),
                ForeColor = ClrTextPrimary,
                Text = "További beállítások és parancsikonok"
            };
            Label lblTasksPrompt = new Label {
                Location = new Point(32, 50),
                Size = new Size(500, 36),
                ForeColor = ClrTextSecondary,
                Text = "Válaszd ki, milyen parancsikonokat és integrációkat szeretnél létrehozni:"
            };

            chkDesktopShortcut = new CheckBox {
                Location = new Point(38, 100),
                Size = new Size(450, 28),
                Text = "Parancsikon létrehozása az Asztalon (Desktop)",
                Checked = true,
                ForeColor = ClrTextPrimary
            };
            chkStartMenuShortcut = new CheckBox {
                Location = new Point(38, 135),
                Size = new Size(450, 28),
                Text = "Hozzáadás a Windows Start Menühöz",
                Checked = true,
                ForeColor = ClrTextPrimary
            };
            chkRegisterUninstall = new CheckBox {
                Location = new Point(38, 170),
                Size = new Size(450, 28),
                Text = "Regisztráció a Windows Programok telepítése és törlése listába",
                Checked = true,
                ForeColor = ClrTextPrimary
            };

            stepPanels[2].Controls.Add(lblTasksTitle);
            stepPanels[2].Controls.Add(lblTasksPrompt);
            stepPanels[2].Controls.Add(chkDesktopShortcut);
            stepPanels[2].Controls.Add(chkStartMenuShortcut);
            stepPanels[2].Controls.Add(chkRegisterUninstall);

            // ==========================================
            // Step 3: Installing Progress
            // ==========================================
            stepPanels[3] = new Panel { Dock = DockStyle.Fill, BackColor = ClrBg };
            Label lblInstTitle = new Label {
                Location = new Point(30, 30),
                AutoSize = true,
                Font = new Font("Segoe UI", 11f, FontStyle.Bold),
                ForeColor = ClrTextPrimary,
                Text = "Telepítés folyamatban..."
            };
            lblInstallStatus = new Label {
                Location = new Point(32, 70),
                Size = new Size(500, 24),
                ForeColor = ClrTextSecondary,
                Text = "Fájlok előkészítése..."
            };
            progressBar = new ProgressBar {
                Location = new Point(35, 105),
                Size = new Size(495, 24),
                Style = ProgressBarStyle.Continuous
            };

            stepPanels[3].Controls.Add(lblInstTitle);
            stepPanels[3].Controls.Add(lblInstallStatus);
            stepPanels[3].Controls.Add(progressBar);

            // ==========================================
            // Step 4: Finished
            // ==========================================
            stepPanels[4] = new Panel { Dock = DockStyle.Fill, BackColor = ClrBg };
            PictureBox finishIcon = new PictureBox {
                Location = new Point(35, 30),
                Size = new Size(64, 64),
                SizeMode = PictureBoxSizeMode.Zoom
            };
            try {
                using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("botcord.png")) {
                    if (s != null) finishIcon.Image = Image.FromStream(s);
                }
            } catch { }

            Label lblFinTitle = new Label {
                Location = new Point(120, 30),
                Size = new Size(410, 40),
                Font = new Font("Segoe UI", 13f, FontStyle.Bold),
                ForeColor = Color.FromArgb(87, 242, 135),
                Text = "A BotCord telepítése befejeződött!"
            };
            Label lblFinDesc = new Label {
                Location = new Point(120, 80),
                Size = new Size(410, 80),
                ForeColor = ClrTextSecondary,
                Text = "A BotCord sikeresen telepítve lett a megadott mappába.\n" +
                       "Kattints a 'Befejezés' gombra a kilépéshez."
            };
            chkLaunchNow = new CheckBox {
                Location = new Point(120, 165),
                Size = new Size(350, 26),
                Text = "BotCord indítása most",
                Checked = true,
                ForeColor = ClrTextPrimary
            };

            stepPanels[4].Controls.Add(finishIcon);
            stepPanels[4].Controls.Add(lblFinTitle);
            stepPanels[4].Controls.Add(lblFinDesc);
            stepPanels[4].Controls.Add(chkLaunchNow);

            // Add all step panels to contentPanel
            for (int i = 0; i < stepPanels.Length; i++) {
                contentPanel.Controls.Add(stepPanels[i]);
            }
        }

        private void UpdateFreeSpaceLabel() {
            try {
                string path = txtInstallPath.Text;
                string root = Path.GetPathRoot(path);
                if (!string.IsNullOrEmpty(root) && Directory.Exists(root)) {
                    DriveInfo drive = new DriveInfo(root);
                    double freeGb = drive.AvailableFreeSpace / (1024.0 * 1024.0 * 1024.0);
                    lblFreeSpace.Text = string.Format("Elérhető szabad hely a(z) {0} meghajtón: {1:0.0} GB", root, freeGb);
                } else {
                    lblFreeSpace.Text = "";
                }
            } catch {
                lblFreeSpace.Text = "";
            }
        }

        private void ShowStep(int step) {
            currentStep = step;
            for (int i = 0; i < stepPanels.Length; i++) {
                stepPanels[i].Visible = (i == step);
            }

            btnBack.Visible = (step > 0 && step < 3);
            btnBack.Enabled = (step > 0);

            if (step == 0) {
                lblHeaderTitle.Text = "BotCord Telepítő";
                lblHeaderSubtitle.Text = "Üdvözlünk a telepítővarázslóban";
                btnNext.Text = "Tovább >";
                btnNext.Visible = true;
                btnCancel.Visible = true;
            } else if (step == 1) {
                lblHeaderTitle.Text = "Telepítési Mappa";
                lblHeaderSubtitle.Text = "Válaszd ki a célkönyvtárat";
                btnNext.Text = "Tovább >";
                btnNext.Visible = true;
            } else if (step == 2) {
                lblHeaderTitle.Text = "Beállítások";
                lblHeaderSubtitle.Text = "Parancsikonok és integráció";
                btnNext.Text = "Telepítés";
                btnNext.Visible = true;
            } else if (step == 3) {
                lblHeaderTitle.Text = "Telepítés";
                lblHeaderSubtitle.Text = "Fájlok másolása és konfigurálás";
                btnNext.Visible = false;
                btnBack.Visible = false;
                btnCancel.Visible = false;
            } else if (step == 4) {
                lblHeaderTitle.Text = "Befejezve";
                lblHeaderSubtitle.Text = "Sikeres telepítés";
                btnNext.Visible = false;
                btnBack.Visible = false;
                btnCancel.Visible = true;
                btnCancel.Text = "Befejezés";
                btnCancel.BackColor = ClrAccent;
            }
        }

        private void GoNext() {
            if (currentStep == 1) {
                string path = txtInstallPath.Text.Trim();
                if (string.IsNullOrEmpty(path)) {
                    MessageBox.Show("Kérlek adj meg egy érvényes mappát!", "Figyelmeztetés", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                ShowStep(2);
            } else if (currentStep == 2) {
                ShowStep(3);
                StartInstallation();
            } else if (currentStep < 2) {
                ShowStep(currentStep + 1);
            }
        }

        private void GoBack() {
            if (currentStep > 0 && currentStep < 3) {
                ShowStep(currentStep - 1);
            }
        }

        private void StartInstallation() {
            Thread t = new Thread(() => {
                try {
                    string targetDir = txtInstallPath.Text.Trim();

                    UpdateStatus("Mappa létrehozása...", 15);
                    if (!Directory.Exists(targetDir)) {
                        Directory.CreateDirectory(targetDir);
                    }
                    Thread.Sleep(200);

                    // 1. Close any running instances
                    UpdateStatus("Korábbi folyamatok leállítása...", 25);
                    foreach (Process p in Process.GetProcessesByName("BotCord")) {
                        try { p.Kill(); p.WaitForExit(800); } catch { }
                    }

                    // 2. Extract Embedded Files
                    UpdateStatus("BotCord.exe kibontása...", 40);
                    ExtractResource("BotCord.exe", Path.Combine(targetDir, "BotCord.exe"));
                    Thread.Sleep(150);

                    UpdateStatus("Ikonok és médiaelemek kibontása...", 60);
                    ExtractResource("botcord.ico", Path.Combine(targetDir, "botcord.ico"));
                    ExtractResource("botcord.png", Path.Combine(targetDir, "botcord.png"));
                    Thread.Sleep(100);

                    UpdateStatus("Eltávolító (Uninstall.exe) létrehozása...", 75);
                    ExtractResource("Uninstall.exe", Path.Combine(targetDir, "Uninstall.exe"));
                    Thread.Sleep(100);

                    // 3. Create Shortcuts
                    string exePath = Path.Combine(targetDir, "BotCord.exe");
                    string icoPath = Path.Combine(targetDir, "botcord.ico");

                    if (chkDesktopShortcut.Checked) {
                        UpdateStatus("Asztali parancsikon létrehozása...", 85);
                        string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                        CreateShortcut(Path.Combine(desktopPath, "BotCord.lnk"), exePath, targetDir, icoPath);
                    }

                    if (chkStartMenuShortcut.Checked) {
                        UpdateStatus("Start Menü parancsikon létrehozása...", 92);
                        string startMenuPath = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                        CreateShortcut(Path.Combine(startMenuPath, "BotCord.lnk"), exePath, targetDir, icoPath);
                    }

                    // 4. Register in Registry
                    if (chkRegisterUninstall.Checked) {
                        UpdateStatus("Regisztráció a Windows vezérlőpultba...", 98);
                        RegisterUninstallKey(targetDir);
                    }

                    UpdateStatus("Befejezve!", 100);
                    Thread.Sleep(300);

                    this.Invoke((MethodInvoker)(() => ShowStep(4)));
                } catch (Exception ex) {
                    this.Invoke((MethodInvoker)(() => {
                        MessageBox.Show("Hiba a telepítés során:\n" + ex.Message, "Telepítési Hiba", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        ShowStep(1);
                    }));
                }
            });
            t.IsBackground = true;
            t.Start();
        }

        private void UpdateStatus(string message, int progress) {
            if (this.IsDisposed || !this.IsHandleCreated) return;
            this.Invoke((MethodInvoker)(() => {
                lblInstallStatus.Text = message;
                progressBar.Value = Math.Min(100, Math.Max(0, progress));
            }));
        }

        private static void ExtractResource(string resourceName, string outputPath) {
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName)) {
                if (stream == null) {
                    throw new FileNotFoundException("Nem található a beágyazott erőforrás: " + resourceName);
                }
                using (FileStream fs = new FileStream(outputPath, FileMode.Create, FileAccess.Write)) {
                    byte[] buffer = new byte[64 * 1024];
                    int read;
                    while ((read = stream.Read(buffer, 0, buffer.Length)) > 0) {
                        fs.Write(buffer, 0, read);
                    }
                }
            }
        }

        private static void CreateShortcut(string shortcutPath, string targetPath, string workingDir, string iconPath) {
            try {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType == null) return;
                dynamic shell = Activator.CreateInstance(shellType);
                dynamic shortcut = shell.CreateShortcut(shortcutPath);
                shortcut.TargetPath = targetPath;
                shortcut.WorkingDirectory = workingDir;
                shortcut.IconLocation = iconPath + ",0";
                shortcut.Description = "BotCord - Discord Bot Desktop Client";
                shortcut.Save();
            } catch { }
        }

        private static void RegisterUninstallKey(string targetDir) {
            try {
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\BotCord")) {
                    if (key != null) {
                        key.SetValue("DisplayName", "BotCord (Discord Bot Client)");
                        key.SetValue("DisplayVersion", "0.1.0");
                        key.SetValue("Publisher", "BotCord Team");
                        key.SetValue("DisplayIcon", Path.Combine(targetDir, "botcord.ico"));
                        key.SetValue("InstallLocation", targetDir);
                        key.SetValue("UninstallString", "\"" + Path.Combine(targetDir, "Uninstall.exe") + "\"");
                        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                    }
                }
            } catch { }
        }

        private void FinishSetup() {
            if (chkLaunchNow.Checked) {
                try {
                    string exePath = Path.Combine(txtInstallPath.Text.Trim(), "BotCord.exe");
                    if (File.Exists(exePath)) {
                        Process.Start(new ProcessStartInfo {
                            FileName = exePath,
                            WorkingDirectory = txtInstallPath.Text.Trim()
                        });
                    }
                } catch { }
            }
            this.Close();
        }

        [STAThread]
        static void Main() {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupWizardForm());
        }
    }
}
