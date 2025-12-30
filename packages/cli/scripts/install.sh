#!/bin/sh
# OCX Installer
# Based on patterns from Bun, OpenCode, Deno, and Homebrew install scripts
#
# Usage:
#   curl -fsSL https://ocx.kdco.dev/install.sh | sh
#
# Environment variables:
#   OCX_VERSION   - Specific version to install (default: latest)
#   OCX_INSTALL   - Installation directory (default: ~/.ocx)
#   CI            - Set to skip interactive prompts

set -e

# Repository configuration
REPO="kdcokenny/ocx"
GITHUB_URL="https://github.com/$REPO"

# ============================================================================
# Color output (TTY-aware)
# Based on: Bun, Dioxus patterns
# ============================================================================

# Check if stdout is a terminal
if [ -t 1 ]; then
    tty_escape() { printf "\033[%sm" "$1"; }
else
    tty_escape() { :; }
fi

tty_mkbold() { tty_escape "1;$1"; }
tty_blue="$(tty_mkbold 34)"
tty_red="$(tty_mkbold 31)"
tty_yellow="$(tty_mkbold 33)"
tty_green="$(tty_mkbold 32)"
tty_bold="$(tty_mkbold 39)"
tty_reset="$(tty_escape 0)"

info() {
    printf "%s==>%s %s\n" "${tty_blue}" "${tty_reset}" "$1"
}

warn() {
    printf "%sWarning%s: %s\n" "${tty_yellow}" "${tty_reset}" "$1" >&2
}

error() {
    printf "%sError%s: %s\n" "${tty_red}" "${tty_reset}" "$1" >&2
    exit 1
}

success() {
    printf "%s==>%s %s\n" "${tty_green}" "${tty_reset}" "$1"
}

# ============================================================================
# Platform detection
# Based on: OpenCode, Bun patterns
# ============================================================================

detect_platform() {
    local os arch

    # Detect OS
    os="$(uname -s)"
    case "$os" in
        Darwin)
            PLATFORM="darwin"
            ;;
        Linux)
            PLATFORM="linux"
            ;;
        MINGW*|MSYS*|CYGWIN*|Windows_NT)
            PLATFORM="windows"
            ;;
        *)
            error "Unsupported operating system: $os"
            ;;
    esac

    # Detect architecture
    arch="$(uname -m)"
    case "$arch" in
        arm64|aarch64)
            ARCH="arm64"
            ;;
        x86_64|amd64)
            ARCH="x64"
            ;;
        *)
            error "Unsupported architecture: $arch"
            ;;
    esac

    # Check for Rosetta 2 on macOS (Apple Silicon running x64 binary)
    # Based on: Bun pattern
    if [ "$PLATFORM" = "darwin" ] && [ "$ARCH" = "x64" ]; then
        if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" = "1" ]; then
            info "Rosetta 2 detected. Installing native arm64 binary for better performance."
            ARCH="arm64"
        fi
    fi

    # Check for baseline CPU (no AVX2) on x64
    # Based on: OpenCode pattern
    BASELINE=""
    if [ "$ARCH" = "x64" ]; then
        if [ "$PLATFORM" = "linux" ]; then
            if ! grep -q avx2 /proc/cpuinfo 2>/dev/null; then
                BASELINE="-baseline"
                info "AVX2 not detected. Using baseline build for compatibility."
            fi
        elif [ "$PLATFORM" = "darwin" ]; then
            if [ "$(sysctl -n hw.optional.avx2_0 2>/dev/null)" != "1" ]; then
                BASELINE="-baseline"
                info "AVX2 not detected. Using baseline build for compatibility."
            fi
        fi
    fi

    # Check for musl/Alpine Linux
    # Based on: Dioxus pattern
    MUSL=""
    if [ "$PLATFORM" = "linux" ]; then
        if [ -f /etc/alpine-release ]; then
            MUSL="-musl"
            info "Alpine Linux detected. Using musl build."
        elif ldd --version 2>&1 | grep -q musl; then
            MUSL="-musl"
            info "musl libc detected. Using musl build."
        fi
    fi
}

# ============================================================================
# Version resolution
# ============================================================================

resolve_version() {
    if [ -n "${OCX_VERSION:-}" ]; then
        VERSION="$OCX_VERSION"
        info "Using specified version: $VERSION"
    else
        info "Fetching latest version..."
        VERSION=$(curl --fail --silent --location \
            "https://api.github.com/repos/$REPO/releases/latest" | \
            grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

        if [ -z "$VERSION" ]; then
            error "Could not determine latest version. Check your internet connection or specify OCX_VERSION."
        fi
        info "Latest version: $VERSION"
    fi
}

# ============================================================================
# SHA256 verification
# Based on: AppFlowy pattern - fallback chain for cross-platform support
# ============================================================================

compute_sha256() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | cut -d' ' -f1
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$1" | cut -d' ' -f1
    elif command -v openssl >/dev/null 2>&1; then
        openssl dgst -sha256 "$1" | awk '{print $NF}'
    else
        warn "No SHA256 tool found. Skipping checksum verification."
        return 1
    fi
}

verify_checksum() {
    local file="$1"
    local expected_url="$2"
    local expected actual

    expected=$(curl --fail --silent --location "$expected_url" 2>/dev/null | cut -d' ' -f1)
    if [ -z "$expected" ]; then
        warn "Could not fetch checksum. Skipping verification."
        return 0
    fi

    actual=$(compute_sha256 "$file") || return 0

    if [ "$expected" != "$actual" ]; then
        error "Checksum verification failed!
Expected: $expected
Actual:   $actual

This could indicate a corrupted download or a security issue.
Please try again or report this at: $GITHUB_URL/issues"
    fi

    info "Checksum verified."
}

# ============================================================================
# Installation
# ============================================================================

install_ocx() {
    local binary_name download_url checksum_url
    local install_dir="$1"

    # Construct binary name
    if [ "$PLATFORM" = "windows" ]; then
        binary_name="ocx-windows-${ARCH}${BASELINE}.exe"
    else
        binary_name="ocx-${PLATFORM}-${ARCH}${BASELINE}${MUSL}"
    fi

    download_url="$GITHUB_URL/releases/download/$VERSION/$binary_name"
    checksum_url="$GITHUB_URL/releases/download/$VERSION/${binary_name}.sha256"

    info "Downloading OCX $VERSION ($binary_name)..."

    # Create temp directory with cleanup trap
    TMP_DIR=$(mktemp -d)
    trap 'rm -rf "$TMP_DIR"' EXIT

    # Download with retry
    # Based on: Bun pattern - use curl's built-in retry
    if ! curl --fail --location --silent --show-error --retry 3 \
        "$download_url" -o "$TMP_DIR/ocx"; then
        error "Failed to download OCX from: $download_url

Please check:
  - Your internet connection
  - The version exists: $GITHUB_URL/releases/tag/$VERSION
  - The binary exists for your platform: $PLATFORM-$ARCH$BASELINE$MUSL"
    fi

    # Verify checksum
    verify_checksum "$TMP_DIR/ocx" "$checksum_url"

    # Make executable and move to install dir
    chmod +x "$TMP_DIR/ocx"
    mkdir -p "$install_dir"

    if ! mv "$TMP_DIR/ocx" "$install_dir/ocx" 2>/dev/null; then
        error "Failed to install to $install_dir. Check permissions."
    fi

    success "OCX $VERSION installed to $install_dir/ocx"
}

# ============================================================================
# PATH configuration hints
# Based on: Zed, SST patterns
# ============================================================================

print_path_instructions() {
    local install_dir="$1"
    local shell_name

    # Check if already in PATH
    case ":$PATH:" in
        *":$install_dir:"*)
            return
            ;;
    esac

    shell_name="$(basename "${SHELL:-/bin/sh}")"

    printf "\n"
    warn "$install_dir is not in your PATH."
    printf "\n"
    info "Add it to your shell configuration:"
    printf "\n"

    case "$shell_name" in
        zsh)
            printf "  # Add to ~/.zshrc:\n"
            printf "  %sexport PATH=\"%s:\$PATH\"%s\n" "${tty_bold}" "$install_dir" "${tty_reset}"
            ;;
        bash)
            printf "  # Add to ~/.bashrc or ~/.bash_profile:\n"
            printf "  %sexport PATH=\"%s:\$PATH\"%s\n" "${tty_bold}" "$install_dir" "${tty_reset}"
            ;;
        fish)
            printf "  # Add to ~/.config/fish/config.fish:\n"
            printf "  %sset -gx PATH %s \$PATH%s\n" "${tty_bold}" "$install_dir" "${tty_reset}"
            ;;
        *)
            printf "  # Add to your shell's config file:\n"
            printf "  %sexport PATH=\"%s:\$PATH\"%s\n" "${tty_bold}" "$install_dir" "${tty_reset}"
            ;;
    esac

    printf "\n"
    info "Then restart your terminal or run:"
    printf "  %ssource ~/%s%s\n" "${tty_bold}" \
        "$(case "$shell_name" in zsh) echo ".zshrc";; bash) echo ".bashrc";; fish) echo ".config/fish/config.fish";; *) echo ".profile";; esac)" \
        "${tty_reset}"
}

# ============================================================================
# Main
# ============================================================================

main() {
    # CI detection
    # Based on: Homebrew pattern
    if [ -n "${CI:-}" ] || [ -n "${GITHUB_ACTIONS:-}" ] || [ -n "${NONINTERACTIVE:-}" ]; then
        info "Running in CI/non-interactive mode."
    fi

    # Detect platform
    detect_platform
    info "Detected platform: $PLATFORM-$ARCH$BASELINE$MUSL"

    # Resolve version
    resolve_version

    # Determine install directory
    # Based on: Bun pattern - user-space by default, override with env var
    if [ -n "${OCX_INSTALL:-}" ]; then
        INSTALL_DIR="$OCX_INSTALL"
    elif [ -w "/usr/local/bin" ]; then
        INSTALL_DIR="/usr/local/bin"
    else
        INSTALL_DIR="$HOME/.local/bin"
    fi

    info "Install directory: $INSTALL_DIR"

    # Install
    install_ocx "$INSTALL_DIR"

    # Print PATH instructions if needed
    print_path_instructions "$INSTALL_DIR"

    # Final instructions
    printf "\n"
    success "Installation complete!"
    printf "\n"
    info "Get started:"
    printf "  %socx --help%s\n" "${tty_bold}" "${tty_reset}"
    printf "\n"
}

main "$@"
