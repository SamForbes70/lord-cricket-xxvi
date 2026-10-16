/** Host capability probe using an already installed Chromium executable.
 * Does not modify the accepted cross-browser acceptance config.
 * Firefox acceptance remains pending when Playwright Firefox is unavailable.
 */
import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'tests', testMatch:['m6g/**/*.spec.ts','m7b/**/*.spec.ts'],
 timeout:120000, retries:0, workers:1,
 use:{baseURL:'http://127.0.0.1:4173',headless:true,viewport:{width:1366,height:768}},
 projects:[{name:'system-chromium',use:{browserName:'chromium',launchOptions:{executablePath:'/usr/bin/chromium',args:['--no-sandbox']}}}],
 webServer:{command:'npx vite preview --config apps/web/vite.config.ts --host 127.0.0.1 --port 4173 --strictPort',url:'http://127.0.0.1:4173',reuseExistingServer:false},
 reporter:'list',
});
