import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { Stack } from "./stack";
import { CREATED_STACK, EXITED, RUNNING, UNKNOWN } from "../common/util-common";

type ContainerState = {
    Status: string;
    ExitCode?: number;
};

describe("clean-exit compose status", () => {
    const originalGetStates = Stack.getProjectContainerStates;

    afterEach(() => {
        Stack.getProjectContainerStates = originalGetStates;
    });

    function stubStates(states: ContainerState[] | null) {
        Stack.getProjectContainerStates = async () => states;
    }

    test("statusConvert still maps unmixed statuses", () => {
        assert.equal(Stack.statusConvert("running(2)"), RUNNING);
        assert.equal(Stack.statusConvert("exited(1)"), EXITED);
        assert.equal(Stack.statusConvert("created"), CREATED_STACK);
        assert.equal(Stack.statusConvert("exited(1), running(2)"), EXITED);
    });

    test("resolveComposeStatus upgrades exit-0 + running to RUNNING", async () => {
        stubStates([
            {
                Status: "running",
                ExitCode: 0,
            },
            {
                Status: "exited",
                ExitCode: 0,
            },
        ]);
        assert.equal(await Stack.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1), running(2)",
        }), RUNNING);
    });

    test("resolveComposeStatus keeps EXITED when any exit code is non-zero", async () => {
        stubStates([
            {
                Status: "running",
            },
            {
                Status: "exited",
                ExitCode: 1,
            },
        ]);
        assert.equal(await Stack.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1), running(1)",
        }), EXITED);
    });

    test("resolveComposeStatus does not upgrade paused or restarting mixtures", async () => {
        stubStates([
            {
                Status: "running",
            },
            {
                Status: "paused",
            },
        ]);
        assert.equal(await Stack.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1), running(1)",
        }), EXITED);

        stubStates([
            {
                Status: "running",
            },
            {
                Status: "restarting",
            },
        ]);
        assert.equal(await Stack.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1), running(1)",
        }), EXITED);

        stubStates([
            {
                Status: "running",
            },
            {
                Status: "dead",
            },
        ]);
        assert.equal(await Stack.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1), running(1)",
        }), EXITED);
    });

    test("resolveComposeStatus returns UNKNOWN on missing or incomplete inspect data", async () => {
        stubStates(null);
        assert.equal(await Stack.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1), running(1)",
        }), UNKNOWN);

        stubStates([]);
        assert.equal(await Stack.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1), running(1)",
        }), UNKNOWN);

        stubStates([
            {
                Status: "running",
            },
            {
                Status: "exited",
            },
        ]);
        assert.equal(await Stack.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1), running(1)",
        }), EXITED);
    });

    test("resolveComposeStatus returns UNKNOWN when inspect throws", async () => {
        Stack.getProjectContainerStates = async () => {
            throw new Error("docker unavailable");
        };
        assert.equal(await Stack.resolveComposeStatus({
            Name: "demo",
            Status: "exited(1), running(1)",
        }), UNKNOWN);
    });

    test("resolveComposeStatus skips inspect for unmixed statuses", async () => {
        let called = false;
        Stack.getProjectContainerStates = async () => {
            called = true;
            return null;
        };
        assert.equal(await Stack.resolveComposeStatus({
            Name: "demo",
            Status: "running(2)",
        }), RUNNING);
        assert.equal(await Stack.resolveComposeStatus({
            Name: "demo",
            Status: "exited(2)",
        }), EXITED);
        assert.equal(called, false);
    });

    test("all exited containers remain EXITED even when exit codes are 0", async () => {
        stubStates([
            {
                Status: "exited",
                ExitCode: 0,
            },
            {
                Status: "exited",
                ExitCode: 0,
            },
        ]);
        assert.equal(await Stack.resolveMixedRunningAndExited("demo"), EXITED);
    });
});
