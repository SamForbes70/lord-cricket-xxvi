import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir:"tests/m7b", timeout:120_000, retries:0, workers:1,
  use:{baseURL:"http://127.0.0.1:4173",headless:true,viewport:{width:1366,height:768}},
  projects:[{name:"chromium",use:{browserName:"chromium"}},{name:"firefox",use:{browserName:"firefox"}}],
  webServer:{command:"npx vite preview --config apps/web/vite.config.ts --host 127.0.0.1 --port 4173 --strictPort",url:"http://127.0.0.1:4173",reuseExistingServer:false},
  reporter:"list",
});
