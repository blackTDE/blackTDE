#!/bin/bash

# Exit immediately if any command exits with a non-zero status
set -e

echo "========================================="
echo "       TDE One-Click Build Script        "
echo "========================================="

# 1. Dependency checks
echo "Checking dependencies..."
for cmd in node npm rustc cargo; do
    if ! command -v $cmd &> /dev/null; then
        echo "Error: $cmd is not installed." >&2
        exit 1
    fi
done
echo "All build dependencies are installed."

# 2. Platform target checks (macOS specific for multi-arch build)
OS_TYPE=$(uname)
if [ "$OS_TYPE" = "Darwin" ]; then
    echo "Running on macOS. Ensuring targets are installed..."
    # Ensure rustup is available to manage targets
    if command -v rustup &> /dev/null; then
        echo "Installing/checking target: aarch64-apple-darwin"
        rustup target add aarch64-apple-darwin
        echo "Installing/checking target: x86_64-apple-darwin"
        rustup target add x86_64-apple-darwin
    else
        echo "Warning: rustup not found. Skipping target installation checks."
    fi
fi

# 3. Clean and recreate build-dist directory
echo "Preparing build-dist/ directory..."
rm -rf build-dist
mkdir -p build-dist/web
mkdir -p build-dist/desktop

# 4. Compile frontend (Vite static app)
echo "Compiling frontend static web application..."
npm run build
cp -R dist/* build-dist/web/
echo "Frontend assets saved to build-dist/web/"

# 5. Compile Tauri desktop applications
echo "Compiling Tauri desktop applications..."
if [ "$OS_TYPE" = "Darwin" ]; then
    # Build for Apple Silicon (aarch64)
    echo "Building for macOS Apple Silicon (aarch64-apple-darwin)..."
    npm run tauri build -- --target aarch64-apple-darwin
    
    # Build for Intel (x86_64)
    echo "Building for macOS Intel (x86_64-apple-darwin)..."
    npm run tauri build -- --target x86_64-apple-darwin
    
    # Build for Universal (universal-apple-darwin)
    echo "Building macOS Universal binary (universal-apple-darwin)..."
    npm run tauri build -- --target universal-apple-darwin
    
    # Copy generated macOS bundles to build-dist/desktop
    echo "Copying macOS build bundles..."
    
    # Copy dmg files
    mkdir -p build-dist/desktop/dmg
    find src-tauri/target/aarch64-apple-darwin/release/bundle/dmg -name "*.dmg" -exec cp {} build-dist/desktop/dmg/ \; 2>/dev/null || true
    find src-tauri/target/x86_64-apple-darwin/release/bundle/dmg -name "*.dmg" -exec cp {} build-dist/desktop/dmg/ \; 2>/dev/null || true
    find src-tauri/target/universal-apple-darwin/release/bundle/dmg -name "*.dmg" -exec cp {} build-dist/desktop/dmg/ \; 2>/dev/null || true
    
    # Copy app directories
    mkdir -p build-dist/desktop/app
    find src-tauri/target/aarch64-apple-darwin/release/bundle/macos -name "*.app" -exec cp -R {} build-dist/desktop/app/ \; 2>/dev/null || true
    find src-tauri/target/x86_64-apple-darwin/release/bundle/macos -name "*.app" -exec cp -R {} build-dist/desktop/app/ \; 2>/dev/null || true
    find src-tauri/target/universal-apple-darwin/release/bundle/macos -name "*.app" -exec cp -R {} build-dist/desktop/app/ \; 2>/dev/null || true
else
    # Fallback to default host build on Windows / Linux
    echo "Building for host OS: $OS_TYPE..."
    npm run tauri build
    
    # Copy bundle installers to build-dist/desktop
    if [ -d "src-tauri/target/release/bundle" ]; then
        cp -R src-tauri/target/release/bundle/* build-dist/desktop/
    fi
fi

# 6. Ensure .gitignore check
if ! grep -q "build-dist/" .gitignore; then
    echo "Adding build-dist/ to .gitignore..."
    echo "build-dist/" >> .gitignore
fi

echo "========================================="
echo "       Build Complete Successfully       "
echo "========================================="
echo "Desktop bundles: build-dist/desktop/"
echo "Web assets: build-dist/web/"
echo ""
echo "Output directories structure:"
ls -R build-dist/
