// Shared Playwright helpers for the tools: launching the three engines and
// using a page as an image workbench (crop, compose, sample) without any
// image library.
import { chromium, firefox, webkit } from 'playwright';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export const ENGINES = { chromium, firefox, webkit };

export async function launch(name = 'chromium', { headless = true } = {}) {
  const opts = { headless };
  if (name === 'firefox') {
    // macOS 27 protects ~/Library/Application Support/Firefox; point Firefox at a cache folder instead.
    const home = path.join(os.homedir(), 'Library/Caches/ms-playwright/cf-home');
    fs.mkdirSync(home, { recursive: true });
    opts.env = { ...process.env, CFFIXED_USER_HOME: home };
  }
  if (name === 'chromium') opts.args = ['--enable-gpu', '--ignore-gpu-blocklist'];
  return ENGINES[name].launch(opts);
}

export function dataURL(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

export function writeDataURL(file, url) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
}

// A blank page with helpers for loading images into canvases.
export async function workbench(browser) {
  const page = await browser.newPage();
  await page.setContent('<html><body style="margin:0;background:#111"></body></html>');
  await page.evaluate(() => {
    window.loadImage = (src) => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = src;
    });
  });
  return page;
}
