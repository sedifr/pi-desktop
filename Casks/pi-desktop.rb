cask "pi-desktop" do
  version "0.1.1"
  sha256 "7ca779c234a6ed4d59bda342179ea31cae549e296324d6496de36dd0711675d2"

  url "https://github.com/sedifr/pi-desktop/releases/download/v#{version}/Pi.Desktop-#{version}-arm64.dmg"
  name "Pi Desktop"
  desc "Desktop app for the pi coding agent"
  homepage "https://github.com/sedifr/pi-desktop"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on arch: :arm64
  depends_on macos: :ventura

  app "Pi Desktop.app"

  # pi's own data in ~/.pi/agent is shared with the pi CLI and is left alone.
  zap trash: [
    "~/Library/Application Support/Pi Desktop",
    "~/Library/Preferences/io.github.sedifr.pi-desktop.plist",
    "~/Library/Saved Application State/io.github.sedifr.pi-desktop.savedState",
  ]

  caveats <<~EOS
    Pi Desktop is not signed with an Apple developer certificate, so macOS
    refuses it the first time. Open System Settings → Privacy & Security and
    click Open Anyway, or run:

      xattr -dr com.apple.quarantine "#{appdir}/Pi Desktop.app"
  EOS
end
