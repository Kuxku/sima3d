import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const BASE_URL = process.env.SIMA_FRONTEND_URL || 'http://localhost:5173';
const TIMEOUT_MS = Number(process.env.SIMA_E2E_TIMEOUT_MS || 20000);

function resolveBraveExecutable() {
  const candidates = [
    process.env.BRAVE_PATH,
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    'No se encontró brave.exe. Define la variable de entorno BRAVE_PATH con la ruta a tu navegador Brave.'
  );
}

async function waitForServer(url, retries = 15, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Servidor aún iniciando
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`El servidor no respondió en ${url} después de ${retries} intentos.`);
}

async function run() {
  const bravePath = resolveBraveExecutable();
  console.log(`[E2E] Navegador: ${bravePath} (headless)`);
  console.log(`[E2E] Target: ${BASE_URL}`);

  await waitForServer(BASE_URL);

  const browser = await chromium.launch({
    executablePath: bravePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-gpu-sandbox',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=swiftshader',
    ],
  });

  const results = [];
  const consoleErrors = [];
  const networkFailures = [];

  const record = (id, name, passed, details) => {
    results.push({ id, name, passed, details });
    const icon = passed ? 'PASS' : 'FAIL';
    console.log(`[${icon}] ${id} - ${name}: ${details}`);
  };

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(`pageerror: ${err.message}`);
    });
    page.on('response', (res) => {
      if (res.status() >= 400 && res.url().includes('/api/')) {
        networkFailures.push(`${res.status()} ${res.url()}`);
      }
    });

    // =========================================================================
    // S1 — Carga inicial y KPIs (v1)
    // =========================================================================
    try {
      await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
      await page.waitForSelector('.sima-viewport, .error-box', { state: 'visible', timeout: TIMEOUT_MS });
      const hasErrorBox = (await page.locator('.error-box').count()) > 0;
      if (hasErrorBox) {
        const errText = await page.locator('.error-box').innerText();
        throw new Error(`ErrorBox visible: ${errText.replace(/\s+/g, ' ')}`);
      }
      const canvasBox = await page.locator('canvas').first().boundingBox();
      const topbarText = await page.locator('.hud-topbar').innerText();
      const hasKpis =
        (topbarText.includes('29,014') || topbarText.includes('29.014')) &&
        topbarText.includes('61') &&
        topbarText.includes('380');
      const ok = !hasErrorBox && Boolean(canvasBox && canvasBox.width > 0 && canvasBox.height > 0) && hasKpis;
      record(
        'S1',
        'v1 Carga inicial, Canvas WebGL y KPIs',
        ok,
        `canvas=${canvasBox ? `${Math.round(canvasBox.width)}x${Math.round(canvasBox.height)}` : 'none'}, kpis=${hasKpis}, errorBox=${hasErrorBox}`
      );
    } catch (err) {
      record('S1', 'v1 Carga inicial, Canvas WebGL y KPIs', false, String(err));
    }

    // =========================================================================
    // S2 — Interacción Copilot Chat (v1)
    // =========================================================================
    try {
      const initialBotCount = await page.locator('.chat-bubble.bot:not(.typing)').count();
      await page.locator('.prompt-chip').first().click({ timeout: 8000 });
      await page.waitForFunction(
        (prevCount) => document.querySelectorAll('.chat-bubble.bot:not(.typing)').length > prevCount,
        initialBotCount,
        { timeout: TIMEOUT_MS }
      );
      const lastReply = await page.locator('.chat-bubble.bot:not(.typing)').last().innerText();
      const hasLeak = /traceback|error catastr[oó]fico/i.test(lastReply);
      const ok = lastReply.trim().length > 10 && !hasLeak;
      record(
        'S2',
        'v1 Copilot Chat (prompt rápido)',
        ok,
        `len=${lastReply.trim().length}, leak=${hasLeak}, preview="${lastReply.trim().slice(0, 70)}..."`
      );
    } catch (err) {
      record('S2', 'v1 Copilot Chat (prompt rápido)', false, String(err));
    }

    // =========================================================================
    // S3 — Carga inicial, HUD y Módulos (v2)
    // =========================================================================
    try {
      await page.goto(`${BASE_URL}/v2/`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
      await page.waitForSelector('.v2-master-navbar, .error-box', { state: 'visible', timeout: TIMEOUT_MS });
      if ((await page.locator('.error-box').count()) > 0) {
        const errText = await page.locator('.error-box').innerText();
        throw new Error(`ErrorBox visible: ${errText.replace(/\s+/g, ' ')}`);
      }
      const canvasBox = await page.locator('canvas').first().boundingBox();
      const navbarText = await page.locator('.v2-master-navbar').innerText();
      const hasKpis =
        (navbarText.includes('29,014') || navbarText.includes('29.014')) &&
        navbarText.includes('61') &&
        navbarText.includes('380');

      await page.locator('.gear-trigger').click();
      await page.waitForSelector('.v2-modal-window', { state: 'visible', timeout: 5000 });
      const switchCount = await page.locator('.v2-flag-row').count();
      await page.keyboard.press('Escape');
      await page.waitForSelector('.v2-modal-window', { state: 'detached', timeout: 5000 });

      const ok = Boolean(canvasBox && canvasBox.width > 0 && canvasBox.height > 0) && hasKpis && switchCount >= 5;
      record(
        'S3',
        'v2 Carga inicial, KPIs y Modal Módulos',
        ok,
        `canvas=${canvasBox ? `${Math.round(canvasBox.width)}x${Math.round(canvasBox.height)}` : 'none'}, kpis=${hasKpis}, switches=${switchCount}`
      );
    } catch (err) {
      record('S3', 'v2 Carga inicial, KPIs y Modal Módulos', false, String(err));
    }

    // =========================================================================
    // S4 — Interacción Chat + Banner + Reencuadrar (v2)
    // =========================================================================
    try {
      const initialBotCount = await page.locator('.chat-bubble.bot:not(.typing)').count();
      await page.locator('.quick-prompts .prompt-chip').first().click();
      await page.waitForFunction(
        (prevCount) => document.querySelectorAll('.chat-bubble.bot:not(.typing)').length > prevCount,
        initialBotCount,
        { timeout: TIMEOUT_MS }
      );
      const bannerVisible = await page.locator('.v2-active-petition-banner').isVisible();
      const refitBtn = page.locator('button', { hasText: 'Reencuadrar' });
      if (await refitBtn.isVisible()) {
        await refitBtn.click();
      }
      const lastReply = await page.locator('.chat-bubble.bot:not(.typing)').last().innerText();
      const hasLeak = /traceback|error catastr[oó]fico/i.test(lastReply);
      const ok = lastReply.trim().length > 10 && !hasLeak && bannerVisible;
      record(
        'S4',
        'v2 Chat + Banner activo + Reencuadrar',
        ok,
        `banner=${bannerVisible}, leak=${hasLeak}, replyLen=${lastReply.trim().length}`
      );
    } catch (err) {
      record('S4', 'v2 Chat + Banner activo + Reencuadrar', false, String(err));
    }

    // =========================================================================
    // S5 — Panel de Voz UI Smoke Check (sin micrófono real)
    // =========================================================================
    try {
      await page.locator('.jarvis-floating-trigger').click();
      await page.waitForSelector('.jarvis-panel', { state: 'visible', timeout: 5000 });
      const statusText = await page.locator('.jarvis-status-card .status-text').innerText();
      await page.locator('.jarvis-icon-btn.close').click();
      await page.waitForSelector('.jarvis-panel', { state: 'detached', timeout: 5000 });
      const ok = statusText.includes('Listo para recibir tu consulta');
      record('S5', 'Panel de Voz UI Smoke Check', ok, `status="${statusText}"`);
    } catch (err) {
      record('S5', 'Panel de Voz UI Smoke Check', false, String(err));
    }

    // =========================================================================
    // S6 — Auditoría de Consola y Red
    // =========================================================================
    const okS6 = consoleErrors.length === 0 && networkFailures.length === 0;
    record(
      'S6',
      'Auditoría de Consola y Red (v1 + v2)',
      okS6,
      `consoleErrors=${consoleErrors.length}, apiFailures=${networkFailures.length}`
    );
    if (consoleErrors.length > 0) {
      console.log('  Console errors:', consoleErrors);
    }
    if (networkFailures.length > 0) {
      console.log('  API failures:', networkFailures);
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n[E2E] Resumen: ${results.length - failed.length}/${results.length} escenarios pasaron.`);
  process.exit(failed.length === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('[E2E] Error fatal:', err);
  process.exit(1);
});
