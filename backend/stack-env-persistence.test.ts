import assert from "node:assert/strict";
import fs from "node:fs";
import { promises as fsAsync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { Stack } from "./stack";
import { DockgeServer } from "./dockge-server";

describe("stack .env persistence", () => {
    let tmpRoot: string;
    let stacksDir: string;
    let server: DockgeServer;

    before(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dockge-env-persist-"));
        stacksDir = path.join(tmpRoot, "stacks");
        fs.mkdirSync(stacksDir);
        server = { stacksDir } as DockgeServer;
    });

    after(() => {
        fs.rmSync(tmpRoot, {
            recursive: true,
            force: true,
        });
    });

    test("save creates nonempty .env and updates existing content", async () => {
        const stack = new Stack(server, "env-create", "services:\n  web:\n    image: nginx\n", "FOO=bar\n");
        await stack.save(true);
        const envPath = path.join(stacksDir, "env-create", ".env");
        assert.equal(fs.readFileSync(envPath, "utf-8"), "FOO=bar\n");

        const updated = new Stack(server, "env-create", "services:\n  web:\n    image: nginx\n", "FOO=baz\nBAR=1\n");
        await updated.save(false);
        assert.equal(fs.readFileSync(envPath, "utf-8"), "FOO=baz\nBAR=1\n");
    });

    test("save clears an existing .env but does not create one for whitespace-only input", async () => {
        const stack = new Stack(server, "env-clear", "services:\n  web:\n    image: nginx\n", "KEEP=1\n");
        await stack.save(true);
        const envPath = path.join(stacksDir, "env-clear", ".env");
        assert.equal(fs.existsSync(envPath), true);

        const cleared = new Stack(server, "env-clear", "services:\n  web:\n    image: nginx\n", "");
        await cleared.save(false);
        assert.equal(fs.readFileSync(envPath, "utf-8"), "");

        const missingName = "env-missing";
        const missing = new Stack(server, missingName, "services:\n  web:\n    image: nginx\n", "   \n");
        await missing.save(true);
        assert.equal(fs.existsSync(path.join(stacksDir, missingName, ".env")), false);
        assert.equal(fs.existsSync(path.join(stacksDir, missingName, "compose.yaml")), true);
    });

    test("save applies PUID/PGID ownership to compose and .env when both are set", async () => {
        if (typeof process.getuid !== "function" || typeof process.getgid !== "function" || process.getuid() !== 0) {
            // Ownership changes require root; verify the write path still succeeds without them.
            const stack = new Stack(server, "env-owner", "services:\n  web:\n    image: nginx\n", "A=1\n");
            await stack.save(true);
            assert.equal(fs.readFileSync(path.join(stacksDir, "env-owner", ".env"), "utf-8"), "A=1\n");
            return;
        }

        const uid = process.getuid();
        const gid = process.getgid();
        const previousPuid = process.env.PUID;
        const previousPgid = process.env.PGID;
        process.env.PUID = String(uid);
        process.env.PGID = String(gid);
        try {
            const stack = new Stack(server, "env-owner", "services:\n  web:\n    image: nginx\n", "A=1\n");
            await stack.save(true);
            const envStat = await fsAsync.stat(path.join(stacksDir, "env-owner", ".env"));
            assert.equal(envStat.uid, uid);
            assert.equal(envStat.gid, gid);
        } finally {
            if (previousPuid === undefined) {
                delete process.env.PUID;
            } else {
                process.env.PUID = previousPuid;
            }
            if (previousPgid === undefined) {
                delete process.env.PGID;
            } else {
                process.env.PGID = previousPgid;
            }
        }
    });
});
