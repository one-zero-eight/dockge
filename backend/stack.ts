import { DockgeServer } from "./dockge-server";
import fs, { promises as fsAsync } from "fs";
import { log } from "./log";
import yaml from "yaml";
import { DockgeSocket, fileExists, ValidationError } from "./util-server";
import path from "path";
import {
    acceptedComposeFileNames,
    COMBINED_TERMINAL_COLS,
    COMBINED_TERMINAL_ROWS,
    CREATED_FILE,
    composeStatusToStatus,
    getCombinedTerminalName,
    getComposeTerminalName, getContainerExecTerminalName, getContainerInstanceExecTerminalName,
    getContainerLogTerminalName,
    RUNNING, TERMINAL_COLS, TERMINAL_ROWS,
    UNKNOWN
} from "../common/util-common";
import { InteractiveTerminal, Terminal } from "./terminal";
import childProcessAsync from "promisify-child-process";
import { Settings } from "./settings";

export class Stack {

    name: string;
    protected _status: number = UNKNOWN;
    protected _composeStatus?: string;
    protected _composeYAML?: string;
    protected _composeENV?: string;
    protected _configFilePath?: string;
    protected _projectDir?: string;
    protected _composeFileName: string = "compose.yaml";
    protected server: DockgeServer;

    protected combinedTerminal? : Terminal;

    constructor(server : DockgeServer, name : string, composeYAML? : string, composeENV? : string, skipFSOperations = false) {
        this.name = name;
        this.server = server;
        this._composeYAML = composeYAML;
        this._composeENV = composeENV;

        if (!skipFSOperations) {
            // Check if compose file name is different from compose.yaml
            for (const filename of acceptedComposeFileNames) {
                if (fs.existsSync(path.join(this.path, filename))) {
                    this._composeFileName = filename;
                    break;
                }
            }
        }
    }

    async toJSON(endpoint : string) : Promise<object> {

        // Since we have multiple agents now, embed primary hostname in the stack object too.
        let primaryHostname = await Settings.get("primaryHostname");
        if (!primaryHostname) {
            if (!endpoint) {
                primaryHostname = "localhost";
            } else {
                // Use the endpoint as the primary hostname
                try {
                    primaryHostname = (new URL("https://" + endpoint).hostname);
                } catch (e) {
                    // Just in case if the endpoint is in a incorrect format
                    primaryHostname = "localhost";
                }
            }
        }

        let obj = this.toSimpleJSON(endpoint);
        return {
            ...obj,
            composeYAML: this.composeYAML,
            composeENV: this.composeENV,
            primaryHostname,
        };
    }

    toSimpleJSON(endpoint : string) : object {
        return {
            name: this.name,
            status: this._status,
            composeStatus: this._composeStatus,
            tags: [],
            isManagedByDockge: this.isManagedByDockge,
            composeFileName: this._composeFileName,
            endpoint,
        };
    }

    /**
     * Get the status of the stack from `docker compose ps --format json`
     */
    async ps() : Promise<object> {
        let res = await childProcessAsync.spawn("docker", this.getComposeOptions("ps", "--format", "json"), {
            cwd: this.path,
            encoding: "utf-8",
        });
        if (!res.stdout) {
            return {};
        }
        return JSON.parse(res.stdout.toString());
    }

    static isPathInside(parent : string, child : string) : boolean {
        const relative = path.relative(path.resolve(parent), path.resolve(child));
        return relative !== "" && !relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative);
    }

    get isManagedByDockge() : boolean {
        const stackDir = path.resolve(this.server.stacksDir);
        const projectDir = this.fullPath;
        const relative = path.relative(stackDir, projectDir);
        return relative !== "" && !relative.startsWith(".." + path.sep) && relative !== ".."
            && !path.isAbsolute(relative) && fs.existsSync(projectDir) && fs.statSync(projectDir).isDirectory()
            && acceptedComposeFileNames.includes(this._composeFileName)
            && fs.existsSync(path.join(projectDir, this._composeFileName));
    }

    get status() : number {
        return this._status;
    }

    validate() {
        // Check name, allows [a-z][0-9] _ - only
        if (!this.name.match(/^[a-z0-9][a-z0-9_-]*$/)) {
            throw new ValidationError("Project name can only contain [a-z][0-9] _ - only");
        }

        // Check YAML format
        yaml.parse(this.composeYAML);

        let lines = this.composeENV.split("\n");

        // Check if the .env is able to pass docker-compose
        // Prevent "setenv: The parameter is incorrect"
        // It only happens when there is one line and it doesn't contain "="
        if (lines.length === 1 && !lines[0].includes("=") && lines[0].length > 0) {
            throw new ValidationError("Invalid .env format");
        }
    }

    setComposeContent(composeYAML : string, composeENV : string) {
        this._composeYAML = composeYAML;
        this._composeENV = composeENV;
    }

    get composeYAML() : string {
        if (this._composeYAML === undefined) {
            try {
                this._composeYAML = fs.readFileSync(path.join(this.path, this._composeFileName), "utf-8");
            } catch (e) {
                this._composeYAML = "";
            }
        }
        return this._composeYAML;
    }

    get composeENV() : string {
        if (this._composeENV === undefined) {
            try {
                this._composeENV = fs.readFileSync(path.join(this.path, ".env"), "utf-8");
            } catch (e) {
                this._composeENV = "";
            }
        }
        return this._composeENV;
    }

    get path() : string {
        return this._projectDir ?? path.join(this.server.stacksDir, this.name);
    }

    get fullPath() : string {
        let dir = this.path;

        // Compose up via node-pty
        let fullPathDir;

        // if dir is relative, make it absolute
        if (!path.isAbsolute(dir)) {
            fullPathDir = path.join(process.cwd(), dir);
        } else {
            fullPathDir = dir;
        }
        return fullPathDir;
    }

    /**
     * Save the stack to the disk
     * @param isAdd
     */
    async save(isAdd : boolean) {
        let dir = this.path;

        if (isAdd) {
            const folderName = this.name.trim();
            if (!folderName || folderName === "." || folderName === ".." || /[/\\\0]/.test(folderName)) {
                throw new ValidationError("Invalid project folder name");
            }
            dir = path.join(this.server.stacksDir, folderName);
            const declaredName = yaml.parse(this.composeYAML)?.name;
            const derivedName = folderName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
            this.name = typeof declaredName === "string" ? declaredName : /^[a-z0-9]/.test(derivedName) ? derivedName : "p" + derivedName;
            this._projectDir = path.resolve(dir);
        }
        this.validate();

        if (isAdd) {
            if (await fileExists(dir)) {
                throw new ValidationError("Project folder already exists");
            }
            if ((await Stack.getStackList(this.server)).has(this.name)) {
                throw new ValidationError("Compose project name already exists");
            }
            await fsAsync.mkdir(dir);
        } else {
            if (!this.isManagedByDockge || !await fileExists(dir)) {
                throw new ValidationError("Project is not managed by Dockge");
            }
        }

        // Write or overwrite the compose.yaml
        fs.writeFileSync(path.join(dir, this._composeFileName), this.composeYAML);
        if (process.env.PUID && process.env.PGID) {
            const uid = Number(process.env.PUID);
            const gid = Number(process.env.PGID);
            fs.lchownSync(dir, uid, gid);
            fs.chownSync(path.join(dir, this._composeFileName), uid, gid);
        }
    }

    async deploy(socket : DockgeSocket) : Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("up", "-d", "--remove-orphans"), this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to deploy, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async delete(socket: DockgeSocket) : Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("down", "--remove-orphans"), this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to delete, please check the terminal output for more information.");
        }

        // The compose file can back several -p projects. Removing one must
        // not delete the configuration used by the others.
        const remaining = await Stack.getStackList(this.server);
        const composeFile = path.join(this.fullPath, this._composeFileName);
        if (![ ...remaining.values() ].some(stack => stack.name !== this.name
            && path.join(stack.fullPath, stack._composeFileName) === composeFile)) {
            await fsAsync.rm(this.path, {
                recursive: true,
                force: true
            });
        }

        return exitCode;
    }

    async updateStatus() {
        let statusList = await Stack.getStatusList();
        const entry = statusList.get(this.name);
        this._status = entry?.status ?? UNKNOWN;
        this._composeStatus = entry?.composeStatus;
    }

    static async getStackList(server : DockgeServer) : Promise<Map<string, Stack>> {
        const byFile = new Map<string, Stack>();
        for (const folder of await fsAsync.readdir(server.stacksDir)) {
            try {
                const projectDir = path.resolve(server.stacksDir, folder);
                if (!(await fsAsync.stat(projectDir)).isDirectory()) {
                    continue;
                }
                const composeFile = acceptedComposeFileNames.find(filename => fs.existsSync(path.join(projectDir, filename)));
                if (!composeFile) {
                    continue;
                }
                const stack = new Stack(server, folder);
                stack._projectDir = projectDir;
                stack._composeFileName = composeFile;
                stack._status = CREATED_FILE;
                try {
                    const document = yaml.parse(stack.composeYAML);
                    if (typeof document?.name === "string" && /^[a-z0-9][a-z0-9_-]*$/.test(document.name)) {
                        stack.name = document.name;
                    }
                } catch {
                    // Unfinished drafts remain visible and editable.
                }
                byFile.set(path.join(projectDir, composeFile), stack);
            } catch (e) {
                log.warn("getStackList", `Failed to read project folder ${folder}: ${e instanceof Error ? e.message : e}`);
            }
        }

        const result = await childProcessAsync.spawn("docker", [ "compose", "ls", "--all", "--format", "json" ], {
            encoding: "utf-8",
        });
        const composeList : { Name : string, Status : string, ConfigFiles : string }[] = result.stdout
            ? JSON.parse(result.stdout.toString()) : [];
        const stackList = new Map<string, Stack>();
        for (const project of composeList) {
            const configFile = typeof project.ConfigFiles === "string" ? project.ConfigFiles.split(",")[0].trim() : "";
            if (!configFile) {
                continue;
            }
            const file = path.resolve(configFile);
            if (project.Name === "dockge" && !Stack.isPathInside(server.stacksDir, file)) {
                continue;
            }
            const stack = new Stack(server, project.Name, undefined, undefined, true);
            stack._projectDir = path.dirname(file);
            stack._composeFileName = path.basename(file);
            stack._status = this.statusConvert(project.Status);
            stack._composeStatus = project.Status;
            stackList.set(project.Name, stack);
            byFile.delete(file);
        }

        for (const stack of byFile.values()) {
            if (stackList.has(stack.name)) {
                log.warn("getStackList", `Compose project name "${stack.name}" already exists; cannot show draft ${path.join(stack.fullPath, stack._composeFileName)}`);
                continue;
            }
            stackList.set(stack.name, stack);
        }
        return stackList;
    }

    /**
     * Get the status list, it will be used to update the status of the stacks
     * Not all status will be returned, only the stack that is deployed or created to `docker compose` will be returned
     */
    static async getStatusList() : Promise<Map<string, { status: number; composeStatus: string }>> {
        const statusList = new Map<string, { status: number; composeStatus: string }>();

        let res = await childProcessAsync.spawn("docker", [ "compose", "ls", "--all", "--format", "json" ], {
            encoding: "utf-8",
        });

        if (!res.stdout) {
            return statusList;
        }

        let composeList = JSON.parse(res.stdout.toString());

        for (let composeStack of composeList) {
            statusList.set(composeStack.Name, {
                status: this.statusConvert(composeStack.Status),
                composeStatus: composeStack.Status,
            });
        }

        return statusList;
    }

    /**
     * Convert the status string from `docker compose ls` to the status number
     * Input Example: "exited(1), running(1)"
     * @param status
     */
    static statusConvert(status : string) : number {
        return composeStatusToStatus(status);
    }

    static async getStack(server: DockgeServer, stackName: string) : Promise<Stack> {
        // A Compose name may differ from the folder name; resolve the merged identity first.
        const stackList = await this.getStackList(server);
        const listedStack = stackList.get(stackName);
        if (listedStack) {
            return listedStack;
        }
        throw new ValidationError("Project not found");
    }

    getComposeOptions(command : string, ...extraOptions : string[]) {
        const projectDir = this.fullPath;
        const options = [ "compose", "--project-directory", projectDir,
            "-f", path.join(projectDir, this._composeFileName), "-p", this.name ];
        const globalEnv = path.join(path.resolve(this.server.stacksDir), "global.env");
        if (fs.existsSync(globalEnv)) {
            options.push("--env-file", globalEnv);
            const stackEnv = path.join(projectDir, ".env");
            if (fs.existsSync(stackEnv)) {
                options.push("--env-file", stackEnv);
            }
        }
        options.push(command, ...extraOptions);
        return options;
    }

    async start(socket: DockgeSocket) {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("up", "-d", "--remove-orphans"), this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to start, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async stop(socket: DockgeSocket) : Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("stop"), this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to stop, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async restart(socket: DockgeSocket) : Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("restart"), this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to restart, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async down(socket: DockgeSocket) : Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("down"), this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to down, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async update(socket: DockgeSocket) {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("pull"), this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to pull, please check the terminal output for more information.");
        }

        // If the stack is not running, we don't need to restart it
        await this.updateStatus();
        log.debug("update", "Status: " + this.status);
        if (this.status !== RUNNING) {
            return exitCode;
        }

        exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", this.getComposeOptions("up", "-d", "--remove-orphans"), this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to restart, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async joinCombinedTerminal(socket: DockgeSocket) {
        const terminalName = getCombinedTerminalName(socket.endpoint, this.name);
        const terminal = Terminal.getOrCreateTerminal(this.server, terminalName, "docker", this.getComposeOptions("logs", "-f", "--tail", "100"), this.path);
        terminal.enableKeepAlive = true;
        terminal.rows = COMBINED_TERMINAL_ROWS;
        terminal.cols = COMBINED_TERMINAL_COLS;
        terminal.join(socket);
        terminal.start();
    }

    async leaveCombinedTerminal(socket: DockgeSocket) {
        const terminalName = getCombinedTerminalName(socket.endpoint, this.name);
        const terminal = Terminal.getTerminal(terminalName);
        if (terminal) {
            terminal.leave(socket);
        }
    }

    async joinContainerTerminal(socket: DockgeSocket, serviceName: string, shell : string = "sh", index: number = 0) {
        const terminalName = getContainerExecTerminalName(socket.endpoint, this.name, serviceName, index, shell);
        let terminal = Terminal.getTerminal(terminalName);

        if (!terminal) {
            terminal = new InteractiveTerminal(this.server, terminalName, "docker", this.getComposeOptions("exec", "-e", "TERM=xterm-256color", serviceName, shell), this.path);
            terminal.rows = TERMINAL_ROWS;
            log.debug("joinContainerTerminal", "Terminal created");
        }

        terminal.join(socket);
        terminal.start();
    }

    /**
     * Leave a Compose service terminal and close its PTY when unused.
     *
     * @param socket Socket leaving the terminal
     * @param serviceName Compose service name
     * @param shell Shell executable
     * @param index Compose replica index
     */
    leaveContainerTerminal(socket: DockgeSocket, serviceName: string, shell: string, index: number = 0) {
        const terminalName = getContainerExecTerminalName(socket.endpoint, this.name, serviceName, index, shell);
        const terminal = Terminal.getTerminal(terminalName);
        if (terminal) {
            terminal.leave(socket);
            if (!terminal.hasClients) {
                terminal.close();
            }
        }
    }

    async getServiceStatusList() {
        let statusList = new Map<string, Array<object>>();

        try {
            let res = await childProcessAsync.spawn("docker", this.getComposeOptions("ps", "--all", "--format", "json"), {
                cwd: this.path,
                encoding: "utf-8",
            });

            if (!res.stdout) {
                return statusList;
            }

            let lines = res.stdout?.toString().split("\n");

            const addLine = (obj: {
                ID: string,
                Service: string,
                State: string,
                Name: string,
                Health: string,
                Image: string,
                Command: string,
                CreatedAt: string,
                RunningFor: string,
                Ports: string,
                Publishers?: Array<object>
            }) => {
                if (!statusList.has(obj.Service)) {
                    statusList.set(obj.Service, []);
                }
                statusList.get(obj.Service)?.push({
                    id: obj.ID,
                    service: obj.Service,
                    status: obj.Health || obj.State,
                    state: obj.State,
                    health: obj.Health,
                    name: obj.Name,
                    image: obj.Image,
                    command: obj.Command,
                    createdAt: obj.CreatedAt,
                    runningFor: obj.RunningFor,
                    ports: obj.Ports,
                    publishers: obj.Publishers || [],
                });
            };

            for (let line of lines) {
                try {
                    let obj = JSON.parse(line);
                    if (obj instanceof Array) {
                        obj.forEach(addLine);
                    } else {
                        addLine(obj);
                    }
                } catch (e) {
                }
            }

            return statusList;
        } catch (e) {
            log.error("getServiceStatusList", e);
            return statusList;
        }
    }

    /**
     * Resolve a container by name and verify that it belongs to this stack.
     *
     * @param containerName Docker container name
     * @returns Container status returned by Docker Compose
     */
    async getContainer(containerName: string) : Promise<Record<string, unknown>> {
        const serviceStatusList = await this.getServiceStatusList();
        for (const containers of serviceStatusList.values()) {
            const container = containers.find((item) => (item as { name?: string }).name === containerName);
            if (container) {
                return container as Record<string, unknown>;
            }
        }
        throw new ValidationError(`Container ${containerName} does not belong to project ${this.name}.`);
    }

    /**
     * Join a read-only log stream for one container instance.
     *
     * @param socket Socket joining the terminal
     * @param containerName Docker container name
     * @returns Terminal name used by the frontend
     */
    async joinContainerLogs(socket: DockgeSocket, containerName: string) : Promise<string> {
        const container = await this.getContainer(containerName);
        const terminalName = getContainerLogTerminalName(socket.endpoint, this.name, containerName);
        const terminal = Terminal.getOrCreateTerminal(
            this.server,
            terminalName,
            "docker",
            [ "logs", "--follow", "--tail", "200", String(container.id) ],
            this.path
        );
        terminal.enableKeepAlive = true;
        terminal.rows = COMBINED_TERMINAL_ROWS;
        terminal.cols = TERMINAL_COLS;
        terminal.join(socket);
        terminal.start();
        return terminalName;
    }

    /**
     * Leave a container log stream.
     *
     * @param socket Socket leaving the terminal
     * @param containerName Docker container name
     */
    async leaveContainerLogs(socket: DockgeSocket, containerName: string) {
        const terminalName = getContainerLogTerminalName(socket.endpoint, this.name, containerName);
        const terminal = Terminal.getTerminal(terminalName);
        terminal?.leave(socket);
    }

    /**
     * Open an interactive shell for one concrete container instance.
     *
     * @param socket Socket joining the terminal
     * @param containerName Docker container name
     * @param shell Shell executable
     */
    async joinContainerInstanceTerminal(socket: DockgeSocket, containerName: string, shell: string) {
        const container = await this.getContainer(containerName);
        const terminalName = getContainerInstanceExecTerminalName(socket.endpoint, this.name, containerName, shell);
        let terminal = Terminal.getTerminal(terminalName);
        if (!terminal) {
            terminal = new InteractiveTerminal(
                this.server,
                terminalName,
                "docker",
                [ "exec", "-it", "-e", "TERM=xterm-256color", String(container.id), shell ],
                this.path
            );
            terminal.rows = TERMINAL_ROWS;
        }
        terminal.join(socket);
        terminal.start();
    }

    /**
     * Leave an interactive container terminal and close it when unused.
     *
     * @param socket Socket leaving the terminal
     * @param containerName Docker container name
     * @param shell Shell executable
     */
    leaveContainerInstanceTerminal(socket: DockgeSocket, containerName: string, shell: string) {
        const terminalName = getContainerInstanceExecTerminalName(socket.endpoint, this.name, containerName, shell);
        const terminal = Terminal.getTerminal(terminalName);
        if (terminal) {
            terminal.leave(socket);
            if (!terminal.hasClients) {
                terminal.close();
            }
        }
    }

    /**
     * Run a lifecycle action against one verified container instance.
     *
     * @param containerName Docker container name
     * @param action Docker lifecycle action
     */
    async runContainerAction(containerName: string, action: "start" | "stop" | "restart") {
        const container = await this.getContainer(containerName);
        const result = await childProcessAsync.spawn("docker", [ action, String(container.id) ], {
            cwd: this.path,
            encoding: "utf-8",
        });
        if (result.code !== 0) {
            throw new Error(`Failed to ${action} container ${containerName}.`);
        }
    }

    async startService(socket: DockgeSocket, serviceName: string) {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        const exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", [ "compose", "up", "-d", serviceName ], this.path);
        if (exitCode !== 0) {
            throw new Error(`Failed to start service ${serviceName}, please check logs for more information.`);
        }

        return exitCode;
    }

    async stopService(socket: DockgeSocket, serviceName: string): Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        const exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", [ "compose", "stop", serviceName ], this.path);
        if (exitCode !== 0) {
            throw new Error(`Failed to stop service ${serviceName}, please check logs for more information.`);
        }

        return exitCode;
    }

    async restartService(socket: DockgeSocket, serviceName: string): Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        const exitCode = await Terminal.exec(this.server, socket, terminalName, "docker", [ "compose", "restart", serviceName ], this.path);
        if (exitCode !== 0) {
            throw new Error(`Failed to restart service ${serviceName}, please check logs for more information.`);
        }

        return exitCode;
    }
}
