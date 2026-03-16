import { existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createInterface } from "node:readline";

// ── Colors ──────────────────────────────────────────
const isColorSupported =
  process.stdout.isTTY && process.env.NO_COLOR === undefined;

const c = {
  red: (s: string) => (isColorSupported ? `\x1b[31m${s}\x1b[0m` : s),
  green: (s: string) => (isColorSupported ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (isColorSupported ? `\x1b[33m${s}\x1b[0m` : s),
  blue: (s: string) => (isColorSupported ? `\x1b[34m${s}\x1b[0m` : s),
};

const info = (msg: string) => console.log(`${c.blue("[INFO]")} ${msg}`);
const success = (msg: string) => console.log(`${c.green("[OK]")} ${msg}`);
const warn = (msg: string) => console.log(`${c.yellow("[WARN]")} ${msg}`);
const error = (msg: string) => console.log(`${c.red("[ERROR]")} ${msg}`);

// ── Helpers ─────────────────────────────────────────
const PROJECT_ROOT = resolve(import.meta.dirname, "..");

function run(
  cmd: string[],
  options?: { cwd?: string; silent?: boolean }
): { success: boolean; stdout: string } {
  const proc = Bun.spawnSync(cmd, {
    cwd: options?.cwd ?? PROJECT_ROOT,
    stdout: options?.silent ? "pipe" : "inherit",
    stderr: options?.silent ? "pipe" : "inherit",
  });
  return {
    success: proc.exitCode === 0,
    stdout: proc.stdout?.toString().trim() ?? "",
  };
}

function commandExists(cmd: string): boolean {
  const isWindows = process.platform === "win32";
  const check = isWindows ? ["where", cmd] : ["which", cmd];
  return run(check, { silent: true }).success;
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeEnvIfMissing(filePath: string, content: string, label: string) {
  if (!existsSync(filePath)) {
    Bun.write(filePath, content);
    success(`${label} criado`);
  } else {
    success(`${label} ja existe`);
  }
}

// ── ENV file contents ───────────────────────────────
const ENV_ROOT = `# Configuracoes do Banco de Dados PostgreSQL
POSTGRES_USER=user
POSTGRES_PASSWORD=mysecretpassword
POSTGRES_DB=smartdocs
POSTGRES_PORT=5432

# URLs de Conexao para os servicos (usado pelos apps)
DATABASE_URL=postgresql://user:mysecretpassword@localhost:5432/smartdocs
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# Configuracoes extras
OLLAMA_API_URL=http://host.docker.internal:11434
ANALYTICS_MODEL=llama3
TRANSCRIPTION_MODEL=tiny
`;

const ENV_API = `# --- App Configuration ---
NODE_ENV="dev"
PORT="8080"
CLIENT_URL="http://localhost:3000"

# --- Database & Queue ---
DATABASE_URL="postgresql://user:mysecretpassword@localhost:5432/smartdocs"
RABBITMQ_URL="amqp://guest:guest@localhost:5672"

# --- AI Configuration ---
AI_PROVIDER="ollama"
GEMINI_API_KEY=""
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""
OPENROUTER_API_KEY=""
AI_MODEL=""

# --- Services ---
OLLAMA_API_URL="http://localhost:11434"

# --- Workers Configuration ---
TRANSCRIPTION_MODEL="tiny"
TRANSCRIPTION_LANGUAGE="pt"
ANALYTICS_MODEL="llama3"

# --- Gatekeeper Worker ---
GATEKEEPER_TRANSCRIPTION_MODEL="tiny"
GATEKEEPER_ANALYTICS_MODEL="phi3:mini"
MAX_RETRIES="3"
SAMPLE_DURATION="30"
`;

const ENV_WEB = `NEXT_PUBLIC_API_URL=http://localhost:8080
`;

// ── Main ────────────────────────────────────────────
async function main() {
  console.log();
  console.log(c.blue("========================================"));
  console.log(c.blue("   SmartDocs - Setup Inicial"));
  console.log(c.blue("========================================"));
  console.log();

  // 1. Verificar pre-requisitos
  info("Verificando pre-requisitos...");

  const missing: string[] = [];

  if (!commandExists("docker")) {
    missing.push("docker (https://docs.docker.com/get-docker/)");
  }

  if (!commandExists("ffmpeg")) {
    const hint =
      process.platform === "win32"
        ? "https://ffmpeg.org/download.html"
        : "brew install ffmpeg";
    missing.push(`ffmpeg (${hint})`);
  }

  if (missing.length > 0) {
    error("Os seguintes pre-requisitos nao foram encontrados:");
    for (const dep of missing) {
      console.log(`  ${c.red("x")} ${dep}`);
    }
    console.log();
    error("Instale os pre-requisitos acima e execute o script novamente.");
    process.exit(1);
  }

  success(`bun ${Bun.version}`);

  const dockerVersion = run(["docker", "--version"], { silent: true });
  const versionStr = dockerVersion.stdout
    .replace("Docker version ", "")
    .replace(/,.*/, "");
  success(`docker ${versionStr}`);
  success("ffmpeg encontrado");

  const hasOllama = commandExists("ollama");
  if (hasOllama) {
    success("ollama encontrado");
  } else {
    warn(
      "ollama nao encontrado - necessario apenas se usar AI local (provider: ollama)"
    );
  }

  console.log();

  // 2. Configurar arquivos .env
  info("Configurando arquivos de ambiente...");

  writeEnvIfMissing(join(PROJECT_ROOT, ".env"), ENV_ROOT, ".env (raiz)");
  writeEnvIfMissing(
    join(PROJECT_ROOT, "apps", "api", ".env"),
    ENV_API,
    "apps/api/.env"
  );
  writeEnvIfMissing(
    join(PROJECT_ROOT, "apps", "web", ".env"),
    ENV_WEB,
    "apps/web/.env"
  );

  console.log();

  // 3. Subir containers Docker
  info("Iniciando containers Docker (PostgreSQL + RabbitMQ)...");

  const dockerInfo = run(["docker", "info"], { silent: true });
  if (!dockerInfo.success) {
    error(
      "Docker nao esta rodando. Inicie o Docker Desktop e execute o script novamente."
    );
    process.exit(1);
  }

  const composeUp = run(["docker", "compose", "up", "-d"]);
  if (!composeUp.success) {
    error("Falha ao iniciar containers Docker.");
    process.exit(1);
  }

  // Aguardar PostgreSQL
  info("Aguardando PostgreSQL ficar pronto...");
  for (let i = 0; i < 30; i++) {
    const ready = run(
      ["docker", "exec", "smartdocs-db", "pg_isready", "-U", "user", "-d", "smartdocs"],
      { silent: true }
    );
    if (ready.success) break;
    if (i === 29) {
      error("PostgreSQL nao ficou pronto a tempo.");
      process.exit(1);
    }
    await sleep(1000);
  }
  success("PostgreSQL pronto");

  // Aguardar RabbitMQ
  info("Aguardando RabbitMQ ficar pronto...");
  for (let i = 0; i < 30; i++) {
    const ready = run(
      ["docker", "exec", "smartdocs-rabbit", "rabbitmq-diagnostics", "-q", "ping"],
      { silent: true }
    );
    if (ready.success) break;
    if (i === 29) {
      error("RabbitMQ nao ficou pronto a tempo.");
      process.exit(1);
    }
    await sleep(1000);
  }
  success("RabbitMQ pronto");

  console.log();

  // 4. Instalar dependencias
  info("Instalando dependencias com bun...");
  const install = run(["bun", "install"]);
  if (!install.success) {
    error("Falha ao instalar dependencias.");
    process.exit(1);
  }
  success("Dependencias instaladas");

  console.log();

  // 5. Rodar migrations
  info("Executando migrations do banco de dados...");
  const migrate = run(["bun", "run", "db:migrate"], {
    cwd: join(PROJECT_ROOT, "apps", "api"),
  });
  if (!migrate.success) {
    error("Falha ao executar migrations.");
    process.exit(1);
  }
  success("Migrations executadas");

  console.log();

  // 6. Baixar modelos do Ollama (opcional)
  if (hasOllama) {
    const answer = await ask(
      `${c.blue("[INFO]")} Deseja baixar os modelos do Ollama? (llama3, phi3:mini) [s/N] `
    );
    if (answer.toLowerCase() === "s") {
      info("Baixando modelos do Ollama...");
      if (!run(["ollama", "pull", "llama3"]).success) {
        warn("Falha ao baixar llama3");
      }
      if (!run(["ollama", "pull", "phi3:mini"]).success) {
        warn("Falha ao baixar phi3:mini");
      }
      success("Modelos baixados");
    } else {
      info("Pulando download dos modelos do Ollama");
    }
  }

  console.log();
  console.log(c.green("========================================"));
  console.log(c.green("   Setup concluido com sucesso!"));
  console.log(c.green("========================================"));
  console.log();
  console.log("Para iniciar o projeto em modo desenvolvimento:");
  console.log();
  console.log(`  ${c.blue("bun run dev")}`);
  console.log();
  console.log("Servicos disponiveis:");
  console.log(`  Web:              ${c.blue("http://localhost:3000")}`);
  console.log(`  API:              ${c.blue("http://localhost:8080")}`);
  console.log(
    `  RabbitMQ Manager: ${c.blue("http://localhost:15672")} (guest/guest)`
  );
  console.log(
    `  Drizzle Studio:   ${c.blue("cd apps/api && bun run db:studio")}`
  );
  console.log();
}

main();
