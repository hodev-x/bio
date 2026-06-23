import { buildApp } from "./app.js";

const port = Number(process.env.AWS_LWA_PORT ?? process.env.PORT ?? 8080);
const app = buildApp();
app
  .listen({ port, host: "0.0.0.0" })
  .then(() => console.log(`api (lambda) listening on :${port}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
