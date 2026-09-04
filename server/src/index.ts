import { app } from "./app";
import { env } from "./config/env";
import { getLocalIp } from "./utils/getLocalIp";
import { startScheduler } from "./modules/meta/meta.service";
import { startCompetitorScheduler } from "./modules/marketing/competitor.service";
// v4

app.listen(env.port, "0.0.0.0", () => {
  const ip = getLocalIp();
  console.log("Grafinorte - Sistema de Tarefas rodando!");
  console.log(`  Local: http://localhost:${env.port}`);
  console.log(`  Rede:  http://${ip}:${env.port}   <-- compartilhe este endereço com a equipe`);
  startScheduler();
  startCompetitorScheduler();
});
