"use strict";

// rc-apps needs app/package.json for two reasons:
// 1. its own pre-flight check reads devDependencies['@rocket.chat/apps-engine']
//    to compare against app.json's requiredApiVersion.
// 2. the Rocket.Chat Marketplace's own review infrastructure reads the
//    submitted app's package.json to pick a TypeScript compiler version, and
//    falls back to an ancient default (2.9.1, this app's original scaffold
//    version) if it doesn't find one, which can't parse modern syntax like
//    optional chaining.
//
// Generated here from the root package.json instead of hand-maintained, so
// there's exactly one real source of truth for these version numbers.

const fs = require("fs");
const path = require("path");

const rootPackageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
);

const RELEVANT_DEPENDENCIES = ["@rocket.chat/ui-kit", "@rocket.chat/icons"];

const RELEVANT_DEV_DEPENDENCIES = [
    "typescript",
    "@types/node",
    "@rocket.chat/apps-engine",
];

const appPackageJson = {
    name: rootPackageJson.name,
    dependencies: Object.fromEntries(
        RELEVANT_DEPENDENCIES.map((name) => [
            name,
            rootPackageJson.dependencies[name],
        ]),
    ),
    devDependencies: Object.fromEntries(
        RELEVANT_DEV_DEPENDENCIES.map((name) => [
            name,
            rootPackageJson.devDependencies[name],
        ]),
    ),
};

fs.writeFileSync(
    path.join(__dirname, "..", "app", "package.json"),
    JSON.stringify(appPackageJson, null, 4) + "\n",
);
