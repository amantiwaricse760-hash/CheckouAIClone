/**
 * Screen Capture & Visual Question Extraction Service
 * Captures screen on Linux X11/Wayland/Mac/Windows with zero HUD obstruction
 */

const { desktopCapturer, screen, nativeImage } = require('electron');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ScreenCaptureService {
  /**
   * Captures the full screen while momentarily hiding the HUD so it never blocks the question
   */
  async captureFullScreen(mainWindow) {
    let wasVisible = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      wasVisible = mainWindow.isVisible();
      if (wasVisible) {
        mainWindow.hide();
        // Wait 70ms for X11 / window manager compositor to paint background
        await new Promise(r => setTimeout(r, 70));
      }
    }

    let buffer = null;

    // Fast-path on Linux: gnome-screenshot (instant 0-latency grab)
    try {
      const tmpPath = '/tmp/copilot_screen_snap.png';
      execSync(`gnome-screenshot -f ${tmpPath}`, { stdio: 'ignore' });
      if (fs.existsSync(tmpPath)) {
        buffer = fs.readFileSync(tmpPath);
        try { fs.unlinkSync(tmpPath); } catch (e) {}
      }
    } catch (e) {
      // Fallback
    }

    // Cross-platform Electron fallback
    if (!buffer) {
      try {
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.size;
        const scale = primaryDisplay.scaleFactor || 1;
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: Math.round(width * scale), height: Math.round(height * scale) }
        });

        if (sources && sources.length > 0) {
          buffer = sources[0].thumbnail.toPNG();
        }
      } catch (err) {
        console.error('[ScreenCapture] Error:', err);
      }
    }

    // Restore HUD
    if (mainWindow && !mainWindow.isDestroyed() && wasVisible) {
      mainWindow.show();
    }

    if (!buffer) {
      throw new Error('Failed to capture screen image.');
    }

    return buffer.toString('base64');
  }

  /**
   * Crops a screenshot buffer to the user-selected bounding box
   */
  cropImage(base64Buffer, bounds) {
    try {
      const buf = Buffer.from(base64Buffer, 'base64');
      const img = nativeImage.createFromBuffer(buf);
      const cropped = img.crop({
        x: Math.max(0, Math.round(bounds.x)),
        y: Math.max(0, Math.round(bounds.y)),
        width: Math.max(10, Math.round(bounds.width)),
        height: Math.max(10, Math.round(bounds.height))
      });
      return cropped.toPNG().toString('base64');
    } catch (e) {
      console.error('[ScreenCapture crop error]:', e);
      return base64Buffer;
    }
  }
}

module.exports = ScreenCaptureService;
