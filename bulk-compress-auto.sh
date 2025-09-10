#!/usr/bin/env bash
set -euo pipefail

# ========================
# CẤU HÌNH
# ========================
: "${OXI_VERSION:=9.1.5}"     # version oxipng muốn tải
PNG_QUALITY="65-85"
JPEG_QUALITY="85"
JS_MIN_OPTS="-c -m"

# ========================
# TIỆN ÍCH CHUNG
# ========================
log()   { printf "\033[1;34m[INFO]\033[0m %s\n" "$*"; }
warn()  { printf "\033[1;33m[WARN]\033[0m %s\n" "$*"; }
error() { printf "\033[1;31m[ERR ]\033[0m %s\n" "$*" >&2; }
exists(){ command -v "$1" >/dev/null 2>&1; }

SUDO="sudo"
if [ "${EUID:-$(id -u)}" -eq 0 ]; then SUDO=""; fi

APT_UPDATED=0
apt_install() {
  local pkg="$1"
  if ! dpkg -s "$pkg" >/dev/null 2>&1; then
    if [ "$APT_UPDATED" -eq 0 ]; then
      $SUDO apt-get update -y
      APT_UPDATED=1
    fi
    log "Cài apt: $pkg"
    $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y "$pkg"
  fi
}

npm_global_install() {
  local pkg="$1"
  if ! npm list -g "$pkg" >/dev/null 2>&1; then
    log "Cài npm -g: $pkg"
    $SUDO npm install -g "$pkg"
  fi
}

download() {
  local url="$1" out="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -L --fail --silent --show-error "$url" -o "$out"
  else
    apt_install wget
    wget -q "$url" -O "$out"
  fi
}

detect_arch() {
  case "$(uname -m)" in
    x86_64) echo "x86_64-unknown-linux-gnu" ;;
    aarch64|arm64) echo "aarch64-unknown-linux-gnu" ;;
    *) echo "unknown" ;;
  esac
}

# ========================
# CÀI ĐẶT CÔNG CỤ
# ========================
install_base_tools() {
  apt_install ca-certificates
  apt_install tar
  apt_install xz-utils || true
  apt_install coreutils
  apt_install findutils
  apt_install grep
  apt_install sed
}

install_image_tools() {
  apt_install pngquant
  apt_install jpegoptim
}

install_fonts_tools() {
  apt_install woff2
}

install_node_tools() {
  apt_install nodejs || true
  apt_install npm     || true
  if ! exists npm; then
    error "Thiếu npm; hãy cài Node.js/NPM (https://nodejs.org/) rồi chạy lại."
    exit 1
  fi
  npm_global_install svgo
  npm_global_install terser
  npm_global_install csso
  npm_global_install clean-css-cli
}

install_oxipng_binary() {
  if exists oxipng; then
    log "Đã có oxipng: $(oxipng --version 2>/dev/null || true)"
    return 0
  fi

  local arch asset url tmpdir tgz
  arch="$(detect_arch)"
  if [ "$arch" = "unknown" ]; then
    warn "Không nhận diện được kiến trúc CPU; bỏ qua oxipng."
    return 0
  fi

  asset="oxipng-${OXI_VERSION}-${arch}.tar.gz"
  url="https://github.com/shssoichiro/oxipng/releases/download/v${OXI_VERSION}/${asset}"

  tmpdir="$(mktemp -d)"
  tgz="${tmpdir}/${asset}"
  log "Tải oxipng ${OXI_VERSION} cho ${arch}"
  if ! download "$url" "$tgz"; then
    warn "Không tải được oxipng từ ${url}. Bỏ qua oxipng."
    rm -rf "$tmpdir"
    return 0
  fi

  tar -xzf "$tgz" -C "$tmpdir"
  local binpath
  binpath="$(find "$tmpdir" -type f -name oxipng | head -n1 || true)"
  if [ -z "${binpath}" ]; then
    warn "Không thấy file oxipng trong gói. Bỏ qua oxipng."
    rm -rf "$tmpdir"
    return 0
  fi

  $SUDO mv "$binpath" /usr/local/bin/oxipng
  $SUDO chmod +x /usr/local/bin/oxipng
  rm -rf "$tmpdir"
  log "Đã cài oxipng: $(oxipng --version 2>/dev/null || echo 'OK')"
}

# ========================
# XỬ LÝ TẬP TIN
# ========================
compress_png() {
  find . -type f -iname "*.png" -print0 | while IFS= read -r -d '' f; do
    log "PNG: $f"
    pngquant --quality="$PNG_QUALITY" --speed 1 --force --output "$f" -- "$f" || warn "pngquant lỗi: $f"
    if exists oxipng; then
      oxipng -o 4 --strip safe --quiet "$f" || warn "oxipng lỗi: $f"
    fi
  done
}

compress_jpeg() {
  find . -type f \( -iname "*.jpg" -o -iname "*.jpeg" \) -print0 | while IFS= read -r -d '' f; do
    log "JPG: $f"
    jpegoptim --max="$JPEG_QUALITY" --strip-all --all-progressive --quiet -- "$f" || warn "jpegoptim lỗi: $f"
  done
}

# --- FIX SVGO v3: dùng file cấu hình tạm thay vì JSON inline ---
compress_svg() {
  if ! exists svgo; then
    warn "svgo không có, bỏ qua SVG."
    return
  fi

  # Tạo file config tạm cho SVGO (v2/v3 đều chấp nhận đường dẫn config)
  local svgo_cfg
  svgo_cfg="$(mktemp -t svgo.config.XXXXXX.json)"
  cat >"$svgo_cfg" <<'JSON'
{
  "multipass": true,
  "plugins": [
    {
      "name": "preset-default",
      "params": {
        "overrides": {
          "removeViewBox": false
        }
      }
    }
  ]
}
JSON

  find . -type f -iname "*.svg" -print0 | while IFS= read -r -d '' f; do
    log "SVG: $f"
    # SVGO v3 yêu cầu --config <path>; v2 cũng hỗ trợ
    if ! svgo --config="$svgo_cfg" --quiet --input "$f" --output "$f" 2>/dev/null; then
      warn "svgo lỗi: $f"
    fi
  done

  rm -f "$svgo_cfg"
}

compress_fonts() {
  if ! exists woff2_compress; then
    warn "woff2_compress không có; bỏ qua font."
    return
  fi
  find . -type f \( -iname "*.ttf" -o -iname "*.otf" \) -print0 | while IFS= read -r -d '' f; do
    local out="${f%.*}.woff2"
    if [[ ! -f "$out" || "$f" -nt "$out" ]]; then
      log "FONT→WOFF2: $f -> $out"
      woff2_compress "$f" || warn "woff2_compress lỗi: $f"
    else
      log "FONT: Bỏ qua (đã có WOFF2 mới hơn): $f"
    fi
  done
}

minify_js() {
  if ! exists terser; then
    warn "terser không có; bỏ qua JS."
    return
  fi
  find . -type f -iname "*.js" ! -iname "*.min.js" -print0 | while IFS= read -r -d '' f; do
    local out="${f%.js}.min.js"
    if [[ ! -f "$out" || "$f" -nt "$out" ]]; then
      log "JS MIN: $f -> $out"
      terser "$f" $JS_MIN_OPTS -o "$out" || warn "terser lỗi: $f"
    else
      log "JS: Bỏ qua (đã min mới hơn): $f"
    fi
  done
}

minify_css() {
  local css_cmd=""
  if exists csso; then css_cmd="csso"; elif exists cleancss; then css_cmd="cleancss"; else
    warn "Không có csso/clean-css; bỏ qua CSS."
    return
  fi

  find . -type f -iname "*.css" ! -iname "*.min.css" -print0 | while IFS= read -r -d '' f; do
    local out="${f%.css}.min.css"
    if [[ ! -f "$out" || "$f" -nt "$out" ]]; then
      log "CSS MIN: $f -> $out"
      if [[ "$css_cmd" == "csso" ]]; then
        csso "$f" --output "$out" || warn "csso lỗi: $f"
      else
        cleancss "$f" -o "$out" || warn "clean-css lỗi: $f"
      fi
    else
      log "CSS: Bỏ qua (đã min mới hơn): $f"
    fi
  done
}

# ========================
# MAIN
# ========================
main() {
  log "== Chuẩn bị môi trường =="
  install_base_tools
  install_image_tools
  install_fonts_tools
  install_node_tools
  install_oxipng_binary

  log "== Bắt đầu nén (thư mục: $(pwd)) =="
  compress_png
  compress_jpeg
  compress_svg
  compress_fonts
  minify_js
  minify_css
  log "== Hoàn tất =="
}

main "$@"
