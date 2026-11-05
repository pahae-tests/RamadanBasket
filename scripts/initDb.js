const { loadEnv } = require("../lib/loadEnv");
loadEnv();
const { applySchema } = require("../lib/schema");
const { closePool } = require("../lib/db");

applySchema()
  .then((count) => {
    console.log(`Schéma appliqué (${count} instructions).`);
    return closePool();
  })
  .catch((error) => {
    console.error("Échec de l'initialisation :", error.message);
    process.exit(1);
  });
