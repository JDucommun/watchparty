"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./vm/utils");
const vmManagers = (0, utils_1.getBgVMManagers)();
Object.values(vmManagers).forEach((manager) => {
    manager === null || manager === void 0 ? void 0 : manager.runBackgroundJobs();
});
