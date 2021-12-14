"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Hetzner = void 0;
const config_1 = __importDefault(require("../config"));
const axios_1 = __importDefault(require("axios"));
const uuid_1 = require("uuid");
const base_1 = require("./base");
const utils_1 = require("./utils");
const HETZNER_TOKEN = config_1.default.HETZNER_TOKEN;
const sshKeys = config_1.default.HETZNER_SSH_KEYS.split(',').map(Number);
const imageId = Number(config_1.default.HETZNER_IMAGE);
class Hetzner extends base_1.VMManager {
    constructor() {
        super(...arguments);
        this.size = 'cpx11'; // cx11, cpx11, cpx21, cpx31, ccx11
        this.largeSize = 'cpx31';
        this.id = 'Hetzner';
        this.networks = (this.region === 'US'
            ? config_1.default.HETZNER_NETWORKS_US
            : config_1.default.HETZNER_NETWORKS)
            .split(',')
            .map(Number);
        this.gateway = this.region === 'US' ? config_1.default.HETZNER_GATEWAY_US : config_1.default.HETZNER_GATEWAY;
        this.datacenters = this.region === 'US' ? ['ash'] : ['nbg1', 'fsn1', 'hel1'];
        this.startVM = (name) => __awaiter(this, void 0, void 0, function* () {
            const response = yield (0, axios_1.default)({
                method: 'POST',
                url: `https://api.hetzner.cloud/v1/servers`,
                headers: {
                    Authorization: 'Bearer ' + HETZNER_TOKEN,
                    'Content-Type': 'application/json',
                },
                data: {
                    name: name,
                    server_type: this.isLarge ? this.largeSize : this.size,
                    start_after_create: true,
                    image: imageId,
                    ssh_keys: sshKeys,
                    networks: [
                        this.networks[Math.floor(Math.random() * this.networks.length)],
                    ],
                    user_data: (0, utils_1.cloudInit)(utils_1.imageName, this.isLarge ? '1920x1080@30' : undefined, false, false, true),
                    labels: {
                        [this.getTag()]: '1',
                        originalName: name,
                    },
                    location: this.datacenters[Math.floor(Math.random() * this.datacenters.length)],
                },
            });
            const id = response.data.server.id;
            return id;
        });
        this.terminateVM = (id) => __awaiter(this, void 0, void 0, function* () {
            yield (0, axios_1.default)({
                method: 'DELETE',
                url: `https://api.hetzner.cloud/v1/servers/${id}`,
                headers: {
                    Authorization: 'Bearer ' + HETZNER_TOKEN,
                },
            });
        });
        this.rebootVM = (id) => __awaiter(this, void 0, void 0, function* () {
            // Hetzner does not update the hostname automatically on instance name update + reboot
            // It requires a rebuild command
            // Generate a new password
            const password = (0, uuid_1.v4)();
            // Update the VM's name
            yield (0, axios_1.default)({
                method: 'PUT',
                url: `https://api.hetzner.cloud/v1/servers/${id}`,
                headers: {
                    Authorization: 'Bearer ' + HETZNER_TOKEN,
                    'Content-Type': 'application/json',
                },
                data: {
                    name: password,
                },
            });
            // Rebuild the VM
            yield (0, axios_1.default)({
                method: 'POST',
                url: `https://api.hetzner.cloud/v1/servers/${id}/actions/rebuild`,
                headers: {
                    Authorization: 'Bearer ' + HETZNER_TOKEN,
                },
                data: {
                    image: imageId,
                },
            });
            return;
        });
        this.getVM = (id) => __awaiter(this, void 0, void 0, function* () {
            const response = yield (0, axios_1.default)({
                method: 'GET',
                url: `https://api.hetzner.cloud/v1/servers/${id}`,
                headers: {
                    Authorization: 'Bearer ' + HETZNER_TOKEN,
                },
            });
            console.log('[GETVM] %s rate limit remaining', response === null || response === void 0 ? void 0 : response.headers['ratelimit-remaining']);
            const server = this.mapServerObject(response.data.server);
            if (!server.private_ip) {
                return null;
            }
            return server;
        });
        this.listVMs = (filter) => __awaiter(this, void 0, void 0, function* () {
            const limit = this.isLarge
                ? config_1.default.VM_POOL_LIMIT_LARGE
                : config_1.default.VM_POOL_LIMIT;
            const pageCount = Math.ceil((limit || 1) / 50);
            const pages = Array.from(Array(pageCount).keys()).map((i) => i + 1);
            const responses = yield Promise.all(pages.map((page) => (0, axios_1.default)({
                method: 'GET',
                url: `https://api.hetzner.cloud/v1/servers`,
                headers: {
                    Authorization: 'Bearer ' + HETZNER_TOKEN,
                },
                params: {
                    sort: 'id:asc',
                    page,
                    per_page: 50,
                    label_selector: filter,
                },
            })));
            const responsesMapped = responses.map((response) => response.data.servers
                .map(this.mapServerObject)
                .filter((server) => server.tags.includes(this.getTag())));
            return responsesMapped.flat();
        });
        this.powerOn = (id) => __awaiter(this, void 0, void 0, function* () {
            // Poweron the server (usually not needed)
            try {
                yield (0, axios_1.default)({
                    method: 'POST',
                    url: `https://api.hetzner.cloud/v1/servers/${id}/actions/poweron`,
                    headers: {
                        Authorization: 'Bearer ' + HETZNER_TOKEN,
                        'Content-Type': 'application/json',
                    },
                });
            }
            catch (e) {
                console.log('failed to poweron');
            }
        });
        this.attachToNetwork = (id) => __awaiter(this, void 0, void 0, function* () {
            // Attach server to network (usually not needed)
            try {
                yield (0, axios_1.default)({
                    method: 'POST',
                    url: `https://api.hetzner.cloud/v1/servers/${id}/actions/attach_to_network`,
                    headers: {
                        Authorization: 'Bearer ' + HETZNER_TOKEN,
                        'Content-Type': 'application/json',
                    },
                    data: {
                        network: this.networks.slice(-1)[0],
                    },
                });
            }
            catch (e) {
                console.log('failed to attach to network');
            }
        });
        this.mapServerObject = (server) => {
            var _a, _b, _c;
            //const ip = server.public_net?.ipv4?.ip;
            const ip = (_b = (_a = server.private_net) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.ip;
            return {
                id: (_c = server.id) === null || _c === void 0 ? void 0 : _c.toString(),
                pass: server.name,
                // The gateway handles SSL termination and proxies to the private IP
                host: `${this.gateway}/?ip=${ip}`,
                private_ip: ip,
                state: server.status,
                tags: Object.keys(server.labels),
                creation_date: server.created,
                originalName: server.labels.originalName,
                provider: this.id,
                large: this.isLarge,
                region: this.region,
            };
        };
    }
}
exports.Hetzner = Hetzner;
