import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const base = { DATABASE_URL: "postgresql://user:pass@host:5432/db" };

describe("env", () => {
  it("acepta el mínimo de la Fase 0 y aplica defaults", () => {
    const e = parseEnv(base);
    expect(e.DATABASE_URL).toBe(base.DATABASE_URL);
    expect(e.SITE_URL).toBe("http://localhost:3000");
    expect(e.SM_API_KEY).toBeUndefined();
  });

  it("exige DATABASE_URL de Postgres", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: "mysql://h/db" })).toThrow(/DATABASE_URL/);
  });

  it("trata los strings vacíos como no definidos", () => {
    expect(parseEnv({ ...base, SM_API_KEY: "", TRANSFER_CBU: "" }).SM_API_KEY).toBeUndefined();
  });

  it("valida formato de integraciones cuando están", () => {
    expect(() => parseEnv({ ...base, SM_API_KEY: "abc" })).toThrow(/SM_API_KEY/);
    expect(() => parseEnv({ ...base, TRANSFER_CBU: "123" })).toThrow(/TRANSFER_CBU/);
    expect(parseEnv({ ...base, SM_API_KEY: "sm_test" }).SM_API_KEY).toBe("sm_test");
  });

  it("el mensaje de error no filtra valores", () => {
    const secret = "sm-secreto-que-no-debe-aparecer";
    expect(() => parseEnv({ ...base, SM_API_KEY: secret })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(secret) }),
    );
  });
});
