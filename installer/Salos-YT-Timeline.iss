#define AppName "YT Timeline"
#define AppVersion "1.5.3"
#define AppPublisher "Salos"
#define SalosURL "https://t.me/Salos_plagins_bot"
#define ExtensionId "com.yttimeline.premiere"

[Setup]
AppId={{7B46C638-0D4D-45E4-B2AE-9BFFADFCBD41}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#SalosURL}
AppSupportURL={#SalosURL}
AppUpdatesURL={#SalosURL}
DefaultDirName={userappdata}\Adobe\CEP\extensions\{#ExtensionId}
UsePreviousAppDir=yes
DisableProgramGroupPage=yes
DisableReadyPage=no
DisableFinishedPage=no
PrivilegesRequired=lowest
OutputDir=output
OutputBaseFilename=Salos-YT-Timeline-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=110
SetupLogging=yes
Uninstallable=yes
UninstallDisplayName={#AppName} (Salos)
CreateUninstallRegKey=yes
CloseApplications=no
RestartApplications=no
ChangesAssociations=no
ChangesEnvironment=no
VersionInfoVersion={#AppVersion}.0
VersionInfoCompany={#AppPublisher}
VersionInfoDescription=YT Timeline Adobe Premiere Pro CEP plugin installer
VersionInfoProductName={#AppName}
VersionInfoProductVersion={#AppVersion}
MinVersion=10.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
SetupWindowTitle=%1 — O'rnatish
ButtonBack=< &Orqaga
ButtonNext=&Davom etish >
ButtonInstall=&O'rnatish
ButtonCancel=Bekor qilish
ButtonFinish=&Yakunlash
ButtonBrowse=&Tanlash...
ButtonYes=&Ha
ButtonNo=&Yo'q
ExitSetupTitle=O'rnatishni yopish
ExitSetupMessage=O'rnatish yakunlanmadi. Hozir chiqsangiz, plugin o'rnatilmaydi.%n%nKeyinroq Setup faylini qayta ishga tushirishingiz mumkin.%n%nO'rnatishdan chiqilsinmi?
ClickNext=Davom etish uchun “Davom etish”ni, chiqish uchun “Bekor qilish”ni bosing.
WelcomeLabel1=Salos YT Timeline o'rnatish dasturiga xush kelibsiz
WelcomeLabel2=Ushbu dastur YT Timeline [name/ver] CEP plaginini joriy Windows foydalanuvchisi uchun o'rnatadi.%n%nPremiere Pro'ni yopish tavsiya etiladi.
WizardSelectDir=O'rnatish joyi
SelectDirDesc=YT Timeline qayerga o'rnatilsin?
SelectDirLabel3=Plugin quyidagi papkaga o'rnatiladi. Adobe CEP uchun ko'rsatilgan standart yo'l tavsiya etiladi.
SelectDirBrowseLabel=Davom etish uchun “Davom etish”ni bosing. Boshqa papkani tanlash uchun “Tanlash”ni bosing.
DiskSpaceGBLabel=Kamida [gb] GB bo'sh disk joyi kerak.
DiskSpaceMBLabel=Kamida [mb] MB bo'sh disk joyi kerak.
BrowseDialogTitle=Papka tanlash
BrowseDialogLabel=Ro'yxatdan papkani tanlang va OK tugmasini bosing.
WizardReady=O'rnatishga tayyor
ReadyLabel1=YT Timeline kompyuteringizga o'rnatishga tayyor.
ReadyLabel2a=O'rnatishni boshlash uchun “O'rnatish”ni, sozlamalarni tekshirish uchun “Orqaga”ni bosing.
ReadyLabel2b=O'rnatishni boshlash uchun “O'rnatish”ni bosing.
PreparingDesc=YT Timeline o'rnatishga tayyorlanmoqda.
InstallingLabel=YT Timeline o'rnatilmoqda. Iltimos, kuting.
WizardInstalling=O'rnatilmoqda
FinishedHeadingLabel=YT Timeline muvaffaqiyatli o'rnatildi
FinishedLabelNoIcons=Premiere Pro'ni to'liq yopib qayta oching. So'ng Window > Extensions (Legacy) > YT Timeline orqali panelni oching.
ClickFinish=Setup dasturidan chiqish uchun “Yakunlash”ni bosing.
ConfirmUninstall=YT Timeline pluginini o'chirishni xohlaysizmi? Yuklangan audio va jurnal fayllari saqlanadi.
UninstallStatusLabel=YT Timeline o'chirilmoqda. Iltimos, kuting.
UninstalledAll=YT Timeline muvaffaqiyatli o'chirildi. Yuklangan audio va jurnal fayllari saqlandi.

[Files]
Source: "..\CSXS\*"; DestDir: "{app}\CSXS"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\css\*"; DestDir: "{app}\css"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\js\*"; DestDir: "{app}\js"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\jsx\*"; DestDir: "{app}\jsx"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\index.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\.debug"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "assets\salos-logo.png"; Flags: dontcopy

[Dirs]
Name: "{app}\downloads"; Flags: uninsneveruninstall
Name: "{app}\logs"; Flags: uninsneveruninstall

[Registry]
Root: HKCU; Subkey: "Software\Adobe\CSXS.9"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.10"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.11"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.12"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"

[Code]
var
  SalosPage: TWizardPage;
  SalosLogo: TBitmapImage;
  BrandNameLabel: TNewStaticText;
  TelegramLabel: TNewStaticText;
  PrivacyLabel: TNewStaticText;
  AboutButton: TNewButton;
  SkipButton: TNewButton;

procedure OpenSalosPage(Sender: TObject);
var
  ErrorCode: Integer;
begin
  if not ShellExec('open', '{#SalosURL}', '', '', SW_SHOWNORMAL, ewNoWait, ErrorCode) then
    MsgBox('Telegram sahifasini ochib bo''lmadi. Manzil: @Salos_plagins_bot', mbInformation, MB_OK);
end;

procedure SkipSalosPage(Sender: TObject);
begin
  WizardForm.NextButton.OnClick(WizardForm.NextButton);
end;

procedure InitializeWizard;
var
  LogoPath: String;
begin
  WizardForm.DirBrowseButton.Caption := 'Tanlash...';
  SalosPage := CreateCustomPage(wpWelcome, 'Salos', 'Rasmiy Telegram bot');

  ExtractTemporaryFile('salos-logo.png');
  LogoPath := ExpandConstant('{tmp}\salos-logo.png');

  SalosLogo := TBitmapImage.Create(SalosPage);
  SalosLogo.Parent := SalosPage.Surface;
  SalosLogo.Left := ScaleX(8);
  SalosLogo.Top := ScaleY(10);
  SalosLogo.Width := ScaleX(150);
  SalosLogo.Height := ScaleY(150);
  SalosLogo.Stretch := True;
  SalosLogo.PngImage.LoadFromFile(LogoPath);

  BrandNameLabel := TNewStaticText.Create(SalosPage);
  BrandNameLabel.Parent := SalosPage.Surface;
  BrandNameLabel.Left := ScaleX(182);
  BrandNameLabel.Top := ScaleY(25);
  BrandNameLabel.Width := ScaleX(220);
  BrandNameLabel.Height := ScaleY(42);
  BrandNameLabel.Caption := 'SALOS';
  BrandNameLabel.Font.Name := 'Segoe UI';
  BrandNameLabel.Font.Size := 24;
  BrandNameLabel.Font.Style := [fsBold];
  BrandNameLabel.Font.Color := $00E75616;

  TelegramLabel := TNewStaticText.Create(SalosPage);
  TelegramLabel.Parent := SalosPage.Surface;
  TelegramLabel.Left := BrandNameLabel.Left;
  TelegramLabel.Top := ScaleY(75);
  TelegramLabel.Width := ScaleX(220);
  TelegramLabel.Height := ScaleY(22);
  TelegramLabel.Caption := '@Salos_plagins_bot';
  TelegramLabel.Font.Name := 'Segoe UI';
  TelegramLabel.Font.Size := 10;
  TelegramLabel.Font.Color := $00606060;

  AboutButton := TNewButton.Create(SalosPage);
  AboutButton.Parent := SalosPage.Surface;
  AboutButton.Left := BrandNameLabel.Left;
  AboutButton.Top := ScaleY(112);
  AboutButton.Width := ScaleX(105);
  AboutButton.Height := ScaleY(28);
  AboutButton.Caption := 'Salos haqida';
  AboutButton.OnClick := @OpenSalosPage;

  SkipButton := TNewButton.Create(SalosPage);
  SkipButton.Parent := SalosPage.Surface;
  SkipButton.Left := AboutButton.Left + AboutButton.Width + ScaleX(8);
  SkipButton.Top := AboutButton.Top;
  SkipButton.Width := ScaleX(105);
  SkipButton.Height := AboutButton.Height;
  SkipButton.Caption := 'O''tkazib yuborish';
  SkipButton.OnClick := @SkipSalosPage;

  PrivacyLabel := TNewStaticText.Create(SalosPage);
  PrivacyLabel.Parent := SalosPage.Surface;
  PrivacyLabel.Left := ScaleX(8);
  PrivacyLabel.Top := ScaleY(177);
  PrivacyLabel.Width := SalosPage.SurfaceWidth - ScaleX(16);
  PrivacyLabel.Height := ScaleY(34);
  PrivacyLabel.AutoSize := False;
  PrivacyLabel.WordWrap := True;
  PrivacyLabel.Caption := 'Reklama ixtiyoriy. Hech qanday qo''shimcha dastur yoki tracking o''rnatilmaydi.';
  PrivacyLabel.Font.Name := 'Segoe UI';
  PrivacyLabel.Font.Size := 8;
  PrivacyLabel.Font.Color := $00707070;
end;

procedure CancelButtonClick(CurPageID: Integer; var Cancel, Confirm: Boolean);
begin
  Confirm := False;
end;
