import { mergeConfig } from "vitest/config";
import config from "./vitest.config.js";
import isolated from "./vite.isolated.config.js";

export default mergeConfig(config, isolated);
