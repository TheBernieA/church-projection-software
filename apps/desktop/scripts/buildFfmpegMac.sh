#!/usr/bin/env bash
# Builds the ffmpeg that Mac installers ship: one that streams securely (RTMPS through mbedTLS),
# encodes on the GPU (VideoToolbox, AudioToolbox) and still has libx264 as the fallback.
#
#   bash apps/desktop/scripts/buildFfmpegMac.sh [arm64|x64|all]      (default: all)
#
# Why not the ffmpeg-static download: its Mac builds have no OpenSSL or similar, so ffmpeg falls
# back on Apple's SecureTransport, whose RTMPS uploads stall after a few frames (YouTube's secure
# address, and Facebook, which is secure only).
#
# Needs Xcode's command-line tools, and `brew install nasm pkgconf`. Both Mac kinds build on
# either kind of Mac (the other one is cross-compiled). Takes a few minutes per arch; sources are
# downloaded once, checked against pinned SHA-256s, and cached in resources/ffmpeg/.build/.
#
# Output: resources/ffmpeg/mac-<arch>/{ffmpeg, LICENSE.txt, SOURCES.txt}, which
# scripts/prepareFfmpeg.mjs keeps and electron-builder packages. GPL v3 (libx264 is GPL;
# mbedTLS is Apache 2.0, which needs v3): SOURCES.txt says where every source comes from.
set -euo pipefail

FFMPEG_VERSION=9.0.2
FFMPEG_SHA=8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e
MBEDTLS_VERSION=3.6.8 # the long-term-support line, built with plain make
MBEDTLS_SHA=bc54b818e87f49c0b3281dd85d24adaede0e63b4e822e3fbd49c005a38b9595b
X264_COMMIT=b35605ace3ddf7c1a5d67a2eb553f034aef41d55 # the "stable" branch
X264_SHA=6eeb82934e69fd51e043bd8c5b0d152839638d1ce7aa4eea65a3fedcf83ff224
MACOS_MIN=12.0 # Electron's own minimum

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
CACHE="$ROOT/resources/ffmpeg/.build"
JOBS="$(sysctl -n hw.ncpu)"

die() { echo "✖ $*" >&2; exit 1; }
[ "$(uname)" = Darwin ] || die "this builds the Mac ffmpeg: run it on a Mac"
for tool in clang make nasm pkg-config curl shasum; do
  command -v "$tool" >/dev/null || die "$tool is missing (xcode-select --install; brew install nasm pkgconf)"
done

fetch() { # url file sha
  local file="$CACHE/src/$2"
  if [ ! -f "$file" ]; then
    echo "→ downloading $2"
    curl -fsSL --retry 3 -o "$file.part" "$1" && mv "$file.part" "$file"
  fi
  echo "$3  $file" | shasum -a 256 -c --status || { rm -f "$file"; die "$2: checksum mismatch (deleted; run again)"; }
}

mkdir -p "$CACHE/src"
fetch "https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz" "ffmpeg-$FFMPEG_VERSION.tar.xz" "$FFMPEG_SHA"
fetch "https://github.com/Mbed-TLS/mbedtls/releases/download/mbedtls-$MBEDTLS_VERSION/mbedtls-$MBEDTLS_VERSION.tar.bz2" \
  "mbedtls-$MBEDTLS_VERSION.tar.bz2" "$MBEDTLS_SHA"
fetch "https://code.videolan.org/videolan/x264/-/archive/$X264_COMMIT/x264-$X264_COMMIT.tar.bz2" \
  "x264-$X264_COMMIT.tar.bz2" "$X264_SHA"

build() { # arm64 | x64
  local arch=$1 carch host
  case "$arch" in
    arm64) carch=arm64; host=aarch64-apple-darwin ;;
    x64) carch=x86_64; host=x86_64-apple-darwin ;;
    *) die "unknown arch $arch (arm64 or x64)" ;;
  esac
  local work="$CACHE/$arch" prefix="$CACHE/$arch/prefix"
  local flags="-arch $carch -mmacosx-version-min=$MACOS_MIN -O2"
  local cross=""
  [ "$(uname -m)" = "$carch" ] || cross=--enable-cross-compile
  rm -rf "$work" && mkdir -p "$work" "$prefix/lib" "$prefix/include"
  echo "━━ ffmpeg $FFMPEG_VERSION for mac-$arch"

  echo "→ mbedTLS $MBEDTLS_VERSION"
  tar -xf "$CACHE/src/mbedtls-$MBEDTLS_VERSION.tar.bz2" -C "$work"
  make -s -C "$work/mbedtls-$MBEDTLS_VERSION/library" -j"$JOBS" \
    CC=clang AR=ar CFLAGS="$flags" static >"$work/mbedtls.log" 2>&1 || { tail -30 "$work/mbedtls.log"; die "mbedTLS build failed"; }
  cp "$work/mbedtls-$MBEDTLS_VERSION"/library/lib{mbedtls,mbedx509,mbedcrypto}.a "$prefix/lib/"
  cp -R "$work/mbedtls-$MBEDTLS_VERSION"/include/{mbedtls,psa} "$prefix/include/"

  echo "→ x264"
  tar -xf "$CACHE/src/x264-$X264_COMMIT.tar.bz2" -C "$work"
  (cd "$work/x264-$X264_COMMIT" &&
    ./configure --host="$host" --prefix="$prefix" --enable-static --enable-pic --disable-cli \
      --extra-cflags="$flags" --extra-asflags="$([ $carch = arm64 ] && echo "$flags")" \
      --extra-ldflags="-arch $carch -mmacosx-version-min=$MACOS_MIN" &&
    make -j"$JOBS" && make install) >"$work/x264.log" 2>&1 || { tail -30 "$work/x264.log"; die "x264 build failed"; }

  echo "→ ffmpeg (a few minutes)"
  tar -xf "$CACHE/src/ffmpeg-$FFMPEG_VERSION.tar.xz" -C "$work"
  # Only what's asked for is found (--disable-autodetect, and pkg-config looks in the prefix
  # only), so nothing from Homebrew is linked in and the binary runs on any Mac.
  (cd "$work/ffmpeg-$FFMPEG_VERSION" &&
    PKG_CONFIG_LIBDIR="$prefix/lib/pkgconfig" PKG_CONFIG_PATH= ./configure \
      $cross --arch="$carch" --target-os=darwin --cc=clang \
      --extra-cflags="$flags -I$prefix/include" \
      --extra-ldflags="-arch $carch -mmacosx-version-min=$MACOS_MIN -L$prefix/lib" \
      --pkg-config-flags=--static --enable-static --disable-shared \
      --disable-autodetect --disable-debug --disable-doc --disable-ffplay --disable-ffprobe \
      --enable-gpl --enable-version3 \
      --enable-libx264 --enable-mbedtls \
      --enable-videotoolbox --enable-audiotoolbox --enable-zlib &&
    make -j"$JOBS") >"$work/ffmpeg.log" 2>&1 || { tail -40 "$work/ffmpeg.log"; die "ffmpeg build failed"; }

  local out="$ROOT/resources/ffmpeg/mac-$arch"
  mkdir -p "$out"
  cp "$work/ffmpeg-$FFMPEG_VERSION/ffmpeg" "$out/ffmpeg"
  strip -x "$out/ffmpeg"
  chmod 755 "$out/ffmpeg"
  cp "$work/ffmpeg-$FFMPEG_VERSION/COPYING.GPLv3" "$out/LICENSE.txt"
  cat >"$out/SOURCES.txt" <<EOF
This ffmpeg was built by Lampstand (apps/desktop/scripts/buildFfmpegMac.sh) from these
unmodified sources, and is licensed under the GNU GPL version 3 (see LICENSE.txt).

ffmpeg $FFMPEG_VERSION   https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz
  sha256 $FFMPEG_SHA
mbedTLS $MBEDTLS_VERSION (Apache 2.0)
  https://github.com/Mbed-TLS/mbedtls/releases/download/mbedtls-$MBEDTLS_VERSION/mbedtls-$MBEDTLS_VERSION.tar.bz2
  sha256 $MBEDTLS_SHA
x264 $X264_COMMIT (GPL v2 or later)
  https://code.videolan.org/videolan/x264/-/archive/$X264_COMMIT/x264-$X264_COMMIT.tar.bz2
  sha256 $X264_SHA

Configured for macOS $MACOS_MIN+ ($carch) with:
  --enable-gpl --enable-version3 --enable-libx264 --enable-mbedtls
  --enable-videotoolbox --enable-audiotoolbox --enable-zlib --disable-autodetect
EOF
  echo "✔ resources/ffmpeg/mac-$arch/ffmpeg ($(du -h "$out/ffmpeg" | cut -f1 | tr -d ' '))"
}

case "${1:-all}" in
  all) build arm64; build x64 ;;
  arm64 | x64) build "$1" ;;
  *) die "usage: buildFfmpegMac.sh [arm64|x64|all]" ;;
esac
