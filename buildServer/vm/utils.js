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
exports.getSessionLimitSeconds = exports.getBgVMManagers = exports.getVMManager = exports.assignVM = exports.imageName = exports.cloudInit = void 0;
const config_1 = __importDefault(require("../config"));
const scaleway_1 = require("./scaleway");
const hetzner_1 = require("./hetzner");
const digitalocean_1 = require("./digitalocean");
const docker_1 = require("./docker");
const cloudInit = (imageName, resolution = '1280x720@30', vp9 = false, hetznerCloudInit = false, h264 = false) => `#!/bin/bash
iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 5000
sed -i 's/scripts-user$/\[scripts-user, always\]/' /etc/cloud/cloud.cfg
${hetznerCloudInit
    ? `sed -i 's/scripts-user$/\[scripts-user, always\]/' /etc/cloud/cloud.cfg.d/90-hetznercloud.cfg`
    : ''}
PASSWORD=$(hostname)
# docker pull ${imageName}
docker run -d --rm --name=vbrowser -v /usr/share/fonts:/usr/share/fonts --log-opt max-size=1g --net=host --shm-size=1g --cap-add="SYS_ADMIN" -e DISPLAY=":99.0" -e NEKO_SCREEN="${resolution}" -e NEKO_PASSWORD=$PASSWORD -e NEKO_PASSWORD_ADMIN=$PASSWORD -e NEKO_BIND=":5000" -e NEKO_EPR=":59000-59100" -e NEKO_VP9="${vp9 ? 1 : 0}" -e NEKO_H264="${h264 ? 1 : 0}" ${imageName}
`;
exports.cloudInit = cloudInit;
exports.imageName = 'howardc93/vbrowser:latest';
const assignVM = (redis, vmManager) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const assignStart = Number(new Date());
        let selected = null;
        while (!selected) {
            if (process.env.NODE_ENV === 'development') {
                // This code spawns a VM if none is available in the pool
                const availableCount = yield redis.llen(vmManager.getRedisQueueKey());
                if (!availableCount) {
                    yield vmManager.startVMWrapper();
                }
            }
            let resp = yield redis.blpop(vmManager.getRedisQueueKey(), 60);
            if (!resp) {
                return undefined;
            }
            const id = resp[1];
            console.log('[ASSIGN]', id);
            const lock = yield redis.set('lock:' + vmManager.id + ':' + id, '1', 'NX', 'EX', 300);
            if (!lock) {
                console.log('failed to acquire lock on VM:', id);
                continue;
            }
            let candidate = yield vmManager.getVM(id);
            selected = candidate;
        }
        const assignEnd = Number(new Date());
        const assignElapsed = assignEnd - assignStart;
        yield redis.lpush('vBrowserStartMS', assignElapsed);
        yield redis.ltrim('vBrowserStartMS', 0, 99);
        console.log('[ASSIGN]', selected.id, assignElapsed + 'ms');
        const retVal = Object.assign(Object.assign({}, selected), { assignTime: Number(new Date()) });
        return retVal;
    }
    catch (e) {
        console.warn(e);
        return undefined;
    }
});
exports.assignVM = assignVM;
function getVMManager(provider, isLarge, region) {
    let vmManager = null;
    if (config_1.default.REDIS_URL &&
        config_1.default.SCW_SECRET_KEY &&
        config_1.default.SCW_ORGANIZATION_ID &&
        provider === 'Scaleway') {
        vmManager = new scaleway_1.Scaleway(isLarge, region);
    }
    else if (config_1.default.REDIS_URL &&
        config_1.default.HETZNER_TOKEN &&
        provider === 'Hetzner') {
        vmManager = new hetzner_1.Hetzner(isLarge, region);
    }
    else if (config_1.default.REDIS_URL && config_1.default.DO_TOKEN && provider === 'DO') {
        vmManager = new digitalocean_1.DigitalOcean(isLarge, region);
    }
    else if (config_1.default.REDIS_URL &&
        config_1.default.DOCKER_VM_HOST &&
        provider === 'Docker') {
        vmManager = new docker_1.Docker(isLarge, region);
    }
    return vmManager;
}
exports.getVMManager = getVMManager;
function getBgVMManagers() {
    return {
        // large: getVMManager(config.VM_MANAGER_ID, true, ''),
        // standard: getVMManager(config.VM_MANAGER_ID, false, ''),
        largeUS: getVMManager(config_1.default.VM_MANAGER_ID, true, 'US'),
        US: getVMManager(config_1.default.VM_MANAGER_ID, false, 'US'),
    };
}
exports.getBgVMManagers = getBgVMManagers;
function getSessionLimitSeconds(isLarge) {
    return isLarge
        ? config_1.default.VBROWSER_SESSION_SECONDS_LARGE
        : config_1.default.VBROWSER_SESSION_SECONDS;
}
exports.getSessionLimitSeconds = getSessionLimitSeconds;
