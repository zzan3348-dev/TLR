/* global process */
import { createInterface } from "node:readline";
import { randomBytes, scryptSync } from "node:crypto";

const input = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
input.question("관리 코드를 입력하면 해시만 출력됩니다: ", (secret) => {
  const salt = randomBytes(16);
  const derived = scryptSync(secret, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  process.stdout.write(`scrypt$16384$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}\n`);
  input.close();
});
