/**
 * 🔍 Verificador Automático de Dependências (TravelMundo API v1.1)
 * ----------------------------------------------------------------
 * Varre o index.js e detecta pacotes importados que não estão no package.json.
 * Ignora automaticamente módulos nativos do Node.js.
 *
 * Uso:
 *   node verify-deps.js
 */

import fs from "fs";
import path from "path";
import chalk from "chalk";

// 🧩 Caminhos principais
const indexPath = path.resolve("index.js");
const packagePath = path.resolve("package.json");

// ✅ Lê os arquivos
const indexContent = fs.readFileSync(indexPath, "utf8");
const packageContent = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const declaredDeps = {
  ...packageContent.dependencies,
  ...packageContent.devDependencies,
};

// 🚫 Módulos nativos do Node.js que devem ser ignorados
const nodeCoreModules = new Set([
  "fs", "path", "os", "http", "https", "url", "crypto", "stream", "util",
  "zlib", "readline", "buffer", "events", "timers", "net", "querystring",
  "dns", "child_process", "assert", "tty", "v8", "vm", "perf_hooks",
  "module", "worker_threads", "diagnostics_channel"
]);

// 🧠 Expressões RegEx para detectar imports
const importRegex = /from\s+['"]([^'"]+)['"]/g;
const requireRegex = /require\(['"]([^'"]+)['"]\)/g;

// 📦 Lista de pacotes detectados
const found = new Set();

let match;
while ((match = importRegex.exec(indexContent))) {
  const pkg = match[1];
  if (!pkg.startsWith(".") && !pkg.startsWith("/")) found.add(pkg.split("/")[0]);
}
while ((match = requireRegex.exec(indexContent))) {
  const pkg = match[1];
  if (!pkg.startsWith(".") && !pkg.startsWith("/")) found.add(pkg.split("/")[0]);
}

console.log(chalk.cyanBright("\n🔍 Verificando dependências do TravelMundo API...\n"));
let missing = [];

found.forEach((pkg) => {
  if (nodeCoreModules.has(pkg)) {
    console.log(chalk.gray(`🧠 (Nativo do Node.js) ${pkg}`));
    return;
  }
  if (!declaredDeps[pkg]) {
    console.log(chalk.yellow(`⚠️  Pacote ausente no package.json: ${pkg}`));
    missing.push(pkg);
  } else {
    console.log(chalk.green(`✅ ${pkg} OK`));
  }
});

if (missing.length === 0) {
  console.log(chalk.greenBright("\n✨ Tudo certo! Todas as dependências estão listadas.\n"));
} else {
  console.log(chalk.redBright("\n🚨 Dependências ausentes detectadas:"));
  console.log(missing.map((m) => `   → npm install ${m}`).join("\n"));
  console.log(chalk.yellow("\n💡 Execute os comandos acima para corrigir e depois rode novamente:\n"));
  console.log(chalk.cyan("   node verify-deps.js\n"));
}
