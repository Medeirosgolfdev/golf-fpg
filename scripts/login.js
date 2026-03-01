const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: false });

  // Contexto "limpo" para guardar cookies/tokens
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("1) Vou abrir o login SSO...");
  await page.goto("https://area.my.fpg.pt/login/", { waitUntil: "domcontentloaded" });

  console.log("2) FAZ LOGIN MANUALMENTE (user/pass + o que for preciso).");
  console.log("3) Depois do login, navega tu para: https://my.fpg.pt/Home/Results.aspx");
  console.log("4) E confirma que consegues abrir: https://scoring.fpg.pt/lists/PlayerWHS.aspx?no=52884");
  console.log("5) Quando estiveres a VER a tabela no scoring, volta aqui e carrega ENTER.");

  process.stdin.once("data", async () => {
    // MUITO importante: garantir que passámos pelos domínios antes de guardar
    await context.storageState({ path: "session.json" });
    console.log("Sessão guardada em session.json");
    await browser.close();
    process.exit(0);
  });
})();
